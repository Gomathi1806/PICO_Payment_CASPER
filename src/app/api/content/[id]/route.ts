import { NextRequest, NextResponse, after } from 'next/server';
import { db } from '@/db';
import { isUuid } from '@/lib/utils/uuid';
import { picoLinks, users, payments, widgetViews } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { withDynamicX402, settlementChainLabel } from '@/lib/x402-config';
import type { SettleResponse } from '@x402/core/types';
import { CLPublicKey } from 'casper-js-sdk';

/**
 * x402 paywalled content endpoint.
 *
 *   GET /api/content/[id]
 *     • No payment header → 402 Payment Required (paywall config returned)
 *     • Valid payment header → 200 { contentUrl, title }
 *
 * This is the endpoint the publisher embed.js fetches. With x402-fetch
 * wrapping it on the client side, the reader's wallet auto-signs the
 * payment and retries the request — no popup, no postMessage. The
 * gated contentUrl is only revealed once the facilitator confirms the
 * on-chain settlement.
 *
 * Phase 1: payTo = creator's wallet directly (100% to creator, no
 * Pico fee on x402 flows yet). The atomic 95/5 split happens on the
 * direct /p/[id] page via EIP-5792 batched calls, not here. See
 * src/lib/x402-config.ts for the rationale.
 */

async function loadLink(linkId: string) {
  if (!isUuid(linkId)) return null;

  const link = await db.query.picoLinks.findFirst({
    where: (picoLinks, { eq }) => eq(picoLinks.id, linkId),
  });
  if (!link) return null;

  const creator = await db.query.users.findFirst({
    where: eq(users.id, link.creatorId),
  });
  if (!creator) return null;

  // Standard Casper x402 payTo: '00'-prefixed account hash (Key::Account
  // serialization), derived from the creator's saved public key.
  let casperPayTo: string | null = null;
  if (creator.casperPublicKey) {
    try {
      const accountHash = Buffer.from(
        CLPublicKey.fromHex(creator.casperPublicKey).toAccountHash(),
      ).toString('hex');
      casperPayTo = `00${accountHash}`;
    } catch {
      casperPayTo = null;
    }
  }

  // The paywall needs at least ONE payable rail: an EVM wallet for the
  // USDC scheme or a Casper key for the WCSPR scheme.
  if (!creator.walletAddress && !casperPayTo) return null;

  return {
    link,
    creatorWallet: (creator.walletAddress as `0x${string}`) ?? null,
    casperPayTo,
  };
}

/** What the resolver hands back to onSettled so it needs no second query. */
type UnlockMeta = { linkId: string; priceUsd: string };

/** Pull the link id out of /api/content/[id] — withDynamicX402 wraps us,
 *  so we never get `params`. */
function linkIdFromUrl(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  return segments[segments.length - 1];
}

const handler = async (req: NextRequest) => {
  const id = linkIdFromUrl(req.url);

  const loaded = await loadLink(id);
  if (!loaded) {
    return NextResponse.json({ error: 'Link not found.' }, { status: 404 });
  }

  return NextResponse.json({
    contentUrl: loaded.link.contentUrl,
    title: loaded.link.title,
    type: loaded.link.type,
  });
};

/**
 * Record the unlock once the facilitator has settled, so the dashboard
 * activity feed picks it up with the real on-chain hash.
 *
 * This used to run inside the handler with `tx_hash: 'x402:pending'` and
 * `payer_address: 'x402:unknown'`, because @x402/next doesn't hand the
 * settlement to the handler — and the handler runs BEFORE settlement, so
 * a payment that failed to settle still got a row. withDynamicX402 now
 * decodes the PAYMENT-RESPONSE header and calls us only on success, with
 * the transaction hash, the payer and the network that actually paid.
 */
async function recordSettlement(settle: SettleResponse, meta: UnlockMeta | undefined) {
  if (!meta) return;

  const chain = settlementChainLabel(settle.network);
  try {
    // One settlement, one row: a client retrying the same X-Payment
    // header must not be billed a second row.
    const existing = await db.query.payments.findFirst({
      where: (payments, { and, eq }) => and(
        eq(payments.linkId, meta.linkId),
        eq(payments.txHash, settle.transaction),
      ),
    });
    if (existing) return;

    await db.insert(payments).values({
      linkId: meta.linkId,
      txHash: settle.transaction,
      payerAddress: settle.payer ?? 'x402:unknown',
      amount: meta.priceUsd,
      chain,
    });
  } catch (e) {
    console.warn('[pico/x402] payment record insert failed:', e);
  }
}

export const GET = withDynamicX402<UnlockMeta>(handler, async (req) => {
  const id = linkIdFromUrl(req.url);
  const loaded = await loadLink(id);
  if (!loaded) return null; // 404 path runs through the unguarded handler

  // Log the impression after the response is sent. resolve() runs on
  // every request — whether it ends in 402 or 200 — so this counts
  // every time a reader sees the paywall and gives publishers a real
  // conversion funnel (views vs payments) in the widget dashboard.
  // after() is the Next.js 15+ primitive that defers the work until
  // after the response is flushed, so the user never waits on the DB.
  const referrer = req.headers.get('referer');
  const userAgent = req.headers.get('user-agent');
  after(async () => {
    try {
      await db.insert(widgetViews).values({
        linkId: id,
        referrer: referrer?.slice(0, 500) ?? null,
        userAgent: userAgent?.slice(0, 500) ?? null,
      });
    } catch (e) {
      console.warn('[pico/x402] widget_views insert failed:', e);
    }
  });

  return {
    price: `$${loaded.link.price}`,
    payTo: loaded.creatorWallet,
    description: `Unlock: ${loaded.link.title}`,
    casperPayTo: loaded.casperPayTo,
    meta: { linkId: id, priceUsd: loaded.link.price },
  };
}, recordSettlement);
