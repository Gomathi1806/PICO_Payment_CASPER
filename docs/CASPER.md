# Pico on Casper — Testnet & Mainnet Payment Rail

Pico's second payment rail: fans (and autonomous agents) unlock content
with **native CSPR** on the Casper Network, alongside the existing
Base/USDC rail. Built for the
[Casper Agentic Buildathon 2026](https://dorahacks.io/hackathon/casper-agentic-buildathon/detail).

## Network selection

One env var flips the whole rail between testnet and mainnet:

```bash
# .env
NEXT_PUBLIC_CASPER_NETWORK=casper-test   # Casper Testnet (default)
NEXT_PUBLIC_CASPER_NETWORK=casper        # Casper Mainnet

# Optional overrides
CASPER_RPC_URL=https://node.testnet.casper.network/rpc  # custom node (server-side only)
CASPER_USD_FALLBACK=0.01                                # CSPR/USD if CoinGecko is down
```

Defaults (both verified live, Casper 2.x):

| Network | Chain name | RPC | Explorer | Faucet |
|---|---|---|---|---|
| Testnet | `casper-test` | `https://node.testnet.casper.network/rpc` | [testnet.cspr.live](https://testnet.cspr.live) | [faucet](https://testnet.cspr.live/tools/faucet) |
| Mainnet | `casper` | `https://node.mainnet.casper.network/rpc` | [cspr.live](https://cspr.live) | — |

## How the human flow works (`/p/[id]`)

1. Creator pastes their **Casper account public key** (from
   [Casper Wallet](https://www.casperwallet.io/) or cspr.live) into the
   dashboard → stored as `users.casper_public_key`.
2. A fan opens the Pico link and taps **⚡ Pay with Casper (CSPR)**.
3. The USD price is converted to motes at the live CoinGecko CSPR rate
   (60s cache, 2.5 CSPR network minimum enforced).
4. The browser builds a native-transfer deploy with `casper-js-sdk` and
   the Casper Wallet extension signs it. The **transfer id memo is
   derived from the link UUID**, so payments are attributable on-chain.
5. The signed deploy is relayed through a server action which
   **validates recipient + amount before submitting** to the node
   (`account_put_deploy`), then the client polls until execution.
6. Confirmation re-fetches the deploy **from the node** (client input
   is never trusted for the grant), checks execution success, recipient
   and amount, records the payment (`payments.chain = casper[-test]`),
   and unlocks the content.

## How the agent flow works (`/api/casper/content/[id]`)

An x402-style HTTP 402 dance, native to Casper — machine-to-machine
commerce with no browser and no human:

```bash
# 1. Agent requests gated content → 402 + machine-readable requirements
curl https://pico.example/api/casper/content/<linkId>
# {
#   "error": "Payment required",
#   "accepts": [{
#     "scheme": "casper-native-transfer",
#     "network": "casper-test",
#     "payTo": "01ab…",            ← creator's Casper key
#     "amountMotes": "25000000000",
#     "transferId": 123456789,      ← memo that ties the transfer to the link
#     ...
#   }]
# }

# 2. Agent pays: native CSPR transfer with the quoted amount + memo
#    (casper-js-sdk, Casper MCP server, or any signer)

# 3. Agent retries with the deploy hash → verified on-chain → content
curl -H "X-Casper-Deploy-Hash: <hash>" https://pico.example/api/casper/content/<linkId>
# { "contentUrl": "…", "title": "…", "explorerUrl": "https://testnet.cspr.live/deploy/…" }
```

## Code map

| File | Role |
|---|---|
| `src/lib/casper/config.ts` | Testnet/mainnet configs, motes math, env switch |
| `src/lib/casper/deploy.ts` | Client: build transfer deploy + Casper Wallet signing |
| `src/lib/casper/server.ts` | Server: RPC access, deploy parsing, on-chain verification |
| `src/lib/casper/price.ts` | USD → motes conversion (CoinGecko, cached, slippage floor) |
| `src/app/actions/casper.ts` | Server actions: quote / submit / confirm / save key |
| `src/components/CasperPayButton.tsx` | Checkout button state machine on `/p/[id]` |
| `src/app/api/casper/content/[id]/route.ts` | Agent-facing 402 endpoint |
| `drizzle/0003_*.sql` | Migration: `users.casper_public_key`, `payments.chain` |

## Trust model

The Casper rail is **stricter** than the EVM rail: payments are never
self-reported by the client. The server validates the deploy before
relaying it, and the unlock is only granted after the node confirms
successful execution of a transfer whose recipient and amount the
server re-checked from chain data.

## Testing on testnet

1. Install [Casper Wallet](https://www.casperwallet.io/), create two
   accounts (creator + fan).
2. Fund the fan account at the
   [testnet faucet](https://testnet.cspr.live/tools/faucet) (1000 CSPR free).
3. Save the creator account's public key in the Pico dashboard.
4. Create a link, open `/p/<id>` in another browser/profile, pay with
   the fan account, watch the deploy on
   [testnet.cspr.live](https://testnet.cspr.live).

## Fees

Phase 1 routes 100% of each CSPR payment to the creator (same as the
EVM x402 flow — see `src/lib/x402-config.ts` for the rationale). The
95/5 split lands in Phase 2 alongside the PicoRouter contract, which on
Casper will be an [Odra](https://odra.dev) contract.

## PicoRouter — the on-chain fee splitter (Final Round addition)

Phase 2 shipped: an [Odra](https://odra.dev) smart contract deployed on
Casper Testnet that splits every unlock payment atomically between the
creator and the Pico treasury in a single deploy.

| | |
|---|---|
| Contract package | `hash-b4b5d701e5bd635b8e49ae2b8dbc8a8169870a9c673479b8f2461d63efa0608c` |
| Deploy transaction | [`fc00276b…f0b28d`](https://testnet.cspr.live/transaction/fc00276b08b835bad31054499fcabad42e1bef7509f56734a95f64a697f0b28d) |
| Source | [`contracts/pico_router/src/pico_router.rs`](../contracts/pico_router/src/pico_router.rs) |
| Fee | 500 bps (5%), owner-settable, **hard-capped at 20% in the contract** |

`pay(creator, link_id)` is payable: attach the unlock price in CSPR and
the contract forwards 95% to the creator and 5% to the treasury, then
emits a `PaymentRouted { link_id, payer, creator, creator_amount, fee }`
event — an on-chain receipt tying the payment to its Pico link. The
`link_id` mirrors the transfer-id memo of the native-transfer rail.

Build & test (requires Rust + `cargo-odra`):

```bash
cd contracts/pico_router
cargo odra test    # 6 unit tests: split math, receipt event, guards
cargo odra build   # wasm/PicoRouter.wasm
```

Deploy (Odra livenet backend, no casper-client needed):

```bash
export ODRA_CASPER_LIVENET_SECRET_KEY_PATH=../../agent/keys/agent-secret.pem
export ODRA_CASPER_LIVENET_NODE_ADDRESS=https://node.testnet.casper.network
export ODRA_CASPER_LIVENET_CHAIN_NAME=casper-test
export ODRA_CASPER_LIVENET_EVENTS_URL=https://node.testnet.casper.network/events
cargo run --bin pico_router_cli -- deploy
```

### Wiring the router into the paywall

The checkout flow supports **both settlement paths** and the creator
picks per account, via the "Settle via PicoRouter contract" toggle on
the dashboard (stored as `users.casper_use_router`):

| Off (default) | On |
|---|---|
| Direct native CSPR transfer, fan → creator (100%). No contract touched. | Fan signs a `pay(creator, link_id)` call on the router. The contract atomically splits 95% to the creator and 5% to the treasury, and emits `PaymentRouted` — an on-chain receipt tying the payment to the Pico link. |
| Attached payment = 0.1 CSPR gas | Attached payment = 3 CSPR gas ceiling + unlock price (leftover refunds) |
| `payments.chain = 'casper-test'` | `payments.chain = 'casper-test-router'` |

The client dispatches on `getCasperPaymentInfo(...).useRouter`
([`src/lib/casper/deploy.ts`](../src/lib/casper/deploy.ts) provides
both `signTransferWithCasperWallet` and `signRouterCallWithCasperWallet`);
the server dispatches on the deploy's session shape
([`src/app/actions/casper.ts`](../src/app/actions/casper.ts) tries
`parseRouterDeploy` first, falls back to `parseTransferDeploy`).
Verification is identical in strictness — chain name, package hash,
entry point, creator account hash, `link_id` memo, attached amount are
all re-checked against the on-chain deploy before the unlock is granted.

Router package hash on the active network comes from
`PICO_ROUTER_PACKAGE_HASH` in `src/lib/casper/config.ts`, overridable
per environment with `NEXT_PUBLIC_CASPER_ROUTER_PACKAGE_HASH_TESTNET`
and `NEXT_PUBLIC_CASPER_ROUTER_PACKAGE_HASH_MAINNET`. If no hash is
configured for the active network, the toggle silently falls back to
native transfer — mainnet-without-router still works.
