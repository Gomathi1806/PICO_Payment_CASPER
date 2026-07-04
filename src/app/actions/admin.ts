'use server';

import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { users, picoLinks, payments } from '@/db/schema';
import { auth } from '@/auth';
import { isAdmin } from '@/lib/roles';

/**
 * Admin-only data fetches. Every action re-checks isAdmin against the
 * session AND the ADMIN_EMAILS allowlist — never trust the role
 * column alone, and never assume an authenticated user is admin.
 */

async function requireAdmin(): Promise<{ ok: true } | { ok: false }> {
  const session = await auth();
  const userId = session?.user?.id;
  const email = session?.user?.email ?? undefined;
  const allowed = await isAdmin(userId, email);
  return allowed ? { ok: true } : { ok: false };
}

export async function getPlatformStats() {
  const guard = await requireAdmin();
  if (!guard.ok) return { success: false as const };

  try {
    const [userCounts, linkCount, paymentAgg] = await Promise.all([
      db
        .select({
          role: users.role,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(users)
        .groupBy(users.role),
      db.select({ count: sql<number>`COUNT(*)::int` }).from(picoLinks),
      db
        .select({
          count: sql<number>`COUNT(*)::int`,
          total: sql<string>`COALESCE(SUM(${payments.amount}), '0.00')`,
        })
        .from(payments),
    ]);

    const usersByRole: Record<string, number> = {
      creator: 0, publisher: 0, agent: 0, admin: 0,
    };
    for (const r of userCounts) usersByRole[r.role] = Number(r.count);

    return {
      success: true as const,
      stats: {
        usersByRole,
        totalUsers: Object.values(usersByRole).reduce((a, b) => a + b, 0),
        totalLinks: Number(linkCount[0]?.count || 0),
        totalPayments: Number(paymentAgg[0]?.count || 0),
        grossVolume: paymentAgg[0]?.total || '0.00',
      },
    };
  } catch (error) {
    console.error('[admin] getPlatformStats failed:', error);
    return { success: false as const };
  }
}

export async function getPlatformRecentPayments(limit = 25) {
  const guard = await requireAdmin();
  if (!guard.ok) return { success: false as const, payments: [] };

  try {
    const rows = await db
      .select({
        id: payments.id,
        linkId: payments.linkId,
        txHash: payments.txHash,
        amount: payments.amount,
        payerAddress: payments.payerAddress,
        createdAt: payments.createdAt,
        title: picoLinks.title,
        creatorHandle: users.handle,
      })
      .from(payments)
      .innerJoin(picoLinks, sql`${payments.linkId} = ${picoLinks.id}`)
      .innerJoin(users, sql`${picoLinks.creatorId} = ${users.id}::text`)
      .orderBy(sql`${payments.createdAt} DESC`)
      .limit(limit);

    const serialized = rows.map((r) => ({
      ...r,
      createdAt: r.createdAt ? r.createdAt.toISOString() : null,
    }));
    return { success: true as const, payments: serialized };
  } catch (error) {
    console.error('[admin] getPlatformRecentPayments failed:', error);
    return { success: false as const, payments: [] };
  }
}
