import { createFacilitatorConfig } from '@coinbase/x402';
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { withX402 } from '@x402/next';
import { NextRequest, NextResponse } from 'next/server';

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

// Two facilitators: CDP-backed for Coinbase networks, public x402.org as
// fallback for testnets and during local development without CDP keys.
const facilitatorClients = [
  new HTTPFacilitatorClient(
    createFacilitatorConfig(
      process.env.CDP_API_KEY_ID,
      process.env.CDP_API_KEY_SECRET,
    ),
  ),
  new HTTPFacilitatorClient({ url: 'https://www.x402.org/facilitator' }),
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
    | { price: string; payTo: `0x${string}`; description: string }
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

      const accepts = [
        {
          scheme: 'exact' as const,
          price: config.price,
          network: targetNetwork,
          payTo: config.payTo,
        },
      ];

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
