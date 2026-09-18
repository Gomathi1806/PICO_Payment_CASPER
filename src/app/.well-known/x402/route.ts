import { NextResponse } from 'next/server';
import { ACTIVE_CASPER_NETWORK, getCasperConfig } from '@/lib/casper/config';
import { CASPER_CAIP2, DEFAULT_NETWORK, casperX402Enabled } from '@/lib/x402-config';

/**
 * Machine-readable payment manifest — lets a crawling agent learn how
 * to transact with this site without any human documentation. Served
 * at /.well-known/x402 alongside the human-readable /llms.txt.
 */
export async function GET() {
  const config = getCasperConfig();
  return NextResponse.json({
    service: 'Pico Micropayments',
    version: 1,
    description:
      'Pay-per-unlock content links. Agents pay with native CSPR on the Casper Network via an x402-style HTTP 402 flow.',
    rails: [
      {
        scheme: 'casper-native-transfer',
        network: ACTIVE_CASPER_NETWORK,
        explorer: config.explorerUrl,
        discovery: '/api/casper/discover',
        paymentEndpoint: '/api/casper/content/{linkId}',
        flow: [
          'GET the paymentEndpoint → HTTP 402 with { accepts: [{ payTo, amountMotes, transferId }] }',
          'Send a native CSPR transfer of amountMotes to payTo with transferId as the memo',
          'Retry the GET with header X-Casper-Deploy-Hash: <your deploy hash>',
          '200 → { contentUrl, title } once the transfer is verified on-chain',
        ],
      },
      // Advertise the same networks /api/content/{linkId} actually quotes.
      ...(casperX402Enabled()
        ? [
            {
              scheme: 'exact',
              network: CASPER_CAIP2,
              asset: 'WCSPR',
              paymentEndpoint: '/api/content/{linkId}',
              note: 'Standard x402 (WCSPR, CEP-18) settled by the CSPR.cloud facilitator.',
            },
          ]
        : []),
      {
        scheme: 'exact',
        network: DEFAULT_NETWORK,
        asset: 'USDC',
        paymentEndpoint: '/api/content/{linkId}',
        note: 'EVM x402 (USDC on Base) via the standard x402 facilitator flow.',
      },
    ],
  });
}
