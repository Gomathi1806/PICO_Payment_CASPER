'use server';

import { db } from '@/db';
import { giftCardRedemptions, giftCards, picoLinks, users } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { createWalletClient, http, publicActions, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { USDC_MAINNET_ADDRESS, ERC20_ABI } from '@/lib/constants';
import { auth } from '@/auth';
import { isAdmin } from '@/lib/roles';

/**
 * Creator settlement job.
 *
 * Promo (Pico-funded) unlocks are recorded with settled=false — meaning
 * Pico OWES the creator that amount. This job pays those debts from
 * Pico's OWN treasury wallet, in batches per creator, then marks the
 * redemptions settled. No buyer money is involved at any point; this is
 * Pico spending its own marketing budget on a payable it already owes.
 *
 * Requires TREASURY_PRIVATE_KEY (server-only) for a funded Base wallet.
 * If it's not configured the job no-ops cleanly so nothing breaks.
 */

const RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

type SettlementResult = {
  success: boolean;
  settledCount: number;
  paidCreators: number;
  totalUsdc: string;
  error?: string;
  details?: { creator: string; amount: string; tx: string }[];
};

export async function settleCreatorPromos(): Promise<SettlementResult> {
  const key = process.env.TREASURY_PRIVATE_KEY?.trim();
  if (!key) {
    return {
      success: false,
      settledCount: 0,
      paidCreators: 0,
      totalUsdc: '0.00',
      error: 'TREASURY_PRIVATE_KEY not configured — nothing settled.',
    };
  }

  try {
    // Pull every unsettled, Pico-funded redemption + the creator wallet
    // it should pay (redemption → link → creator user → walletAddress).
    const rows = await db
      .select({
        redemptionId: giftCardRedemptions.id,
        amount: giftCardRedemptions.valueUsed,
        creatorWallet: users.walletAddress,
      })
      .from(giftCardRedemptions)
      .innerJoin(giftCards, eq(giftCards.id, giftCardRedemptions.giftCardId))
      .innerJoin(picoLinks, eq(picoLinks.id, giftCardRedemptions.linkId))
      .innerJoin(users, eq(users.id, picoLinks.creatorId))
      .where(
        and(
          eq(giftCardRedemptions.settled, false),
          eq(giftCards.prefunded, false), // only Pico-owed promos need paying
        ),
      );

    if (rows.length === 0) {
      return { success: true, settledCount: 0, paidCreators: 0, totalUsdc: '0.00', details: [] };
    }

    // Group amounts owed + redemption ids per creator wallet.
    const byCreator = new Map<string, { total: number; ids: string[] }>();
    for (const r of rows) {
      if (!r.creatorWallet) continue; // creator has no wallet → skip (stays unsettled)
      const entry = byCreator.get(r.creatorWallet) ?? { total: 0, ids: [] };
      entry.total += Number(r.amount);
      entry.ids.push(r.redemptionId);
      byCreator.set(r.creatorWallet, entry);
    }

    const account = privateKeyToAccount(key as `0x${string}`);
    const client = createWalletClient({
      account,
      chain: base,
      transport: http(RPC_URL),
    }).extend(publicActions);

    const details: { creator: string; amount: string; tx: string }[] = [];
    let settledCount = 0;
    let totalUsdc = 0;

    for (const [creatorWallet, { total, ids }] of byCreator) {
      if (total <= 0) continue;
      const units = parseUnits(total.toFixed(6), 6);

      // Send the owed USDC from treasury → creator.
      const txHash = await client.writeContract({
        address: USDC_MAINNET_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [creatorWallet as `0x${string}`, units],
      });

      // Confirm before marking settled — avoid marking on a dropped tx.
      await client.waitForTransactionReceipt({ hash: txHash });

      await db
        .update(giftCardRedemptions)
        .set({ settled: true, settlementTx: txHash })
        .where(inArray(giftCardRedemptions.id, ids));

      details.push({ creator: creatorWallet, amount: total.toFixed(2), tx: txHash });
      settledCount += ids.length;
      totalUsdc += total;
    }

    return {
      success: true,
      settledCount,
      paidCreators: details.length,
      totalUsdc: totalUsdc.toFixed(2),
      details,
    };
  } catch (error) {
    console.error('[settlement] failed:', error);
    return {
      success: false,
      settledCount: 0,
      paidCreators: 0,
      totalUsdc: '0.00',
      error: error instanceof Error ? error.message : 'Settlement failed.',
    };
  }
}

/**
 * Manual reconciliation — mark outstanding promo debts as settled WITHOUT
 * an on-chain transfer. Use after paying creators by hand (e.g. from
 * Coinbase). Admin-gated for defence in depth. No treasury key needed.
 */
export async function markPromosSettledManually() {
  const session = await auth();
  const allowed = await isAdmin(session?.user?.id, session?.user?.email ?? undefined);
  if (!allowed) {
    return { success: false, settledCount: 0, error: 'Not authorized.' };
  }

  try {
    const rows = await db
      .select({ id: giftCardRedemptions.id })
      .from(giftCardRedemptions)
      .innerJoin(giftCards, eq(giftCards.id, giftCardRedemptions.giftCardId))
      .where(and(eq(giftCardRedemptions.settled, false), eq(giftCards.prefunded, false)));

    if (rows.length === 0) {
      return { success: true, settledCount: 0 };
    }

    await db
      .update(giftCardRedemptions)
      .set({ settled: true, settlementTx: 'manual' })
      .where(inArray(giftCardRedemptions.id, rows.map((r) => r.id)));

    return { success: true, settledCount: rows.length };
  } catch (error) {
    console.error('[settlement] manual settle failed:', error);
    return { success: false, settledCount: 0, error: 'Manual settlement failed.' };
  }
}

/** Total USDC Pico currently owes creators for unsettled promos. */
export async function getOutstandingPromoLiability() {
  try {
    const rows = await db
      .select({ amount: giftCardRedemptions.valueUsed })
      .from(giftCardRedemptions)
      .innerJoin(giftCards, eq(giftCards.id, giftCardRedemptions.giftCardId))
      .where(and(eq(giftCardRedemptions.settled, false), eq(giftCards.prefunded, false)));
    const total = rows.reduce((s, r) => s + Number(r.amount), 0);
    return { success: true, outstanding: total.toFixed(2), count: rows.length };
  } catch (error) {
    console.error('[settlement] liability query failed:', error);
    return { success: false, outstanding: '0.00', count: 0 };
  }
}
