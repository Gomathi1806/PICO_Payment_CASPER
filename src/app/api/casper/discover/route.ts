import { NextResponse } from 'next/server';
import { db } from '@/db';
import { picoLinks, users } from '@/db/schema';
import { eq, isNotNull, desc } from 'drizzle-orm';
import { ACTIVE_CASPER_NETWORK } from '@/lib/casper/config';

/**
 * Agent-facing catalog — the entry point of the autonomous purchase
 * loop. Lists every Pico link whose creator has enabled the Casper
 * rail, with just enough metadata for an agent to decide what's worth
 * paying for (title + teaser + USD price) and the 402 endpoint to hit
 * next. Never leaks contentUrl; descriptions are URL-stripped the
 * same way the human paywall page strips them.
 *
 *   GET /api/casper/discover
 *   → { network, items: [{ id, title, description, priceUsd, paymentEndpoint }] }
 */

// Same defence-in-depth as getPicoLinkById: a creator who mispasted
// the gated URL into the public teaser shouldn't leak it to agents.
function stripUrls(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, '[link removed]')
    .replace(/\bwww\.\S+/gi, '[link removed]');
}

export async function GET() {
  try {
    const rows = await db
      .select({
        id: picoLinks.id,
        title: picoLinks.title,
        description: picoLinks.description,
        price: picoLinks.price,
        type: picoLinks.type,
        creatorHandle: users.handle,
      })
      .from(picoLinks)
      .innerJoin(users, eq(users.id, picoLinks.creatorId))
      .where(isNotNull(users.casperPublicKey))
      .orderBy(desc(picoLinks.createdAt))
      .limit(100);

    return NextResponse.json({
      network: ACTIVE_CASPER_NETWORK,
      scheme: 'casper-native-transfer',
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: stripUrls(r.description ?? ''),
        priceUsd: r.price,
        type: r.type,
        creator: r.creatorHandle,
        paymentEndpoint: `/api/casper/content/${r.id}`,
      })),
    });
  } catch (error) {
    console.error('[pico/casper] discover failed:', error);
    return NextResponse.json({ error: 'Catalog unavailable.' }, { status: 500 });
  }
}
