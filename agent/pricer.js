#!/usr/bin/env node
// ─── Pico autonomous seller-side pricing agent ──────────────
// The buyer agent (agent/buyer.js) makes the *fan* side of Pico
// autonomous: an AI shops within a budget. This agent completes the
// loop by making the *seller* side autonomous: it reads each opted-in
// link's views-vs-payments funnel over the last N days, asks Claude
// for a price nudge grounded in that funnel, and — with --apply —
// writes the new price. Every proposal (dry-run or applied) is stored
// in the price_reviews table with the reason Claude gave, so creators
// get a full audit trail.
//
//   npm run pricer            → dry-run, print recommendations, no writes
//   npm run pricer -- --apply → write new prices, update lastPriceReviewAt
//   npm run pricer -- --link <uuid>  → focus on one link
//
// Human-in-the-loop safety:
//   • The creator MUST opt in per link (autonomousPricing flag).
//   • The creator MUST set minPrice and maxPrice — the agent proposes
//     ONLY within [min, max]; there is no default range.
//   • Cooldown: at least 24h between reviews for the same link, so
//     one bad day never triggers a cascade of nudges.
//
//   Env: DATABASE_URL (Neon), ANTHROPIC_API_KEY (else heuristic mode),
//   PRICER_WINDOW_DAYS (default 7), PRICER_COOLDOWN_HOURS (default 24)

const { neon } = require('@neondatabase/serverless');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) fail('DATABASE_URL missing. Point at the same Neon URL the app uses.');

const WINDOW_DAYS = Number(process.env.PRICER_WINDOW_DAYS) || 7;
const COOLDOWN_HOURS = Number(process.env.PRICER_COOLDOWN_HOURS) || 24;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const sql = neon(DATABASE_URL);

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--apply': args.apply = true; break;
      case '--link': args.link = argv[++i]; break;
      case '--window-days': args.windowDays = Number(argv[++i]); break;
    }
  }
  return args;
}

function fail(msg) { console.error(`❌ ${msg}`); process.exit(1); }

function clamp(v, min, max) {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.round(v * 100) / 100));
}

// The decision — layman: "should we nudge the price, and why?"
async function decideWithClaude(link, snapshot) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const min = Number(link.min_price);
  const max = Number(link.max_price);
  const current = Number(link.price);

  // Heuristic fallback if no API key: many views + 0 sales → drop 15%,
  // healthy conversion → nudge 10% up, thin data → hold.
  if (!apiKey) {
    let target = current;
    let reason = 'heuristic (no ANTHROPIC_API_KEY)';
    const conv = snapshot.views ? snapshot.sales / snapshot.views : 0;
    if (snapshot.views >= 30 && snapshot.sales === 0) {
      target = current * 0.85;
      reason = `heuristic: ${snapshot.views} views / 0 sales — try 15% lower`;
    } else if (snapshot.views >= 20 && conv > 0.05) {
      target = current * 1.1;
      reason = `heuristic: ${(conv * 100).toFixed(1)}% conversion — try 10% higher`;
    } else if (snapshot.views < 10) {
      reason = 'heuristic: not enough data yet, hold';
    }
    return { newPrice: clamp(target, min, max), reason };
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      system:
        `You are Pico's autonomous pricing agent. For each pay-per-unlock link, given the last ${WINDOW_DAYS}d funnel (views + sales) and the creator-set bounds, propose a new USD price to test. Rules: (1) stay strictly within [min, max]; (2) if the funnel is thin or unclear, hold the current price; (3) small nudges only (<= 20% at a time). Reply ONLY with JSON: {"newPrice": <number>, "reason": "<one plain sentence>"}`,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            link: { title: link.title, description: (link.description || '').slice(0, 200), type: link.type },
            currentPriceUsd: current,
            bounds: { min, max },
            funnelLastNDays: {
              days: WINDOW_DAYS,
              views: snapshot.views,
              sales: snapshot.sales,
              conversionPct: snapshot.views ? +(100 * snapshot.sales / snapshot.views).toFixed(2) : 0,
            },
          }),
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const text = json.content?.[0]?.text ?? '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Claude returned no JSON: ${text.slice(0, 120)}`);
  const parsed = JSON.parse(match[0]);
  const newPrice = clamp(Number(parsed.newPrice), min, max);
  return { newPrice, reason: parsed.reason || 'no reason given' };
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const windowDays = args.windowDays || WINDOW_DAYS;

  const links = args.link
    ? await sql`select * from pico_links where id = ${args.link}`
    : await sql`select * from pico_links where autonomous_pricing = true and min_price is not null and max_price is not null`;

  if (!links.length) {
    console.log('No links opted in for autonomous pricing. Enable it on a link and set min/max in the dashboard.');
    return;
  }

  console.log(`🤖 Pico pricing agent — ${links.length} link(s), window ${windowDays}d, ${args.apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log('');

  for (const link of links) {
    const [funnel] = await sql`
      select
        (select count(*)::int from widget_views where link_id = ${link.id} and created_at > now() - (${windowDays}::text || ' days')::interval) as views,
        (select count(*)::int from payments      where link_id = ${link.id} and created_at > now() - (${windowDays}::text || ' days')::interval) as sales
    `;

    console.log(`── ${link.title}  [${link.id.slice(0, 8)}]`);
    console.log(`   current: $${link.price}   bounds: $${link.min_price} → $${link.max_price}   funnel(${windowDays}d): ${funnel.views}v / ${funnel.sales}s`);

    if (link.last_price_review_at) {
      const hoursSince = (Date.now() - new Date(link.last_price_review_at).getTime()) / 3.6e6;
      if (hoursSince < COOLDOWN_HOURS) {
        console.log(`   ⏳ skip: last review ${hoursSince.toFixed(1)}h ago, cooldown ${COOLDOWN_HOURS}h`);
        continue;
      }
    }

    let decision;
    try {
      decision = await decideWithClaude(link, funnel);
    } catch (e) {
      console.log(`   ⚠️  ${e.message} — skipping`);
      continue;
    }

    const changed = Number(decision.newPrice).toFixed(2) !== Number(link.price).toFixed(2);
    console.log(`   🧠 ${changed ? `→ $${decision.newPrice.toFixed(2)}` : 'HOLD'}   ${decision.reason}`);

    await sql`
      insert into price_reviews (link_id, views, sales, old_price, new_price, reason, applied)
      values (${link.id}, ${funnel.views}, ${funnel.sales}, ${link.price}, ${decision.newPrice.toFixed(2)}, ${decision.reason}, ${args.apply && changed})
    `;

    if (args.apply && changed) {
      await sql`update pico_links set price = ${decision.newPrice.toFixed(2)}, last_price_review_at = now() where id = ${link.id}`;
      console.log('   ✅ applied');
    } else if (args.apply) {
      await sql`update pico_links set last_price_review_at = now() where id = ${link.id}`;
    }
  }

  console.log('\nDone.');
})().catch(e => fail(e.message));
