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
