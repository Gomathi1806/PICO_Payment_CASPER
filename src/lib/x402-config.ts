import { createFacilitatorConfig } from '@coinbase/x402';
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { ExactCasperScheme } from '@make-software/casper-x402/exact/server';
import { withX402 } from '@x402/next';
import { NextRequest, NextResponse } from 'next/server';
import { ACTIVE_CASPER_NETWORK } from '@/lib/casper/config';
import { getCsprUsdRate } from '@/lib/casper/price';

/**
 * x402 facilitator setup.
 *
 * Ported from the Farcaster Pico project's lib/x402-config.ts and
 * adapted for pico-payment's use case: the payTo address is dynamic
 * per request (the creator's wallet for the given Pico link), not a
 * single fixed operator address.
 *
 * Phase 1 limitation: x402 sends payment to ONE address per request.
 * To preserve Pico's 5% revenue share, we'd need a router/splitter
 * contract. For now, x402 routes pay 100% to the creator. The direct
 * /p/[id] page keeps using EIP-5792 atomic batched calls which DO
 * collect the 5% fee — that's the hybrid model. Phase 2 will deploy
 * a PicoRouter contract and switch payTo to that.
 */

const NETWORK_ALIAS: Record<string, 'eip155:8453' | 'eip155:84532'> = {
  base: 'eip155:8453',
  'eip155:8453': 'eip155:8453',
  'base-sepolia': 'eip155:84532',
  'eip155:84532': 'eip155:84532',
};

export const DEFAULT_NETWORK = (NETWORK_ALIAS[
  (process.env.X402_NETWORK?.trim() || 'base-sepolia').toLowerCase()
] ?? 'eip155:84532') as string;

// ─── Casper x402 (standard scheme via CSPR.cloud facilitator) ──
// The official Casper x402 facilitator settles CEP-18 payments
// (WCSPR) authorized by EIP-712 signatures — the payer signs off-chain
// and never spends gas. Requires a CSPR.cloud access token.
// https://docs.cspr.cloud/x402-facilitator-api/reference

export const CASPER_CAIP2 =
  ACTIVE_CASPER_NETWORK === 'casper' ? 'casper:casper' : 'casper:casper-test';

// Wrapped CSPR (CEP-18) package hashes. Testnet hash verified on-chain
// (query_global_state → name "Wrapped CSPR", symbol WCSPR, 9 decimals).
const WCSPR_PACKAGE_HASH: Record<string, string | null> = {
  'casper:casper-test':
    process.env.CASPER_WCSPR_PACKAGE_HASH_TESTNET ||
    '3d80df21ba4ee4d66a2a1f60c32570dd5685e4b279f6538162a5fd1314847c1e',
  'casper:casper': process.env.CASPER_WCSPR_PACKAGE_HASH_MAINNET || null,
};

const CSPR_CLOUD_FACILITATOR_URL =
  process.env.CSPR_CLOUD_FACILITATOR_URL || 'https://x402-facilitator.cspr.cloud';

export const casperX402Enabled = (): boolean =>
  !!process.env.CSPR_CLOUD_ACCESS_TOKEN && !!WCSPR_PACKAGE_HASH[CASPER_CAIP2];

function makeCasperFacilitatorClient(): HTTPFacilitatorClient {
  const auth = { Authorization: process.env.CSPR_CLOUD_ACCESS_TOKEN! };
  return new HTTPFacilitatorClient({
    url: CSPR_CLOUD_FACILITATOR_URL,
    createAuthHeaders: async () => ({
      verify: auth,
      settle: auth,
      supported: auth,
      bazaar: auth,
    }),
  });
}

// Two facilitators for EVM (CDP-backed + public x402.org fallback),
// plus CSPR.cloud for the Casper scheme when a token is configured.
const facilitatorClients = [
  new HTTPFacilitatorClient(
    createFacilitatorConfig(
      process.env.CDP_API_KEY_ID,
      process.env.CDP_API_KEY_SECRET,
    ),
  ),
  new HTTPFacilitatorClient({ url: 'https://www.x402.org/facilitator' }),
  ...(casperX402Enabled() ? [makeCasperFacilitatorClient()] : []),
];

export const x402Server = new x402ResourceServer(facilitatorClients);

let initialized = false;
export async function ensureX402Ready() {
  if (initialized) return;

  // Same env-var fixup as the Farcaster project: env loaders sometimes
  // escape \n as the literal characters, which breaks PEM parsing.
  if (process.env.CDP_API_KEY_SECRET) {
    process.env.CDP_API_KEY_SECRET = process.env.CDP_API_KEY_SECRET.trim().replace(/\\n/g, '\n');
  }
  if (process.env.CDP_API_KEY_ID) {
    process.env.CDP_API_KEY_ID = process.env.CDP_API_KEY_ID.trim();
  }

  for (const net of ['eip155:8453', 'eip155:84532']) {
    try {
      x402Server.register(net as 'eip155:8453' | 'eip155:84532', new ExactEvmScheme());
    } catch (error) {
      console.error(`[pico/x402] Failed to register ${net}:`, error);
    }
  }

  // Casper standard x402: WCSPR (CEP-18) settled by the CSPR.cloud
  // facilitator. Prices stay in USD — the money parser converts to
  // WCSPR at the live CSPR spot rate (WCSPR is 1:1 wrapped CSPR).
  if (casperX402Enabled()) {
    try {
      const wcspr = WCSPR_PACKAGE_HASH[CASPER_CAIP2]!;
      const casperScheme = new ExactCasperScheme()
        .registerAsset(CASPER_CAIP2, wcspr, 9)
        .registerMoneyParser(async (usd, network) => {
          if (network !== CASPER_CAIP2) return null;
          const rate = await getCsprUsdRate();
          const wcsprAmount = Number(usd) / rate;
          return {
            asset: wcspr,
            amount: wcsprAmount.toFixed(9),
            extra: { name: 'Wrapped CSPR', symbol: 'WCSPR', version: '1', decimals: '9' },
          };
        });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      x402Server.register(CASPER_CAIP2 as any, casperScheme as any);
      console.log(`[pico/x402] Casper scheme registered on ${CASPER_CAIP2} (WCSPR)`);
    } catch (error) {
      console.error('[pico/x402] Failed to register Casper scheme:', error);
    }
  }

  try {
    await x402Server.initialize();
    initialized = true;
    console.log('[pico/x402] facilitator ready for all configured networks');
  } catch (error) {
    console.error('[pico/x402] initialization failed:', error);
  }
}

/**
 * Wraps a Next.js route handler with an x402 paywall whose `payTo` and
 * `price` are computed per request. The wrapped handler only runs after
 * the client has presented a valid X-Payment header for the requested
 * amount; otherwise the client gets back a 402 with the payment
 * requirements and retries via x402-fetch.
 *
 * `resolve` is called once per request and returns the per-request
 * paywall config (or null to bypass the paywall entirely — used to
 * return free preview content for visitors who haven't paid yet).
 */
export function withDynamicX402(
  handler: (req: NextRequest) => Promise<NextResponse>,
  resolve: (req: NextRequest) => Promise<
    | {
        price: string;
        /** EVM payout address — omit/null for Casper-only creators */
        payTo: `0x${string}` | null;
        description: string;
        /** '00'-prefixed Casper account hash — adds a WCSPR option when set */
        casperPayTo?: string | null;
      }
    | null
  >,
) {
  return async function (req: NextRequest) {
    try {
      await ensureX402Ready();

      const config = await resolve(req);
      if (!config) {
        // Free path — no paywall, just run the handler.
        return await handler(req);
      }

      const requestedNet =
        req.headers.get('x-x402-network') ||
        req.headers.get('X-X402-Network') ||
        DEFAULT_NETWORK;
      const targetNetwork = (NETWORK_ALIAS[requestedNet.trim().toLowerCase()] ??
        DEFAULT_NETWORK) as 'eip155:8453' | 'eip155:84532';

      // EVM readiness only matters when the creator actually has an
      // EVM wallet — Casper-only creators skip these checks entirely.
      if (config.payTo) {
        if (!x402Server.hasRegisteredScheme(targetNetwork, 'exact')) {
          return NextResponse.json(
            { error: `Network ${targetNetwork} not registered.` },
            { status: 500 },
          );
        }
        const supportedKind = x402Server.getSupportedKind(2, targetNetwork, 'exact');
        if (!supportedKind) {
          return NextResponse.json(
            { error: `x402 facilitator not ready for ${targetNetwork}.` },
            { status: 500 },
          );
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const accepts: any[] = [];
      if (config.payTo) {
        accepts.push({
          scheme: 'exact' as const,
          price: config.price,
          network: targetNetwork,
          payTo: config.payTo,
        });
      }

      // Multi-chain quote: when the creator has a Casper key and the
      // CSPR.cloud facilitator is configured, the same 402 also offers
      // WCSPR on Casper — the client picks its preferred network.
      if (
        config.casperPayTo &&
        casperX402Enabled() &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        x402Server.hasRegisteredScheme(CASPER_CAIP2 as any, 'exact')
      ) {
        accepts.push({
          scheme: 'exact' as const,
          price: config.price,
          network: CASPER_CAIP2,
          payTo: config.casperPayTo,
        });
      }

      const wrapped = withX402(
        handler,
        { accepts, description: config.description },
        x402Server,
        undefined,
        undefined,
        false,
      );

      return await wrapped(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[pico/x402] handler failed:', error);
      return NextResponse.json(
        { error: `Internal Server Error: ${message}` },
        { status: 500 },
      );
    }
  };
}
