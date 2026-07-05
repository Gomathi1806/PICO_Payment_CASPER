#!/usr/bin/env node
// ─── Pico MCP server ─────────────────────────────────────────
// Exposes Pico's Casper payment rail as Model Context Protocol tools,
// so ANY MCP-capable AI agent (Claude Code, Claude Desktop, custom
// agents) can browse, reason about, and buy paid content mid-task —
// the tool layer of the agent economy this project is built for.
//
//   Tools:
//     wallet_status    — agent account, on-chain balance, faucet hint
//     discover_content — the paid-content catalog
//     get_quote        — 402 payment requirements for one item
//     pay_and_unlock   — sign + broadcast CSPR transfer, verify, unlock
//
//   Spend policy: pay_and_unlock refuses items above
//   MCP_MAX_SPEND_CSPR (default 25) — the model reasons freely, but
//   the wallet obeys the cap. Set the env var to raise/lower it.
//
//   Claude Code registration:
//     claude mcp add pico -- node agent/mcp-server.js
//   Env: PICO_BASE_URL, CASPER_AGENT_KEY_PATH, MCP_MAX_SPEND_CSPR

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const {
  discover, explorerFor, getBalanceMotes, getQuote, keyPath, loadKeys,
  motesToCspr, payQuote, redeemContent, MOTES_PER_CSPR,
} = require('./casper-client');

const BASE_URL = process.env.PICO_BASE_URL || 'http://localhost:3000';
const MAX_SPEND_CSPR = Number(process.env.MCP_MAX_SPEND_CSPR) || 25;

const server = new McpServer({ name: 'pico-casper', version: '1.0.0' });

const text = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });
const err = (message) => ({ content: [{ type: 'text', text: `Error: ${message}` }], isError: true });

server.registerTool(
  'wallet_status',
  {
    description:
      'The agent wallet: Casper account public key, live on-chain CSPR balance, spend cap, and funding instructions if empty.',
    inputSchema: {},
  },
  async () => {
    try {
      const keys = loadKeys();
      const me = keys.publicKey.toHex();
      const catalog = await discover(BASE_URL).catch(() => ({ network: 'casper-test' }));
      const balance = await getBalanceMotes(catalog.network, me);
      return text({
        account: me,
        network: catalog.network,
        balanceCspr: motesToCspr(balance),
        maxSpendPerItemCspr: MAX_SPEND_CSPR,
        explorer: `${explorerFor(catalog.network)}/account/${me}`,
        fundingHint:
          balance < 3n * MOTES_PER_CSPR
            ? 'Balance too low to transact. Get free testnet CSPR: https://testnet.cspr.live/tools/faucet'
            : undefined,
      });
    } catch (e) {
      return err(`${e.message}${/No agent key/.test(e.message) ? '' : ` (key: ${keyPath()})`}`);
    }
  },
);

server.registerTool(
  'discover_content',
  {
    description:
      'List paid content available on this Pico deployment: id, title, teaser description, USD price, creator. Use get_quote for the exact CSPR amount.',
    inputSchema: {},
  },
  async () => {
    try {
      return text(await discover(BASE_URL));
    } catch (e) {
      return err(e.message);
    }
  },
);

server.registerTool(
  'get_quote',
  {
    description:
      'Fetch the HTTP 402 payment requirements for one content item: recipient key, exact CSPR/motes amount at the live rate, and transfer memo.',
    inputSchema: { linkId: z.string().describe('Content id from discover_content') },
  },
  async ({ linkId }) => {
    try {
      const q = await getQuote(BASE_URL, `/api/casper/content/${linkId}`);
      return text(q.alreadyUnlocked ? { alreadyUnlocked: true, ...q.content } : q.quote);
    } catch (e) {
      return err(e.message);
    }
  },
);

server.registerTool(
  'pay_and_unlock',
  {
    description:
      `Pay for a content item with the agent's own CSPR (native transfer on Casper), wait for on-chain verification, and return the unlocked content URL. Hard-capped at ${MAX_SPEND_CSPR} CSPR per item (MCP_MAX_SPEND_CSPR).`,
    inputSchema: { linkId: z.string().describe('Content id from discover_content') },
  },
  async ({ linkId }) => {
    try {
      const q = await getQuote(BASE_URL, `/api/casper/content/${linkId}`);
      if (q.alreadyUnlocked) return text({ alreadyUnlocked: true, ...q.content });
      const quote = q.quote;

      // Policy check BEFORE any signing — the cap binds the wallet,
      // not the model's judgement.
      if (Number(quote.amountCspr) > MAX_SPEND_CSPR) {
        return err(
          `Quote is ${quote.amountCspr} CSPR, above the ${MAX_SPEND_CSPR} CSPR per-item cap. Raise MCP_MAX_SPEND_CSPR if this purchase is intended.`,
        );
      }

      const keys = loadKeys();
      const balance = await getBalanceMotes(quote.network, keys.publicKey.toHex());
      if (balance < BigInt(quote.amountMotes) + MOTES_PER_CSPR) {
        return err(
          `Insufficient balance (${motesToCspr(balance)} CSPR). Fund at https://testnet.cspr.live/tools/faucet`,
        );
      }

      const deployHash = await payQuote(keys, quote);
      const content = await redeemContent(BASE_URL, `/api/casper/content/${linkId}`, deployHash);
      return text({
        unlocked: true,
        title: content.title,
        contentUrl: content.contentUrl,
        paidCspr: quote.amountCspr,
        deployHash,
        explorerUrl: `${explorerFor(quote.network)}/deploy/${deployHash}`,
      });
    } catch (e) {
      return err(e.message);
    }
  },
);

(async () => {
  await server.connect(new StdioServerTransport());
  console.error(`[pico-mcp] ready — store ${BASE_URL}, cap ${MAX_SPEND_CSPR} CSPR/item`);
})();
