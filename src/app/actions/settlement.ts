'use server';

import { db } from '@/db';
import { giftCardRedemptions, giftCards } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { auth } from '@/auth';
import { isAdmin } from '@/lib/roles';
import { runCreatorSettlement, type SettlementResult } from '@/lib/settlement-core';

/**
 * Settlement actions for the admin dashboard.
 *
 * Every export here is reachable by a direct POST regardless of which
 * component imports it, so each one re-checks isAdmin against the
 * session AND the ADMIN_EMAILS allowlist. The routine that actually
 * moves treasury funds lives in `@/lib/settlement-core` precisely so it
 * is not exported from this file.
 */

async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  return isAdmin(session?.user?.id, session?.user?.email ?? undefined);
}

/**
 * Admin-triggered settlement run ("Settle now"). The daily Vercel Cron
 * does not come through here — it imports runCreatorSettlement directly
 * and authenticates with CRON_SECRET.
 */
export async function settleCreatorPromos(): Promise<SettlementResult> {
  if (!(await requireAdmin())) {
    return {
      success: false,
      settledCount: 0,
      paidCreators: 0,
      totalUsdc: '0.00',
      error: 'Not authorized.',
    };
  }
  return runCreatorSettlement();
}

/**
 * Manual reconciliation — mark outstanding promo debts as settled WITHOUT
 * an on-chain transfer. Use after paying creators by hand (e.g. from
 * Coinbase). Admin-gated for defence in depth. No treasury key needed.
 */
export async function markPromosSettledManually() {
  if (!(await requireAdmin())) {
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
  if (!(await requireAdmin())) {
    return { success: false, outstanding: '0.00', count: 0 };
  }

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
