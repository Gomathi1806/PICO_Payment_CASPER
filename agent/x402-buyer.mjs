#!/usr/bin/env node
// ─── Pico standard-x402 buyer (gasless, WCSPR) ──────────────
// The third way to buy from Pico, and the most ecosystem-native:
// the STANDARD x402 protocol flow settled by the official CSPR.cloud
// facilitator. Unlike agent/buyer.js (which signs and broadcasts a
// native-transfer deploy and pays gas), this client only SIGNS an
// EIP-712 authorization for WCSPR — the facilitator submits the
// on-chain transaction and pays the gas. Pure signature → paid.
//
//   node agent/x402-buyer.mjs --link <id>       # buy one link
//   node agent/x402-buyer.mjs                   # buy first catalog item
//
// Env:
//   PICO_BASE_URL          Pico deployment (default http://localhost:3000)
//   CASPER_AGENT_KEY_PATH  PEM from `npm run agent:keygen` (must hold WCSPR)
//
// ESM on purpose: @make-software/casper-x402's CJS build has a broken
// casper-js-sdk v5 interop; the ESM build works.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  x402Client,
  x402HTTPClient,
  wrapFetchWithPayment,
} from '@x402/fetch';
import { createClientCasperSigner } from '@make-software/casper-x402';
import { ExactCasperScheme } from '@make-software/casper-x402/exact/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.PICO_BASE_URL || 'http://localhost:3000';
const KEY_PATH =
  process.env.CASPER_AGENT_KEY_PATH || path.join(__dirname, 'keys', 'agent-secret.pem');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--link') args.link = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

console.log('🤖 Pico x402 buyer (standard protocol, WCSPR via CSPR.cloud facilitator)');
console.log(`   store : ${BASE_URL}`);
console.log(`   key   : ${KEY_PATH}`);

// Pick a link: --link or first catalog item.
let linkId = args.link;
if (!linkId) {
  const catalog = await fetch(new URL('/api/casper/discover', BASE_URL)).then((r) => r.json());
  if (!catalog.items?.length) {
    console.error('❌ Catalog empty — create a link with a Casper-enabled creator first.');
    process.exit(1);
  }
  linkId = catalog.items[0].id;
  console.log(`   link  : ${catalog.items[0].title} [${linkId.slice(0, 8)}]`);
}

// Signer from the agent's PEM (ed25519 default) + casper x402 scheme.
const signer = await createClientCasperSigner(KEY_PATH);

// Prefer Casper if the server offers several networks in one quote.
const preferCasper = (_v, options) => {
  console.log('📋 Server quoted networks:', options.map((o) => o.network).join(', '));
  return options.find((o) => o.network.startsWith('casper:')) ?? options[0];
};

const client = new x402Client(preferCasper).register('casper:*', new ExactCasperScheme(signer));
const fetchWithPayment = wrapFetchWithPayment(fetch, client);

const url = new URL(`/api/content/${linkId}`, BASE_URL).toString();
console.log(`🌐 GET ${url}\n`);

const response = await fetchWithPayment(url, { method: 'GET' });
if (!response.ok) {
  console.error(`❌ HTTP ${response.status}:`, (await response.text()).slice(0, 300));
  process.exit(1);
}
const body = await response.json();

console.log('✅ Unlocked!');
console.log('   title      :', body.title);
console.log('   contentUrl :', body.contentUrl);

const settle = new x402HTTPClient(client).getPaymentSettleResponse((name) =>
  response.headers.get(name),
);
if (settle) {
  console.log('\n💰 Settlement:', JSON.stringify(settle, null, 2));
  if (settle.transaction) {
    console.log(`🔗 https://testnet.cspr.live/deploy/${settle.transaction}`);
  }
}
