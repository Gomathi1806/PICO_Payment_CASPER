import { NextRequest, NextResponse, after } from 'next/server';
import { db } from '@/db';
import { payments, users, widgetViews } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  ACTIVE_CASPER_NETWORK,
  deployExplorerUrl,
  getCasperConfig,
  motesToCspr,
} from '@/lib/casper/config';
import {
  getDeployExecution,
  parseTransferDeploy,
  targetMatchesCreator,
} from '@/lib/casper/server';
import { getCsprUsdRate, minAcceptableMotes, usdToMotes } from '@/lib/casper/price';

/**
 * Casper-native x402-style paywalled content endpoint — the CSPR twin
 * of /api/content/[id] (which speaks EVM x402 via the Coinbase
 * facilitator). Casper's native x402 support is new, so this route
 * implements the same HTTP 402 dance directly against the node:
 *
 *   GET /api/casper/content/[id]
 *     • No payment header → 402 with machine-readable payment
 *       requirements (payTo key, amount in motes, chain name)
 *     • X-Casper-Deploy-Hash header → the deploy is fetched FROM THE
 *       NODE, checked for successful execution, correct recipient and
 *       amount, then the content is returned and the payment recorded.
 *
 * This is the endpoint autonomous agents hit: an agent gets the 402,
 * pays with its own Casper account (native transfer with the quoted
 * transfer id), retries with the deploy hash, and gets the content —
 * no browser, no human, machine-to-machine commerce on Casper.
 */

async function loadLink(linkId: string) {
  const link = await db.query.picoLinks.findFirst({
    where: (picoLinks, { eq }) => eq(picoLinks.id, linkId),
  });
  if (!link) return null;

  const creator = await db.query.users.findFirst({
    where: eq(users.id, link.creatorId),
  });
  if (!creator?.casperPublicKey) return null;

  return { link, creatorCasperKey: creator.casperPublicKey };
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const loaded = await loadLink(id);
  if (!loaded) {
    return NextResponse.json(
      { error: 'Link not found or creator has not enabled Casper payments.' },
      { status: 404 },
    );
  }
  const { link, creatorCasperKey } = loaded;

  // Count the paywall impression (mirrors the EVM route).
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
      console.warn('[pico/casper] widget_views insert failed:', e);
    }
  });

  const deployHash = req.headers
    .get('x-casper-deploy-hash')
    ?.trim()
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '');

  // ── No payment yet → 402 with the requirements ──────────────
  if (!deployHash) {
    const rate = await getCsprUsdRate();
    const config = getCasperConfig();
    const amountMotes = usdToMotes(Number(link.price), rate);
    return NextResponse.json(
      {
        error: 'Payment required',
        x402Version: 2,
        accepts: [
          {
            scheme: 'casper-native-transfer',
            network: config.chainName,
            payTo: creatorCasperKey,
            asset: 'CSPR',
            amountMotes: amountMotes.toString(),
            amountCspr: motesToCspr(amountMotes),
            priceUsd: link.price,
            transferId: parseInt(id.replace(/-/g, '').slice(0, 12), 16),
            description: `Unlock: ${link.title}`,
            instructions:
              'Send a native CSPR transfer of amountMotes to payTo with the given transferId as the memo, then retry this request with the X-Casper-Deploy-Hash header set to your deploy hash.',
          },
        ],
      },
      { status: 402 },
    );
  }

  if (deployHash.length !== 64) {
    return NextResponse.json({ error: 'Malformed X-Casper-Deploy-Hash.' }, { status: 400 });
  }

  // ── Payment presented → verify against the node ─────────────
  try {
    // Fast path: already verified and recorded (agent retry).
    const existing = await db.query.payments.findFirst({
      where: (payments, { and, eq }) => and(
        eq(payments.linkId, id),
        eq(payments.txHash, deployHash),
      ),
    });

    if (!existing) {
      const execution = await getDeployExecution(deployHash);
      if (!execution.found) {
        return NextResponse.json(
          { error: 'Deploy not found on the node yet. Retry shortly.' },
          { status: 402 },
        );
      }
      if (!execution.executed) {
        return NextResponse.json(
          { error: 'Deploy not executed yet. Retry shortly.', pending: true },
          { status: 402 },
        );
      }
      if (!execution.success) {
        return NextResponse.json(
          { error: `Deploy execution failed: ${execution.errorMessage ?? 'unknown'}` },
          { status: 402 },
        );
      }

      const { details } = parseTransferDeploy({
        deploy: (execution.deployJson as { deploy?: unknown })?.deploy ?? execution.deployJson,
      });
      if (details.deployHash !== deployHash) {
        return NextResponse.json({ error: 'Deploy hash mismatch.' }, { status: 402 });
      }
      if (!targetMatchesCreator(details.targetHex, creatorCasperKey)) {
        return NextResponse.json(
          { error: 'Transfer recipient is not this creator.' },
          { status: 402 },
        );
      }

      const rate = await getCsprUsdRate();
      if (details.amountMotes < minAcceptableMotes(Number(link.price), rate)) {
        return NextResponse.json(
          { error: 'Transfer amount below the required price.' },
          { status: 402 },
        );
      }

      await db.insert(payments).values({
        linkId: id,
        txHash: deployHash,
        payerAddress: details.senderPublicKeyHex,
        amount: link.price,
        chain: ACTIVE_CASPER_NETWORK,
      });
    }

    return NextResponse.json({
      contentUrl: link.contentUrl,
      title: link.title,
      type: link.type,
      explorerUrl: deployExplorerUrl(deployHash),
    });
  } catch (error) {
    console.error('[pico/casper] agent verification failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Verification failed: ${message}` }, { status: 500 });
  }
}
