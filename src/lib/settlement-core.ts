import { db } from '@/db';
import { giftCardRedemptions, giftCards, picoLinks, users } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { createWalletClient, http, publicActions, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { USDC_MAINNET_ADDRESS, ERC20_ABI } from '@/lib/constants';

/**
 * Creator settlement — the part that actually moves treasury funds.
 *
 * This deliberately lives OUTSIDE `src/app/actions`. Every export in a
 * `'use server'` file is reachable by a direct POST, so a payout routine
 * exported from one is callable by anybody who can reach the app,
 * whatever gate the caller sits behind. Keeping it in a plain module
 * means the only ways in are the two server-side callers that import it:
 * the CRON_SECRET-gated cron route, and the admin-gated action wrapper
 * in `src/app/actions/settlement.ts`.
 *
 * Promo (Pico-funded) unlocks are recorded with settled=false, meaning
 * Pico OWES the creator that amount. This pays those debts from Pico's
 * own treasury wallet, batched per creator, then marks them settled. No
 * buyer money is involved; it is Pico spending its marketing budget on a
 * payable it already owes.
 *
 * Requires TREASURY_PRIVATE_KEY (server-only) for a funded Base wallet.
 * Without it the job no-ops cleanly.
 *
 * KNOWN LIMITATION: not safe to run concurrently. Rows are marked
 * settled only after `waitForTransactionReceipt` returns, so two
 * overlapping runs can both read the same unsettled rows and pay twice.
 * The callers are serial in practice (one daily cron, one admin button),
 * but an admin clicking while the cron runs would double-pay. Fixing it
 * needs a claim step or a row lock before the transfer.
 */

const RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

export type SettlementResult = {
  success: boolean;
  settledCount: number;
  paidCreators: number;
  totalUsdc: string;
  error?: string;
  details?: { creator: string; amount: string; tx: string }[];
};

export async function runCreatorSettlement(): Promise<SettlementResult> {
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
