'use server';

import { db } from '@/db';
import { picoLinks, users, giftCards, giftCardRedemptions } from '@/db/schema';
import { and, eq, gte, sql } from 'drizzle-orm';
import { createPublicClient, http, parseUnits, parseAbiItem, parseEventLogs } from 'viem';
import { base } from 'viem/chains';
import { randomBytes } from 'crypto';
import { USDC_MAINNET_ADDRESS, PICO_TREASURY_ADDRESS, splitFee } from '@/lib/constants';

const RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

// Guardrails for the Pico-funded free unlock (when enabled): only cheap
// items qualify, and a daily budget caps how much float can be spent.
const FREE_UNLOCK_MAX_PRICE = Number(process.env.NEXT_PUBLIC_FREE_UNLOCK_MAX_PRICE || '1.00');
const FREE_UNLOCK_DAILY_BUDGET = Number(process.env.FREE_UNLOCK_DAILY_BUDGET || '50.00');
const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

// Pico-funded free first unlock is OFF by default (launch = Option 1:
// creator giveaways + fan gifts only, which cost Pico nothing and need
// no treasury payouts). Flip NEXT_PUBLIC_ENABLE_FREE_FIRST_UNLOCK=true
// later to switch the welcome voucher on.
const FREE_FIRST_UNLOCK_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_FREE_FIRST_UNLOCK === 'true';

// Short, unguessable, URL-safe coupon code.
function genCode(): string {
  return randomBytes(9).toString('base64url'); // ~12 chars
}

// Confirm an on-chain USDC payment of >= `amount` to `recipient` in tx.
// Used when a fan funds a gift card — the money goes straight to the
// creator, and we only mint the voucher once we've verified it landed.
async function verifyUsdcPayment(
  txHash: string,
  recipient: string,
  minUnits: bigint,
): Promise<boolean> {
  try {
    const client = createPublicClient({ chain: base, transport: http(RPC_URL) });
    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
    if (receipt.status !== 'success') return false;

    const logs = parseEventLogs({ abi: [TRANSFER_EVENT], logs: receipt.logs });
    const need = minUnits;

    return logs.some((l) => {
      const sameToken = l.address.toLowerCase() === USDC_MAINNET_ADDRESS.toLowerCase();
      const toCreator = (l.args.to as string).toLowerCase() === recipient.toLowerCase();
      const enough = (l.args.value as bigint) >= need;
      return sameToken && toCreator && enough;
    });
  } catch (error) {
    console.error('[giftcards] verifyUsdcPayment failed:', error);
    return false;
  }
}

/**
 * Gift card (voucher) actions.
 *
 * Phase 1 ships the PROMO "welcome voucher" — a Pico-funded free first
 * unlock. The redeemer is identified by their wallet address (the
 * public payment page has no login). One free unlock per address.
 *
 * No buyer money is ever held: a promo redemption simply records that
 * Pico owes the creator the unlock price, settled later from Pico's own
 * treasury (settled=false until then). Gift/sponsor kinds (where the
 * creator is prepaid) reuse the same tables and will land in Phase 2.
 */

/**
 * Is this visitor eligible for the free first unlock?
 * Eligible when the address has never redeemed a promo voucher before.
 */
export async function getCreditEligibility(
  redeemerAddress: string | undefined,
  linkId?: string,
) {
  try {
    if (!FREE_FIRST_UNLOCK_ENABLED) return { freeFirstUnlock: false };
    if (!redeemerAddress) return { freeFirstUnlock: false };

    // Price cap — only cheap items qualify for a free unlock.
    if (linkId) {
      const link = await db.query.picoLinks.findFirst({ where: eq(picoLinks.id, linkId) });
      if (!link || Number(link.price) > FREE_UNLOCK_MAX_PRICE) {
        return { freeFirstUnlock: false };
      }
    }

    const prior = await db
      .select({ count: sql<number>`count(*)` })
      .from(giftCardRedemptions)
      .innerJoin(giftCards, eq(giftCards.id, giftCardRedemptions.giftCardId))
      .where(
        and(
          eq(giftCardRedemptions.redeemerId, redeemerAddress),
          eq(giftCards.kind, 'promo'),
        ),
      );

    const used = Number(prior[0]?.count ?? 0);
    return { freeFirstUnlock: used === 0 };
  } catch (error) {
    console.error('[giftcards] eligibility check failed:', error);
    return { freeFirstUnlock: false };
  }
}

/**
 * Redeem the Pico-funded free first unlock for a given link.
 * Grants access (writes a redemption row) and returns the gated content.
 * Re-entrancy / double-use is guarded by the per-address promo check.
 */
export async function redeemFreeUnlock(data: {
  linkId: string;
  redeemerAddress: string;
}) {
  try {
    if (!FREE_FIRST_UNLOCK_ENABLED) {
      return { success: false, error: 'Free unlock is not available.' };
    }
    const { linkId, redeemerAddress } = data;
    if (!linkId || !redeemerAddress) {
      return { success: false, error: 'Missing details.' };
    }

    // The link must exist and have a real price (don't free-unlock junk).
    const link = await db.query.picoLinks.findFirst({
      where: eq(picoLinks.id, linkId),
    });
    if (!link) return { success: false, error: 'Link not found.' };

    // Re-check eligibility server-side (never trust the client).
    const { freeFirstUnlock } = await getCreditEligibility(redeemerAddress, linkId);
    if (!freeFirstUnlock) {
      return { success: false, error: 'Free unlock not available for this item.' };
    }

    // Price cap.
    if (Number(link.price) > FREE_UNLOCK_MAX_PRICE) {
      return { success: false, error: 'This item is not eligible for a free unlock.' };
    }

    // Daily budget — cap total free-unlock value granted today.
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todays = await db
      .select({ amount: giftCardRedemptions.valueUsed })
      .from(giftCardRedemptions)
      .innerJoin(giftCards, eq(giftCards.id, giftCardRedemptions.giftCardId))
      .where(and(eq(giftCards.kind, 'promo'), gte(giftCardRedemptions.createdAt, todayStart)));
    const spentToday = todays.reduce((s, r) => s + Number(r.amount), 0);
    if (spentToday + Number(link.price) > FREE_UNLOCK_DAILY_BUDGET) {
      return { success: false, error: 'Free unlocks are all claimed for today — please try tomorrow.' };
    }

    // Mint a one-shot promo gift card scoped to this link, then redeem it.
    // Pico is the funder; prefunded=false → Pico owes the creator, settled
    // from treasury later (batched). No buyer money involved.
    const [card] = await db
      .insert(giftCards)
      .values({
        kind: 'promo',
        funderType: 'pico',
        scopeType: 'link',
        scopeId: linkId,
        totalValue: link.price,
        remaining: '0.00',
        prefunded: false,
        maxPerUser: 1,
        status: 'depleted',
      })
      .returning();

    await db.insert(giftCardRedemptions).values({
      giftCardId: card.id,
      linkId,
      redeemerId: redeemerAddress,
      valueUsed: link.price,
      settled: false,
    });

    return { success: true, contentUrl: link.contentUrl ?? null };
  } catch (error) {
    console.error('[giftcards] redeemFreeUnlock failed:', error);
    return { success: false, error: 'Could not unlock. Please try again.' };
  }
}

/** Resolve a code for the claim page: status + the link it unlocks. */
export async function getGiftCardInfo(code: string) {
  try {
    const card = await db.query.giftCards.findFirst({ where: eq(giftCards.code, code) });
    if (!card) return { found: false as const };

    let link: { id: string; title: string; type: string | null } | null = null;
    if (card.scopeType === 'link' && card.scopeId) {
      const l = await db.query.picoLinks.findFirst({ where: eq(picoLinks.id, card.scopeId) });
      if (l) link = { id: l.id, title: l.title, type: l.type };
    }

    return {
      found: true as const,
      status: card.status,
      scopeType: card.scopeType,
      linkId: card.scopeType === 'link' ? card.scopeId : null,
      remaining: card.remaining,
      link,
    };
  } catch (error) {
    console.error('[giftcards] getGiftCardInfo failed:', error);
    return { found: false as const };
  }
}

/**
 * FAN GIFT — a fan pre-pays the creator on-chain, then we mint a shareable
 * voucher. The money already went creator-direct (verified here); Pico
 * just issues the code. Scope is one creator's content.
 */
export async function buyGiftCard(data: {
  scopeType: 'creator' | 'link';
  scopeId: string;
  totalValue: string;        // USDC the fan paid
  fundingTx: string;         // the fan's on-chain payment to the creator
  funderAddress: string;
}) {
  try {
    const { scopeType, scopeId, totalValue, fundingTx, funderAddress } = data;
    if (!scopeId || !totalValue || !fundingTx) {
      return { success: false, error: 'Missing gift details.' };
    }

    // Resolve the creator wallet that should have been paid.
    let creatorId = scopeId;
    if (scopeType === 'link') {
      const link = await db.query.picoLinks.findFirst({ where: eq(picoLinks.id, scopeId) });
      if (!link) return { success: false, error: 'Link not found.' };
      creatorId = link.creatorId;
    }
    const creator = await db.query.users.findFirst({ where: eq(users.id, creatorId) });
    if (!creator?.walletAddress) {
      return { success: false, error: 'Creator has no wallet set up.' };
    }

    // Verify the fan actually paid the creator on-chain before minting.
    // When the platform fee is enabled, the creator receives the 95%
    // share (Pico's 5% goes to the treasury in a separate transfer), so
    // we verify against the creator's expected amount, not the gross.
    const totalUnits = parseUnits(totalValue, 6);
    const treasuryEnabled =
      PICO_TREASURY_ADDRESS !== '0x0000000000000000000000000000000000000000';
    const expectedCreatorUnits = treasuryEnabled
      ? splitFee(totalUnits, Number(totalValue)).creatorAmount
      : totalUnits;

    const paid = await verifyUsdcPayment(fundingTx, creator.walletAddress, expectedCreatorUnits);
    if (!paid) {
      return { success: false, error: 'Could not verify your payment on-chain yet.' };
    }

    const code = genCode();
    await db.insert(giftCards).values({
      code,
      kind: 'gift',
      funderType: 'fan',
      funderId: funderAddress,
      scopeType,
      scopeId,
      totalValue,
      remaining: totalValue,
      prefunded: true,        // creator already paid → redemptions need no settlement
      fundingTx,
      maxPerUser: 1,
      status: 'active',
    });

    return { success: true, code, claimUrl: `/claim/${code}` };
  } catch (error) {
    console.error('[giftcards] buyGiftCard failed:', error);
    return { success: false, error: 'Could not create gift. Please try again.' };
  }
}

/**
 * CREATOR GIVEAWAY — a creator hands out free unlocks of their OWN
 * content. No money moves (the creator simply forgoes revenue), so
 * redemptions are settled immediately. One shareable code, redeemable
 * `quantity` times (once per wallet).
 */
export async function createGiveaway(data: {
  creatorId: string;
  linkId: string;
  quantity: number;
}) {
  try {
    const { creatorId, linkId, quantity } = data;
    const link = await db.query.picoLinks.findFirst({ where: eq(picoLinks.id, linkId) });
    if (!link) return { success: false, error: 'Link not found.' };
    if (link.creatorId !== creatorId) {
      return { success: false, error: 'You can only give away your own content.' };
    }
    const qty = Math.max(1, Math.min(1000, Math.floor(quantity || 1)));
    const total = (Number(link.price) * qty).toFixed(2);

    const code = genCode();
    await db.insert(giftCards).values({
      code,
      kind: 'gift',
      funderType: 'creator',
      funderId: creatorId,
      scopeType: 'link',
      scopeId: linkId,
      totalValue: total,
      remaining: total,
      prefunded: true,        // creator's own content → nothing to settle
      maxPerUser: 1,
      status: 'active',
    });

    return { success: true, code, claimUrl: `/claim/${code}`, quantity: qty };
  } catch (error) {
    console.error('[giftcards] createGiveaway failed:', error);
    return { success: false, error: 'Could not create giveaway. Please try again.' };
  }
}

/**
 * Redeem a coded voucher (gift or giveaway) against a link. Validates
 * scope, prevents the same wallet redeeming twice, and atomically
 * decrements the balance so a code can't be over-spent under load.
 */
export async function redeemByCode(data: {
  code: string;
  linkId: string;
  redeemerAddress: string;
}) {
  try {
    const { code, linkId, redeemerAddress } = data;
    if (!code || !linkId || !redeemerAddress) {
      return { success: false, error: 'Missing details.' };
    }

    const card = await db.query.giftCards.findFirst({ where: eq(giftCards.code, code) });
    if (!card || card.status !== 'active') {
      return { success: false, error: 'This code is not valid.' };
    }
    if (card.expiresAt && card.expiresAt.getTime() < Date.now()) {
      return { success: false, error: 'This code has expired.' };
    }

    const link = await db.query.picoLinks.findFirst({ where: eq(picoLinks.id, linkId) });
    if (!link) return { success: false, error: 'Link not found.' };

    // Scope check — the code must apply to this content.
    if (card.scopeType === 'link' && card.scopeId !== linkId) {
      return { success: false, error: 'This code is not valid for this content.' };
    }
    if (card.scopeType === 'creator' && card.scopeId !== link.creatorId) {
      return { success: false, error: 'This code is not valid for this content.' };
    }

    // One redemption per wallet per code.
    const already = await db.query.giftCardRedemptions.findFirst({
      where: and(
        eq(giftCardRedemptions.giftCardId, card.id),
        eq(giftCardRedemptions.redeemerId, redeemerAddress),
      ),
    });
    if (already) {
      return { success: true, contentUrl: link.contentUrl ?? null }; // idempotent re-unlock
    }

    // Atomic conditional decrement — only succeeds if enough remains.
    const price = link.price;
    const updated = await db
      .update(giftCards)
      .set({ remaining: sql`${giftCards.remaining} - ${price}` })
      .where(
        and(
          eq(giftCards.id, card.id),
          eq(giftCards.status, 'active'),
          gte(giftCards.remaining, price),
        ),
      )
      .returning();

    if (!updated.length) {
      return { success: false, error: 'This code has no balance left.' };
    }

    await db.insert(giftCardRedemptions).values({
      giftCardId: card.id,
      linkId,
      redeemerId: redeemerAddress,
      valueUsed: price,
      settled: true,          // gift/giveaway are prefunded — nothing owed
    });

    // Mark depleted once it can't cover another unlock at this price.
    if (Number(updated[0].remaining) < Number(price)) {
      await db.update(giftCards).set({ status: 'depleted' }).where(eq(giftCards.id, card.id));
    }

    return { success: true, contentUrl: link.contentUrl ?? null };
  } catch (error) {
    console.error('[giftcards] redeemByCode failed:', error);
    return { success: false, error: 'Could not redeem. Please try again.' };
  }
}
