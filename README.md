# Pico — Frictionless micropayments for creators & agents

## The idea

Creators and publishers lose their audience at the checkout page:
nobody enters card details to read one article or unlock one PDF worth
$0.25. Subscriptions over-ask, ads under-pay, and AI agents — the
fastest-growing consumers of paid content — can't fill in a Stripe
form at all. Micropayments have always been the obvious answer and
have always failed on friction and fees.

## The solution

Pico turns any piece of content into a pay-per-unlock link with fees
low enough that a $0.10 price still makes sense. Two rails, one
paywall:

- **Humans** tap once and pay with USDC on Base (Coinbase Smart
  Wallet, FaceID) or **native CSPR on the Casper Network** (Casper
  Wallet) — no seed phrases, no forms.
- **Autonomous agents** hit the same content over an x402-style HTTP
  402 flow: request → machine-readable price quote → on-chain payment
  → retry with proof → content. On Casper, Pico verifies every
  transfer directly against the node, so an unlock is only ever
  granted for a real, executed on-chain transaction.

Creators paste a wallet key, set a price, share a link. That's the
whole onboarding.

## Casper Network support (testnet + mainnet)

Built for the [Casper Agentic Buildathon 2026](https://dorahacks.io/hackathon/casper-agentic-buildathon/detail).
Full docs: **[docs/CASPER.md](docs/CASPER.md)**

- `NEXT_PUBLIC_CASPER_NETWORK=casper-test` (default) or `casper` switches the rail between Casper Testnet and Mainnet
- Human checkout: **⚡ Pay with Casper (CSPR)** on every `/p/[id]` link — deploy signed by the Casper Wallet extension, verified on-chain server-side before unlock
- Agent checkout: `GET /api/casper/content/[id]` returns HTTP 402 with machine-readable payment requirements; retry with `X-Casper-Deploy-Hash` after paying
- Creators enable the rail by saving their Casper public key in the dashboard

## Live on Casper Testnet

| | |
|---|---|
| App | https://pico-payment-casper.vercel.app |
| On-chain payments | [payer account activity](https://testnet.cspr.live/account/0203879bc44ec4a38209287ad72f5a872b36edaebba8ebfad5fae10931d704b38c0d) |
| **PicoRouter contract** (Odra) | [`hash-b4b5d701…a0608c`](https://testnet.cspr.live/contract-package/b4b5d701e5bd635b8e49ae2b8dbc8a8169870a9c673479b8f2461d63efa0608c) — 95/5 fee splitter, [source](contracts/pico_router/src/pico_router.rs), [deploy tx](https://testnet.cspr.live/transaction/fc00276b08b835bad31054499fcabad42e1bef7509f56734a95f64a697f0b28d) |

## Agentic payments

Pico isn't just agent-*compatible* — it ships its own autonomous
buyer and an MCP server, so the full agent economy loop runs inside
this repo: an AI with a budget discovers content, reasons about value,
pays on-chain, and consumes what it bought. No human, no browser.

### 1. The buyer agent (`agent/buyer.js`)

An autonomous purchasing agent with its own Casper account, a goal,
and a hard budget:

```bash
# one-time: create the agent's keypair (PEM, gitignored)
npm run agent:keygen
# fund the printed public key with free testnet CSPR (1000 CSPR):
#   https://testnet.cspr.live/tools/faucet

# let it shop
export ANTHROPIC_API_KEY=sk-ant-…       # enables Claude-powered decisions
npm run agent -- --goal "learn AI prompt engineering" --budget 50
```

The agent browses `/api/casper/discover`, fetches the 402 quote for
each item, and asks Claude whether the content is worth the price
given its goal and remaining budget. Spending policy (per-item cap,
session budget, balance check) is enforced **in code, before the
model is consulted** — the AI chooses within its allowance, never
over it. Every purchase is a real native transfer on Casper, linked
from the console output to cspr.live. Without an API key it falls
back to a conservative heuristic; `--yes` skips reasoning entirely.

### 2. The MCP server (`agent/mcp-server.js`)

Exposes the rail as Model Context Protocol tools so any MCP-capable
assistant (Claude Code, Claude Desktop, custom agents) can buy Pico
content mid-conversation:

| Tool | Does |
|---|---|
| `wallet_status` | agent account, live on-chain balance, spend cap |
| `discover_content` | the paid-content catalog |
| `get_quote` | 402 payment requirements for one item |
| `pay_and_unlock` | sign + broadcast the CSPR transfer, verify on-chain, return content |

```bash
# register with Claude Code
claude mcp add pico -- node agent/mcp-server.js
# env: PICO_BASE_URL, CASPER_AGENT_KEY_PATH, MCP_MAX_SPEND_CSPR (default 25)
```

### 3. Agent discovery

Crawling agents can learn to transact with Pico unassisted:
[`/llms.txt`](public/llms.txt) (human/LLM-readable how-to) and
`/.well-known/x402` (machine-readable manifest of both rails).

### Wallets & faucet

- **Humans:** [Casper Wallet](https://www.casperwallet.io/) browser
  extension — used by the Pay-with-CSPR button. (CSPR.click is the
  planned upgrade for a passkey-style UX.)
- **Agents:** no browser wallet — `npm run agent:keygen` creates a raw
  ed25519 keypair; the PEM stays on disk (gitignored) and signing
  happens locally.
- **Testnet funding:** https://testnet.cspr.live/tools/faucet — free
  5,000 CSPR, once per account.

### Agentic roadmap

- **Budget wallets (spend policies as a product):** today the MCP
  server enforces a per-item env cap; the full version is per-agent
  sub-accounts with owner-set daily limits, creator allowlists, and
  spend reporting — enforced server-side before any deploy is signed.
- **Autonomous pricing agent (seller side):** Pico already logs the
  conversion funnel (`widget_views` vs `payments`). A nightly agent
  will review each link's funnel and nudge prices within creator-set
  bounds — making the seller autonomous, not just the buyer.
- **CSPR → fiat settlement bridge:** sweep creator CSPR earnings
  through an instant-exchange swap into USDC on Base, exiting via the
  existing Transak/Ramp off-ramp — closing the fiat loop with one
  integration.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
