import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users, type UserRole } from '@/db/schema';

/**
 * Role helpers shared across all dashboards.
 *
 * The home-route map is the single source of truth for "where does a
 * user of role X land after login" — used by the post-login redirect,
 * the post-signup redirect, and any "Go to dashboard" link.
 *
 * Admin access uses two-factor gating:
 *   1. role === 'admin' on the user row (DB)
 *   2. email present in ADMIN_EMAILS env var (deploy-time)
 * Both must pass. Defence in depth so a leaked DB write can't grant
 * admin access without also editing Vercel env.
 */

export const HOME_ROUTE_BY_ROLE: Record<UserRole, string> = {
  creator: '/dashboard',
  publisher: '/publisher',
  agent: '/agents',
  admin: '/admin',
};

export const PRODUCT_LABEL_BY_ROLE: Record<UserRole, string> = {
  creator: 'Creator',
  publisher: 'Publisher',
  agent: 'Developer / Agent',
  admin: 'Platform Admin',
};

export async function getRoleForUser(userId: string): Promise<UserRole | null> {
  try {
    const row = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { role: true },
    });
    return row?.role ?? null;
  } catch (error) {
    console.error('[roles] lookup failed', error);
    return null;
  }
}

export async function isAdmin(userId: string | undefined, email: string | undefined): Promise<boolean> {
  if (!userId || !email) return false;

  const allowlist = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!allowlist.includes(email.toLowerCase())) return false;

  const role = await getRoleForUser(userId);
  return role === 'admin';
}
