#!/usr/bin/env node
// ─── Pico buyer agent ────────────────────────────────────────
// An autonomous purchasing agent for the Casper rail. Given a goal
// and a CSPR budget, it browses the Pico catalog, reasons about which
// paid content actually serves the goal (Claude decides; a
// conservative heuristic if no API key is set), pays on-chain with
// its own Casper account, and redeems the content — no human, no
// browser, no wallet popup.
//
//   npm run agent -- --goal "learn AI prompt techniques" --budget 50
//
// Flags:
//   --goal "<text>"     what the agent is trying to achieve (required)
//   --budget <cspr>     max total CSPR to spend this run (required)
//   --max-item <cspr>   per-item cap (default: budget / 2)
//   --link <id>         evaluate a single link instead of the catalog
//   --yes               skip AI reasoning, buy everything within caps
//
// Env:
//   PICO_BASE_URL          Pico deployment (default http://localhost:3000)
//   CASPER_AGENT_KEY_PATH  PEM from `npm run agent:keygen`
//   ANTHROPIC_API_KEY      enables Claude-powered buy/skip decisions
//   CLAUDE_MODEL           default claude-haiku-4-5-20251001

const {
  discover, explorerFor, getBalanceMotes, getQuote, loadKeys,
  motesToCspr, payQuote, redeemContent, MOTES_PER_CSPR, TRANSFER_GAS_MOTES,
} = require('./casper-client');

const BASE_URL = process.env.PICO_BASE_URL || 'http://localhost:3000';

// ─── CLI args ───────────────────────────────────────────────

function parseArgs(argv) {
  const args = { yes: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--goal': args.goal = argv[++i]; break;
      case '--budget': args.budget = Number(argv[++i]); break;
      case '--max-item': args.maxItem = Number(argv[++i]); break;
      case '--link': args.link = argv[++i]; break;
      case '--yes': args.yes = true; break;
    }
  }
  if (!args.goal && !args.yes) fail('Missing --goal "<what the agent wants>" (or use --yes).');
  if (!args.budget || args.budget <= 0) fail('Missing --budget <CSPR>.');
  if (!args.maxItem) args.maxItem = args.budget / 2;
  return args;
}

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

// ─── The decision — this is the "agentic" part ──────────────

async function decideWithClaude(goal, item, quote, remainingCspr) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // No AI available: conservative heuristic — buy only if the item
    // costs less than a third of what's left.
    const cost = Number(quote.amountCspr);
    const buy = cost <= remainingCspr / 3;
    return { buy, reason: `heuristic (no ANTHROPIC_API_KEY): cost ${cost} vs remaining ${remainingCspr}` };
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system:
        'You are a purchasing agent with a limited crypto budget. Decide whether a piece of paid content is worth buying for the stated goal. Reply ONLY with JSON: {"buy": true|false, "reason": "<one sentence>"}',
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            goal,
            content: { title: item.title, description: item.description, type: item.type },
            price: { usd: quote.priceUsd, cspr: quote.amountCspr },
            budget: { remainingCspr },
          }),
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API error ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const text = json.content?.[0]?.text ?? '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Claude returned no JSON: ${text.slice(0, 120)}`);
  const parsed = JSON.parse(match[0]);
  return { buy: !!parsed.buy, reason: parsed.reason || 'no reason given' };
}

// ─── Main loop ──────────────────────────────────────────────

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const keys = loadKeys();
  const me = keys.publicKey.toHex();

  console.log(`🤖 Pico buyer agent`);
  console.log(`   account : ${me}`);
  console.log(`   goal    : ${args.goal ?? '(buy everything affordable)'}`);
  console.log(`   budget  : ${args.budget} CSPR (max ${args.maxItem} CSPR/item)`);
  console.log(`   store   : ${BASE_URL}`);
  console.log('');

  // Catalog
  const catalog = await discover(BASE_URL);
  const network = catalog.network;
  let items = catalog.items;
  if (args.link) items = items.filter((i) => i.id === args.link);
  if (!items.length) fail('Nothing to evaluate — catalog empty (creators need a Casper key set).');
  console.log(`🗂  ${items.length} item(s) on the ${network} catalog`);

  // Preflight balance
  let balance = await getBalanceMotes(network, me);
  console.log(`💰 on-chain balance: ${motesToCspr(balance)} CSPR`);
  if (balance < 3n * MOTES_PER_CSPR) {
    fail(`Balance too low. Fund ${me} at https://testnet.cspr.live/tools/faucet`);
  }

  let spentMotes = 0n;
  const budgetMotes = BigInt(Math.floor(args.budget * 1e9));
  const maxItemMotes = BigInt(Math.floor(args.maxItem * 1e9));
  const bought = [];

  for (const item of items) {
    console.log(`\n── ${item.title} ($${item.priceUsd}) — by @${item.creator}`);

    const q = await getQuote(BASE_URL, item.paymentEndpoint);
    if (q.alreadyUnlocked) {
      console.log('   already unlocked earlier — skipping');
      continue;
    }
    const quote = q.quote;
    const cost = BigInt(quote.amountMotes) + TRANSFER_GAS_MOTES;
    console.log(`   quote: ${quote.amountCspr} CSPR → ${quote.payTo.slice(0, 10)}… (memo ${quote.transferId})`);

    // Policy caps come BEFORE the AI — the model never gets the
    // chance to overspend, it only chooses within the allowance.
    if (BigInt(quote.amountMotes) > maxItemMotes) {
      console.log(`   ⏭  skip: exceeds per-item cap`);
      continue;
    }
    if (spentMotes + cost > budgetMotes) {
      console.log(`   ⏭  skip: would blow the session budget`);
      continue;
    }
    if (cost > balance) {
      console.log(`   ⏭  skip: insufficient on-chain balance`);
      continue;
    }

    const remainingCspr = Number(motesToCspr(budgetMotes - spentMotes));
    const decision = args.yes
      ? { buy: true, reason: '--yes flag' }
      : await decideWithClaude(args.goal, item, quote, remainingCspr);
    console.log(`   🧠 ${decision.buy ? 'BUY' : 'PASS'} — ${decision.reason}`);
    if (!decision.buy) continue;

    const deployHash = await payQuote(keys, quote);
    console.log(`   📡 broadcast: ${explorerFor(network)}/deploy/${deployHash}`);
    console.log('   ⏳ waiting for on-chain execution…');

    const content = await redeemContent(BASE_URL, item.paymentEndpoint, deployHash);
    spentMotes += cost;
    balance -= cost;
    bought.push({ title: item.title, deployHash, contentUrl: content.contentUrl });
    console.log(`   ✅ unlocked: ${content.contentUrl}`);
  }

  console.log('\n════════════════════════════════════');
  console.log(`Session over. Bought ${bought.length} item(s), spent ${motesToCspr(spentMotes)} CSPR (incl. gas).`);
  for (const b of bought) {
    console.log(` • ${b.title}\n   ${b.contentUrl}\n   ${explorerFor(network)}/deploy/${b.deployHash}`);
  }
})().catch((e) => fail(e.message));
