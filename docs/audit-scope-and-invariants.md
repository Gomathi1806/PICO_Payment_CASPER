# Pico — roles, permissions and invariants

Prepared for the Safe Edges audit intake. Companion to `CASPER.md`
(payment flows) and `agent-custody-and-quoting.md` (agent custody).

---

## 1. What PicoRouter does

`contracts/pico_router` is an Odra contract deployed on Casper testnet as
package `hash-b4b5d701e5bd635b8e49ae2b8dbc8a8169870a9c673479b8f2461d63efa0608c`.

It is a fee splitter. A fan or an autonomous agent calls `pay` with the
unlock price attached in CSPR; the contract forwards the creator's share
and Pico's platform fee in a single deploy and emits a `PaymentRouted`
receipt. Phase 1 of the Casper rail used native transfers that paid the
creator 100%; the router is Phase 2 and removes the need to trust the
server to make a second transfer.

`link_id` is the first 48 bits of the Pico link UUID, mirroring the
transfer-id memo used by the native-transfer rail so both rails stay
attributable on chain.

Built against: Odra 2.9.0, casper-types 6.1.0, Rust `nightly-2026-01-01`.

## 2. Roles

| Role | Who | Set how |
| --- | --- | --- |
| `owner` | Deployer | Captured from `env().caller()` in `init`. Fixed for the contract's life. |
| `treasury` | Pico platform wallet | `init` argument; changeable by `owner`. |
| payer | Anyone | No allow-list. A fan wallet or an autonomous agent. |
| creator | Passed per call | The `creator` argument of `pay`. Not stored on chain. |

## 3. Permissions

| Entry point | Who may call | Effect |
| --- | --- | --- |
| `init(treasury, fee_bps)` | Deployer, once | Sets owner, treasury, fee. Reverts if `fee_bps > 2000`. |
| `pay(creator, link_id)` | Anyone, payable | Splits attached value, emits `PaymentRouted`. |
| `set_fee_bps(fee_bps)` | `owner` only | Reverts `NotOwner` otherwise, `FeeTooHigh` above 2000. |
| `set_treasury(treasury)` | `owner` only | Reverts `NotOwner` otherwise. |
| `fee_bps()` / `treasury()` / `owner()` | Anyone | Read-only. |

### What the owner can and cannot do

Can: change the fee within the cap, change the treasury address.

**Cannot**: take a creator's share, raise the fee above 20%, pause or
drain the contract, or touch funds from past payments — nothing is held
between calls.

## 4. Invariants

These should hold for every state and every call:

1. `fee_bps <= 2000` (20%) always — enforced in both `init` and
   `set_fee_bps`.
2. `creator_amount + fee == attached_value`. The contract never retains
   a balance between calls.
3. Only the address stored in `owner` can change `fee_bps` or
   `treasury`.
4. `pay` reverts with `NoValueAttached` when the attached value is zero,
   so no zero-value receipt is ever emitted.
5. Every successful `pay` emits exactly one `PaymentRouted` whose
   `creator_amount` and `fee` sum to the attached value.
6. `owner` is immutable after `init` — there is no transfer or renounce
   entry point.
7. Fee arithmetic rounds **down**, so any remainder from integer
   division goes to the creator, never to the treasury.

## 5. Fund flow

```
fan wallet / agent
   │  pay(creator, link_id) with CSPR attached
   ▼
PicoRouter
   ├── transfer_tokens(creator, amount - fee)
   └── transfer_tokens(treasury, fee)        [skipped when fee == 0]
   ▼
PaymentRouted { link_id, payer, creator, creator_amount, fee }
```

Funds are never custodied. The contract holds no balance before or after
a call, and there is no withdraw path because there is nothing to
withdraw.

The native-transfer rail bypasses the contract: the fan transfers
directly to the creator's `casperPublicKey` with a `transferId` memo,
and the server verifies the transfer against a Casper node before
unlocking content. Creators opt in to the router per account
(`casperUseRouter`).

## 6. Off-chain roles

| Role | Capability |
| --- | --- |
| Anonymous visitor | Browse links, fetch 402 payment requirements, pay, unlock content. |
| Authenticated creator | Create and edit own links, set price, set `casperPublicKey` payout target, toggle router use. |
| Admin | Surfaces in `src/app/admin`. See note in §8. |
| Buyer agent | Holds its own Casper keypair; pays for links unattended. See `agent-custody-and-quoting.md`. |

Authentication is `next-auth` with a credentials provider and bcrypt
password hashes, JWT sessions, in `src/auth.ts`.

## 7. Known weak spots

Flagged deliberately rather than left for discovery.

- **`next-auth` is on `5.0.0-beta.31`** — a beta release gating
  money-affecting operations.
- **Spending caps for agents are unsolved.** `agent-custody-and-quoting.md`
  §4 explains why a floating price and a fixed cap do not compose; §5
  and §6 document two further gaps (the 300-second window, and
  recording the agent rather than the principal).
- **`set_treasury` performs no validity check.** An owner key compromise
  could point the treasury at an address that cannot receive, which
  would make every non-zero-fee `pay` revert. Denial of service, not
  theft.
- **Owner cannot be rotated.** Losing the owner key freezes `fee_bps`
  and `treasury` at their current values permanently.
- **`link_id` is a 48-bit truncation of a UUID**, so on-chain
  attribution is subject to the birthday bound rather than being
  globally unique.
- **RUSTSEC-2026-0387** (`crypto-bigint 0.5.5`, timing variability) is
  unpatchable from this repo — see §9.
- **Server-action authorization** — every export in a `'use server'`
  file is reachable by direct POST, so owner-scoped actions derive the
  caller from the session through `src/lib/require-owner.ts` rather than
  trusting an id passed in. Fan-facing payment actions (paying for a
  link, redeeming a gift card, reading public link data) are
  deliberately anonymous. The admin surface has not had the same pass —
  see §8.

## 8. Admin surface

Admin access is two-factor by design (`src/lib/roles.ts`): the user row
must carry `role === 'admin'` **and** the session email must appear in
the `ADMIN_EMAILS` deploy-time allowlist. Both must pass, so a database
write alone cannot grant admin without also editing the environment.

What an admin can do:

| Capability | Action |
| --- | --- |
| Read platform stats | `getPlatformStats` |
| Read recent payments across all creators | `getPlatformRecentPayments` |
| Read per-link widget stats across all creators | `getAllWidgetStatsForAdmin` |
| Read outstanding promo liability | `getOutstandingPromoLiability` |
| Trigger a treasury settlement run | `settleCreatorPromos` |
| Mark promo debts settled without an on-chain transfer | `markPromosSettledManually` |

An admin **cannot** change a creator's payout key, edit a creator's
links or prices, or move funds anywhere other than to the creator
wallets already owed a settled debt.

The routine that moves treasury funds lives in
`src/lib/settlement-core.ts`, outside `src/app/actions`, so it is not
exported from a `'use server'` file and cannot be invoked by a direct
POST. Its two callers are the `CRON_SECRET`-gated cron route and the
admin-gated action wrapper.

**Known limitation:** `runCreatorSettlement` is not safe to run
concurrently. Redemptions are marked settled only after the transfer
receipt confirms, so two overlapping runs can both read the same
unsettled rows and pay twice. The callers are serial in practice — one
daily cron, one admin button — but an admin clicking while the cron runs
would double-pay. A claim step or row lock before the transfer would
close it. Flagged here rather than changed, because altering payout
logic without tests is its own risk.

## 9. Dependency advisory

`cargo audit` reports RUSTSEC-2026-0387 against `crypto-bigint 0.5.5`,
reached only via `casper-types -> k256 0.13 -> elliptic-curve 0.13`,
which pins `crypto-bigint ^0.5`. The patched 0.7.6 first appears in
`elliptic-curve 0.14`, so there is no upgrade path from this repository
until upstream Casper moves to k256 0.14. Bumping Odra to 2.10.1 does
not change the resolution.

The advisory describes a timing side channel in secret-dependent
big-integer arithmetic. PicoRouter executes deterministically on chain
and holds no private keys.

## 10. Agent custody summary

Required by the audit-readiness guide for projects using AI agents.

- **Key storage** — the agent keypair lives in `agent/keys/` as a PEM,
  gitignored by design and never committed. See `SECURITY.md`.
- **Tools and MCP** — `agent/mcp-server.js` exposes the buyer to MCP
  clients; `agent/buyer.js`, `x402-buyer.mjs` and `pricer.js` carry the
  payment logic.
- **Replay protection** — the native rail ties each transfer to a link
  through the `transferId` memo and verifies it server-side against a
  node before unlocking.
- **Human approval / pause** — not yet implemented. Configurable quote
  windows for buyers whose owner must co-sign are planned; see
  `agent-custody-and-quoting.md` §8.
- **Spending limits** — see §7.
