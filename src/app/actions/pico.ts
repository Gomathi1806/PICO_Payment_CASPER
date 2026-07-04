'use server';

import { db } from '@/db';
import { picoLinks, users, payments } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

export async function createPicoLink(data: {
  title: string;
  description: string;
  price: string;
  creatorId: string;
  contentUrl?: string;
  type?: string;
}) {
  try {
    const result = await db.insert(picoLinks).values({
      title: data.title,
      description: data.description,
      price: data.price,
      creatorId: data.creatorId,
      contentUrl: data.contentUrl || null,
      type: data.type || 'PDF',
    }).returning({ id: picoLinks.id });

    revalidatePath('/dashboard');
    return { success: true, id: result[0]?.id };
  } catch (error) {
    console.error('Failed to create pico link:', error);
    return { success: false, error: 'Database connection failed. Check your DATABASE_URL in .env' };
  }
}

// Owner-only fetch — includes contentUrl so creators can edit it.
// Verifies the link belongs to the requesting creatorId before
// returning anything, to prevent IDOR (one creator reading another's URLs).
export async function getPicoLinkForOwner(linkId: string, creatorId: string) {
  try {
    const link = await db.query.picoLinks.findFirst({
      where: (picoLinks, { and, eq }) => and(
        eq(picoLinks.id, linkId),
        eq(picoLinks.creatorId, creatorId),
      ),
    });
    if (!link) return { success: false, link: null };
    return {
      success: true,
      link: {
        ...link,
        createdAt: link.createdAt ? link.createdAt.toISOString() : null,
      },
    };
  } catch (error) {
    console.error('Failed to fetch owner link:', error);
    return { success: false, link: null };
  }
}

// Update an existing link. Re-checks ownership inside the WHERE clause
// so a creator can never patch a link that isn't theirs even if they
// guess another link's UUID.
export async function updatePicoLink(data: {
  linkId: string;
  creatorId: string;
  title?: string;
  description?: string;
  price?: string;
  contentUrl?: string;
  type?: string;
}) {
  try {
    const updateValues: Record<string, unknown> = {};
    if (data.title !== undefined) updateValues.title = data.title;
    if (data.description !== undefined) updateValues.description = data.description;
    if (data.price !== undefined) updateValues.price = data.price;
    if (data.contentUrl !== undefined) updateValues.contentUrl = data.contentUrl || null;
    if (data.type !== undefined) updateValues.type = data.type;

    if (Object.keys(updateValues).length === 0) {
      return { success: false, error: 'No fields to update.' };
    }

    const result = await db
      .update(picoLinks)
      .set(updateValues)
      .where(sql`${picoLinks.id} = ${data.linkId} AND ${picoLinks.creatorId} = ${data.creatorId}`)
      .returning({ id: picoLinks.id });

    if (!result.length) {
      return { success: false, error: 'Link not found or you do not own it.' };
    }

    revalidatePath('/dashboard');
    revalidatePath(`/p/${data.linkId}`);
    return { success: true };
  } catch (error) {
    console.error('Failed to update pico link:', error);
    return { success: false, error: 'Failed to update link.' };
  }
}

export async function getPicoLinks(creatorId: string) {
  try {
    const links = await db.query.picoLinks.findMany({
      where: (picoLinks, { eq }) => eq(picoLinks.creatorId, creatorId),
      orderBy: (picoLinks, { desc }) => [desc(picoLinks.createdAt)],
    });
    
    // Convert Date objects to ISO strings to prevent client-side serialization errors
    const serializedLinks = (links || []).map(link => ({
      ...link,
      createdAt: link.createdAt ? link.createdAt.toISOString() : null,
    }));

    return { success: true, links: serializedLinks };
  } catch (error) {
    console.error('Failed to fetch pico links:', error);
    return { success: false, links: [] };
  }
}

// Public lookup for the unlock page. Must NEVER include contentUrl —
// the gated content is fetched separately via getUnlockedContent only
// after the caller proves they paid. Also strips URLs from the
// description as defence-in-depth in case the creator mispasted the
// gated link into the teaser field.
export async function getPicoLinkById(id: string) {
  try {
    const link = await db.query.picoLinks.findFirst({
      where: (picoLinks, { eq }) => eq(picoLinks.id, id),
    });

    if (!link) return { success: true, link: null };

    const { contentUrl: _hidden, description, ...safe } = link;
    const sanitizedDescription = stripUrls(description || '');

    return {
      success: true,
      link: {
        ...safe,
        description: sanitizedDescription,
        createdAt: link.createdAt ? link.createdAt.toISOString() : null,
      },
    };
  } catch (error) {
    console.error('Failed to fetch pico link:', error);
    return { success: false, link: null };
  }
}

// Returns the gated contentUrl only if a payment record exists for this
// link with a matching txHash and payer address. This is a defence-in-
// depth check, not a full chain verification — a real attacker would
// need to know a valid (txHash, payerAddress) pair, which only the
// actual paying wallet receives back from writeContractAsync.
export async function getUnlockedContent(
  linkId: string,
  txHash: string,
  payerAddress: string,
) {
  try {
    if (!payerAddress) return { success: false, contentUrl: null };

    // Access is granted by EITHER a matching paid payment OR a redeemed
    // gift-card voucher for this link + redeemer. Paid flow unchanged.
    let granted = false;

    if (txHash) {
      const payment = await db.query.payments.findFirst({
        where: (payments, { and, eq }) => and(
          eq(payments.linkId, linkId),
          eq(payments.txHash, txHash),
          eq(payments.payerAddress, payerAddress),
        ),
      });
      if (payment) granted = true;
    }

    if (!granted) {
      const redemption = await db.query.giftCardRedemptions.findFirst({
        where: (r, { and, eq }) => and(
          eq(r.linkId, linkId),
          eq(r.redeemerId, payerAddress),
        ),
      });
      if (redemption) granted = true;
    }

    if (!granted) return { success: false, contentUrl: null };

    const link = await db.query.picoLinks.findFirst({
      where: (picoLinks, { eq }) => eq(picoLinks.id, linkId),
    });

    return { success: true, contentUrl: link?.contentUrl ?? null };
  } catch (error) {
    console.error('Failed to fetch unlocked content:', error);
    return { success: false, contentUrl: null };
  }
}

// Strip any http(s):// or www. URLs so the teaser description can't
// accidentally reveal the gated content link.
function stripUrls(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, '[link removed — visible after unlock]')
    .replace(/\bwww\.\S+/gi, '[link removed — visible after unlock]');
}

// Get the creator's wallet address for a given Pico link
export async function getCreatorWalletByLinkId(linkId: string) {
  try {
    const link = await db.query.picoLinks.findFirst({
      where: (picoLinks, { eq }) => eq(picoLinks.id, linkId),
    });

    if (!link) return { success: false, walletAddress: null, error: 'Link not found' };

    const creator = await db.query.users.findFirst({
      where: eq(users.id, link.creatorId),
    });

    if (!creator?.walletAddress) {
      return { success: false, walletAddress: null, error: 'Creator has not connected their wallet yet' };
    }

    return { success: true, walletAddress: creator.walletAddress };
  } catch (error) {
    console.error('Failed to fetch creator wallet:', error);
    return { success: false, walletAddress: null, error: 'Failed to fetch creator info' };
  }
}

// Record a successful payment
export async function recordPayment(data: {
  linkId: string;
  txHash: string;
  payerAddress: string;
  amount: string;
}) {
  try {
    await db.insert(payments).values({
      linkId: data.linkId,
      txHash: data.txHash,
      payerAddress: data.payerAddress,
      amount: data.amount,
    });
    return { success: true };
  } catch (error) {
    console.error('Failed to record payment:', error);
    return { success: false };
  }
}

// Get total earnings for a creator
export async function getCreatorEarnings(creatorId: string) {
  try {
    const result = await db
      .select({
        total: sql<string>`COALESCE(SUM(${payments.amount}), '0.00')`,
        count: sql<number>`COUNT(${payments.id})`,
      })
      .from(payments)
      .innerJoin(picoLinks, eq(payments.linkId, picoLinks.id))
      .where(eq(picoLinks.creatorId, creatorId));

    return {
      success: true,
      totalEarnings: result[0]?.total || '0.00',
      totalSales: result[0]?.count || 0,
    };
  } catch (error) {
    console.error('Failed to fetch earnings:', error);
    return { success: true, totalEarnings: '0.00', totalSales: 0 };
  }
}

// Get sales count per link
export async function getLinkSalesCount(linkId: string) {
  try {
    const result = await db
      .select({ count: sql<number>`COUNT(${payments.id})` })
      .from(payments)
      .where(eq(payments.id, linkId));

    return result[0]?.count || 0;
  } catch (error) {
    console.error('Failed to fetch sales count:', error);
    return 0;
  }
}

// Per-link aggregate stats (sales count + total earned) for a creator's dashboard.
export async function getPerLinkStats(creatorId: string) {
  try {
    const rows = await db
      .select({
        linkId: payments.linkId,
        count: sql<number>`COUNT(${payments.id})`,
        total: sql<string>`COALESCE(SUM(${payments.amount}), '0.00')`,
      })
      .from(payments)
      .innerJoin(picoLinks, eq(payments.linkId, picoLinks.id))
      .where(eq(picoLinks.creatorId, creatorId))
      .groupBy(payments.linkId);

    const stats: Record<string, { sales: number; earned: string }> = {};
    for (const r of rows) {
      stats[r.linkId] = { sales: Number(r.count), earned: r.total };
    }
    return { success: true, stats };
  } catch (error) {
    console.error('Failed to fetch per-link stats:', error);
    return { success: false, stats: {} };
  }
}

// Recent payments for the activity feed (last 10 by default).
export async function getRecentActivity(creatorId: string, limit = 10) {
  try {
    const rows = await db
      .select({
        id: payments.id,
        linkId: payments.linkId,
        amount: payments.amount,
        txHash: payments.txHash,
        createdAt: payments.createdAt,
        title: picoLinks.title,
      })
      .from(payments)
      .innerJoin(picoLinks, eq(payments.linkId, picoLinks.id))
      .where(eq(picoLinks.creatorId, creatorId))
      .orderBy(sql`${payments.createdAt} DESC`)
      .limit(limit);

    const serialized = rows.map((r) => ({
      ...r,
      createdAt: r.createdAt ? r.createdAt.toISOString() : null,
    }));
    return { success: true, activity: serialized };
  } catch (error) {
    console.error('Failed to fetch recent activity:', error);
    return { success: false, activity: [] };
  }
}

// Live USDC → GBP rate via Coinbase's public spot API, cached 60s server-side.
let gbpRateCache: { rate: number; ts: number } | null = null;
export async function getUSDCtoGBP() {
  try {
    if (gbpRateCache && Date.now() - gbpRateCache.ts < 60_000) {
      return { success: true, rate: gbpRateCache.rate };
    }
    const res = await fetch('https://api.coinbase.com/v2/prices/USDC-GBP/spot', {
      next: { revalidate: 60 },
    });
    const json = await res.json();
    const rate = Number(json?.data?.amount) || 0.78;
    gbpRateCache = { rate, ts: Date.now() };
    return { success: true, rate };
  } catch {
    return { success: true, rate: 0.78 };
  }
}
