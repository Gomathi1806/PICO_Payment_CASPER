import { NextRequest, NextResponse, after } from 'next/server';
import { db } from '@/db';
import { picoLinks, users, payments, widgetViews } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { withDynamicX402 } from '@/lib/x402-config';
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

const handler = async (req: NextRequest) => {
  // We don't get params directly here because withDynamicX402 wraps us.
  // Pull the id from the URL pathname.
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const id = segments[segments.length - 1];

  const loaded = await loadLink(id);
  if (!loaded) {
    return NextResponse.json({ error: 'Link not found.' }, { status: 404 });
  }

  // Record the unlock so the dashboard activity feed picks it up.
  // The X-Payment header is settled by the facilitator before we
  // reach here, so it's safe to assume the tx hash and payer address
  // can be derived from the request — but @x402/next doesn't surface
  // those cleanly, so for now we record with placeholders and rely
  // on the on-chain tx for ground truth. A future revision can call
  // facilitator.settle directly to capture the txHash.
  try {
    await db.insert(payments).values({
      linkId: id,
      txHash: req.headers.get('x-payment-tx') || 'x402:pending',
      payerAddress: req.headers.get('x-payment-from') || 'x402:unknown',
      amount: loaded.link.price,
    });
  } catch (e) {
    console.warn('[pico/x402] payment record insert failed:', e);
  }

  return NextResponse.json({
    contentUrl: loaded.link.contentUrl,
    title: loaded.link.title,
    type: loaded.link.type,
  });
};

export const GET = withDynamicX402(handler, async (req) => {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const id = segments[segments.length - 1];
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
  };
});
