#!/usr/bin/env node
// ─── Pico payment ticker ─────────────────────────────────────
// Turns settled payments into ready-to-post updates: every unlock
// that clears on Casper becomes one short post with a link anyone can
// check on the explorer.
//
// The point is that the account stops depending on someone thinking
// of something to say. Usage writes the posts.
//
//   npm run ticker               # queue anything new
//   npm run ticker -- --since 2026-10-01   # ignore the watermark
//   npm run ticker -- --dry-run            # print, queue nothing
//   npm run ticker -- --limit 5
//
// Each run appends to agent/ticker-queue.json, which the daily growth
// run reads and posts after the user approves. Nothing here posts
// anything by itself: it only drafts.
//
// On-chain truth beats the database — a row is only queued once its
// deploy is found executed on the node, so a post can never claim a
// payment that did not happen.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { neon } from '@neondatabase/serverless';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const STATE_PATH = path.join(HERE, '.ticker-state.json');
const QUEUE_PATH = path.join(HERE, 'ticker-queue.json');

const NETWORK = process.env.NEXT_PUBLIC_CASPER_NETWORK || 'casper-test';
const IS_TESTNET = NETWORK !== 'casper';
const RPC = process.env.CASPER_RPC_URL
  || (IS_TESTNET ? 'https://node.testnet.casper.network/rpc' : 'https://node.mainnet.casper.network/rpc');
const EXPLORER = IS_TESTNET ? 'https://testnet.cspr.live' : 'https://cspr.live';

// ─── CLI ────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};

const DRY_RUN = flag('--dry-run');
const LIMIT = Number(value('--limit') || 20);
const SINCE_OVERRIDE = value('--since');

// ─── Env ────────────────────────────────────────────────────

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const file of ['.env.local', '.env']) {
    const p = path.join(ROOT, file);
    if (!fs.existsSync(p)) continue;
    const line = fs.readFileSync(p, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('DATABASE_URL='));
    if (line) return line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL is not set and no .env file has one.');
}

// ─── On-chain check ─────────────────────────────────────────

/** True when the node has this deploy executed without error. */
async function deployExecuted(hash) {
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'info_get_transaction',
    params: { transaction_hash: { Deploy: hash } },
  };
  try {
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    const info = json?.result?.execution_info;
    if (!info) return null;
    const result = info.execution_result ?? {};
    const inner = result.Version2 ?? result.Version1 ?? {};
    if (inner.error_message) return null;
    return { blockHeight: info.block_height ?? null };
  } catch (e) {
    console.warn(`  ! node lookup failed for ${hash.slice(0, 10)}…: ${e.message}`);
    return null;
  }
}

// ─── Post copy ──────────────────────────────────────────────

// Who paid decides what we can honestly claim. An agent payment is
// the interesting one, but a human unlock must never be posted as one.
const AGENT_TEMPLATES = [
  ({ title, usd }) => `An AI agent just paid ${usd} for "${title}". No human in the loop.`,
  ({ title, usd }) => `${usd}, agent to creator, unattended. Content: "${title}".`,
  ({ title, usd }) => `Another autonomous buy: ${usd} for "${title}".`,
];

const HUMAN_TEMPLATES = [
  ({ title, usd }) => `Someone just unlocked "${title}" for ${usd}.`,
  ({ title, usd }) => `${usd} paid for "${title}" — one tap, no account.`,
];

/** Public keys we know belong to our own buyer agent. */
function agentKeys() {
  const fromEnv = (process.env.PICO_AGENT_PUBLIC_KEYS || '')
    .split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
  const keys = new Set(fromEnv);
  try {
    const require = createRequire(import.meta.url);
    const client = require('./casper-client.js');
    keys.add(client.loadKeys().publicKey.toHex().toLowerCase());
  } catch {
    // No keypair on this machine — env list (or nothing) still applies.
  }
  return keys;
}

/**
 * One payment → one post. The deploy link is the whole point: anyone
 * can check the claim in a click, which is what makes these worth
 * posting at all.
 */
function draftPost(payment, index, isAgent) {
  const usd = `$${Number(payment.amount).toFixed(2)}`;
  const title = (payment.title || 'a Pico link').slice(0, 60);
  const templates = isAgent ? AGENT_TEMPLATES : HUMAN_TEMPLATES;
  const lead = templates[index % templates.length]({ title, usd });
  const network = IS_TESTNET ? 'Casper testnet' : 'Casper mainnet';
  const line = isAgent
    ? `Quote → payment → unlock, in one request. Settled on ${network}.`
    : `Paid in CSPR, verified on-chain before it opened. ${network}.`;

  return [lead, '', line, '', `${EXPLORER}/deploy/${payment.tx_hash}`].join('\n');
}

// ─── State ──────────────────────────────────────────────────

const readJson = (p, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
};

// ─── Main ───────────────────────────────────────────────────

async function main() {
  const sql = neon(databaseUrl());
  const state = readJson(STATE_PATH, { lastSeen: null, queued: [] });
  const since = SINCE_OVERRIDE || state.lastSeen || '1970-01-01T00:00:00Z';

  console.log('🎟  Pico payment ticker');
  console.log(`   network : ${NETWORK}`);
  console.log(`   since   : ${since}`);

  const rows = await sql`
    select p.tx_hash, p.payer_address, p.amount, p.created_at, p.chain, l.title
    from payments p
    left join pico_links l on l.id = p.link_id
    where p.created_at > ${since}
    order by p.created_at asc
    limit ${LIMIT}
  `;

  if (rows.length === 0) {
    console.log('   nothing new — no posts to queue.\n');
    return;
  }

  console.log(`   found   : ${rows.length} payment(s) since then\n`);

  const agents = agentKeys();
  const alreadyQueued = new Set(state.queued || []);
  const queue = readJson(QUEUE_PATH, []);
  const drafted = [];
  let newest = state.lastSeen;

  for (const row of rows) {
    const created = new Date(row.created_at).toISOString();
    if (!newest || created > newest) newest = created;

    const short = `${row.tx_hash.slice(0, 10)}…`;

    if (alreadyQueued.has(row.tx_hash)) {
      console.log(`  ⏭  ${short} already queued`);
      continue;
    }
    // Only native-CSPR deploys are verifiable this way; EVM rows and
    // the x402 placeholders are skipped rather than guessed at.
    if (!/^[0-9a-f]{64}$/i.test(row.tx_hash)) {
      console.log(`  ⏭  ${short} not a Casper deploy hash (${row.chain})`);
      continue;
    }

    const onChain = await deployExecuted(row.tx_hash);
    if (!onChain) {
      console.log(`  ⏭  ${short} not found executed on-chain yet`);
      continue;
    }

    const isAgent = agents.has((row.payer_address || '').toLowerCase());
    const post = draftPost(row, drafted.length + queue.length, isAgent);
    drafted.push({
      byAgent: isAgent,
      txHash: row.tx_hash,
      amountUsd: Number(row.amount),
      title: row.title ?? null,
      payer: row.payer_address,
      chain: row.chain,
      blockHeight: onChain.blockHeight,
      settledAt: created,
      draftedAt: new Date().toISOString(),
      post,
      posted: false,
    });
    console.log(`  ✅ ${short} queued — ${isAgent ? 'agent' : 'human'} payment (block ${onChain.blockHeight})`);
  }

  if (drafted.length === 0) {
    console.log('\n   nothing verifiable to queue.\n');
  } else {
    console.log(`\n── ${drafted.length} post(s) drafted ──`);
    for (const d of drafted) console.log(`\n${d.post}\n`);
  }

  if (DRY_RUN) {
    console.log('(dry run — queue and watermark left untouched)\n');
    return;
  }

  if (drafted.length > 0) {
    fs.writeFileSync(QUEUE_PATH, JSON.stringify([...queue, ...drafted], null, 2));
  }
  fs.writeFileSync(STATE_PATH, JSON.stringify({
    lastSeen: newest,
    queued: [...alreadyQueued, ...drafted.map((d) => d.txHash)],
  }, null, 2));

  if (drafted.length > 0) {
    console.log(`queued → ${path.relative(ROOT, QUEUE_PATH)} (${queue.length + drafted.length} waiting)\n`);
  }
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
