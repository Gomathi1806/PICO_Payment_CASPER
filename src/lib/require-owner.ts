import { auth } from '@/auth';

/**
 * Authorization guard for owner-scoped Server Actions.
 *
 * Every exported function in a `'use server'` file is reachable by a
 * direct POST, whether or not any component imports it, so a page-level
 * session check does not protect the actions defined behind it. An action
 * that mutates a creator's account or their links must therefore verify
 * the caller itself and derive the subject from the session rather than
 * trusting an id supplied by the caller.
 *
 * Returns the signed-in user's id, or null when there is no session or
 * when `claimedId` names somebody else. Callers must use the returned id
 * downstream and never the argument they were handed.
 *
 * Fan-facing actions (paying for a link, redeeming a gift card, reading
 * public link data) are deliberately not guarded by this: those callers
 * are anonymous by design.
 */
export async function requireOwner(claimedId?: string): Promise<string | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  if (claimedId !== undefined && claimedId !== userId) return null;
  return userId;
}

/** Shape returned by guarded actions when the caller is not authorized. */
export const UNAUTHORIZED = {
  success: false as const,
  error: 'Not authorized.',
};
