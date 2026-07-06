# Contributing to Pico

Thanks for your interest in Pico — micropayments for creators and AI agents on the Casper Network.

## Getting started

1. Fork and clone the repo
2. `npm install`
3. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_CASPER_NETWORK=casper-test`
4. Apply the schema: paste `drizzle/bootstrap.sql` into your Postgres instance
5. `npm run dev`

## Guidelines

- Keep the two payment rails (Casper native CSPR, USDC on Base) independent — a change to one must not break the other.
- Server-side verification is non-negotiable on the Casper rail: never grant an unlock from client-supplied data alone.
- Run `npm run build` and `npm run lint` before opening a PR.
- For agent-facing changes, test against `agent/buyer.js` and `agent/mcp-server.js`.

## Reporting issues

Use the issue templates. For security vulnerabilities, see [SECURITY.md](SECURITY.md) — do not open public issues for security problems.
