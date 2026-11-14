# Pico paid test links — handover

Casper Forward cohort 1 cross-test, the Pico half. Three Casper-enabled paid
links on the live testnet deployment, at three price points, for an external
agent to buy from unattended. The sibling half (Pico's agent buying from
Sluice) is in [`sluice-crosstest.md`](./sluice-crosstest.md).

| | |
|---|---|
| Store | `https://casper.picomicropay.nl` |
| Network | `casper:casper-test` (Casper testnet) |
| Scheme | standard x402, `exact`, WCSPR (CEP-18, 9 decimals), settled by the CSPR.cloud facilitator — **the buyer signs, the facilitator pays the gas** |
| Seller | creator `goms1`, account hash `e01c092d8b3ed9b91b68a5ec563834a7fe55c64dff77a21f5ed3f3e4bd40e1c7` |
| Created | 9 Nov 2026 |

The store moved to `casper.picomicropay.nl` on 14 Nov 2026. The old host,
`pico-payment-casper.vercel.app`, still resolves and serves the same
deployment, so links handed out before that date keep working — but prefer the
custom domain from here on. Nothing about the payment flow changed: the `402`
builds `resource.url` from the request host, so it reports whichever host you
called.

## The three links

### A — unlock receipt · $0.01

| | |
|---|---|
| Public page | https://casper.picomicropay.nl/p/01a9a58a-fd7e-4c09-a935-8c4657def4e3 |
| Agent endpoint | https://casper.picomicropay.nl/api/content/01a9a58a-fd7e-4c09-a935-8c4657def4e3 |
| Price | $0.01 — about 4.94 WCSPR at the rate on the day |
| Buyer receives | `200 { contentUrl, title, type }`; `contentUrl` is a small JSON proof-of-purchase receipt with the secret word `ferrous-kestrel-0214` |
| Verified by | [`6d1b6b0d…`](https://testnet.cspr.live/transaction/6d1b6b0d6364fb075e3a916e0117237e82f9fc6df87772db7a307e99c3b87c66) — block 9,777,152, no error, 4.944816 WCSPR to the creator |

### B — sample CSPR dataset · $0.02

| | |
|---|---|
| Public page | https://casper.picomicropay.nl/p/1fd4660e-589c-46f5-b9b1-dc0d021f680d |
| Agent endpoint | https://casper.picomicropay.nl/api/content/1fd4660e-589c-46f5-b9b1-dc0d021f680d |
| Price | $0.02 — about 9.89 WCSPR |
| Buyer receives | JSON: six hourly OHLC candles, **synthetic placeholder data, clearly labelled, not real market data**; secret word `cobalt-heron-0220` |
| Verified by | [`3d323970…`](https://testnet.cspr.live/transaction/3d323970e30a3deca5acf8c096b8a50e72a8a5286cbc59bcd5a28045d10d6d3b) — block 9,777,154, no error, 9.889632 WCSPR to the creator |

### C — Pico agent integration guide · $0.05

| | |
|---|---|
| Public page | https://casper.picomicropay.nl/p/04976f51-ca3e-4c52-b6b6-d1ef0f7e383f |
| Agent endpoint | https://casper.picomicropay.nl/api/content/04976f51-ca3e-4c52-b6b6-d1ef0f7e383f |
| Price | $0.05 — about 24.72 WCSPR |
| Buyer receives | Markdown: how to pay Pico from an agent — the standard x402 WCSPR flow, the Casper-native deploy-hash flow, the discovery endpoint; secret word `marigold-otter-0100` |
| Verified by | [`374d195e…`](https://testnet.cspr.live/transaction/374d195e3109956057e3b12134f0d3b772fac49249a7cdbba6472fb1d2ec192b) — block 9,777,155, no error, 24.724079 WCSPR to the creator |

Content for all three is harmless fixture material on unlisted gists; each
payload carries a secret word, so quoting it back proves the unlock was real
and not guessed.

## How to buy

`GET /api/casper/discover` lists every Casper-enabled link with title, teaser
and USD price — it never leaks `contentUrl`. `/.well-known/x402` advertises the
supported scheme.

Then hit the agent endpoint. Unpaid, it answers `402` with an `accepts` array
whose Casper entry is `scheme: "exact"`, `network: "casper:casper-test"`, asset
WCSPR. Sign the authorization, retry, and the body is the content; the
`X-Payment-Response` header carries the settlement hash.

```js
import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { createClientCasperSigner } from '@make-software/casper-x402';
import { ExactCasperScheme } from '@make-software/casper-x402/exact/client';

const signer = await createClientCasperSigner('./agent-secret.pem');
const client = new x402Client(
  (_v, opts) => opts.find((o) => o.network.startsWith('casper:')) ?? opts[0],
).register('casper:*', new ExactCasperScheme(signer));

const res = await wrapFetchWithPayment(fetch, client)(
  'https://casper.picomicropay.nl/api/content/01a9a58a-fd7e-4c09-a935-8c4657def4e3',
);
console.log(await res.json()); // { contentUrl, title, type }
```

Pico's own buyer is `agent/x402-buyer.mjs`:

```
PICO_BASE_URL=https://casper.picomicropay.nl \
  node agent/x402-buyer.mjs --link 01a9a58a-fd7e-4c09-a935-8c4657def4e3
```

### Holding plain CSPR instead

`GET /api/casper/content/<id>` is the node-verified twin for agents that hold
CSPR rather than WCSPR. Unpaid it returns `402` with `payTo`, `amountMotes` and
a `transferId`; send a native transfer with that transfer id as the memo, then
retry with `X-Casper-Deploy-Hash: <hash>`. Pico fetches the deploy from the
node and checks execution, recipient and amount before releasing the content.
A payment made but not yet finalised gets `202` + `Retry-After`, never a second
`402`, so a retrying client cannot be billed twice. This route is **not** part
of the three verifications above, which all went through the standard WCSPR
flow.

## Notes for whoever buys these

- **Bring WCSPR, not CSPR**, for the standard flow — the facilitator settles a
  CEP-18 transfer. Gas is on the facilitator; the buyer only signs.
- **Prices are deliberately tiny** — a cent to a nickel. They are sized so a
  testnet agent with a modest WCSPR balance can buy all three and still have
  something left, not to reflect what this content is worth.
- Prices are stored in USD and converted at the live CSPR spot rate at request
  time, so the WCSPR figures above drift with the rate. Verification allows 5%
  slippage.
- Settlement took a few seconds per purchase; all three cleared first try, 0
  failures.

## Two caveats, honestly

1. **The three settlements above were recorded badly, and that is now fixed.**
   At the time of those purchases `/api/content/[id]` wrote
   `tx_hash = 'x402:pending'`, `payer_address = 'x402:unknown'` and
   `chain = 'base'` for every agent unlock, because `@x402/next` does not hand
   the settlement to the route handler — and the handler runs *before*
   settlement, so a payment that failed to settle still got a row. The hashes
   above were read off the response header, not out of the database.

   `withDynamicX402` now decodes the `PAYMENT-RESPONSE` header that `withX402`
   sets after settling and passes the result to an `onSettled` callback, so the
   row carries the real transaction hash, the real payer and the real chain —
   and only a successful settlement produces one. Verified by a fourth purchase
   of link A against a local server:
   [`1daf36ce…`](https://testnet.cspr.live/transaction/1daf36ce9041ebb7bc07b0fc27a3621cb2fd07035f62e1b6aa4cbf31c159a71d),
   block 9,777,307, recorded as
   `payer_address = 0074f577…`, `chain = 'casper-test'`.

   The three rows from the original verifications still hold the placeholder
   values — they predate the fix and have not been backfilled, so the creator
   dashboard still files those three unlocks under the Base rail.
2. **The gated content sits on unlisted GitHub gists**, not in the project's
   Vercel Blob store like the other paid links, because the local Vercel OIDC
   token had expired and could not be refreshed in that session. Unlisted gists
   are reachable by URL only, which matches how a released `contentUrl` behaves,
   but if these links outlive the cross-test the content should move to Blob.

## Spend

Verifying the three cost $0.08, 39.56 WCSPR; the fourth purchase that checked
the settlement-recording fix cost another 4.79. The agent key
`0074f57790338ce156e5b346bd71d5914fdb7a6150bc73ec44a28090d29dc93c5a` is down to
**2.296 WCSPR, below the price of the cheapest link** — it cannot buy anything
here again until it is topped up. It does hold ~495 native CSPR.

### Topping the agent key up

Wrapping native CSPR into WCSPR is no longer unbuilt work — `agent/wrap-cspr.js`
landed on 11 Nov 2026, the day after this doc first said it did not exist:

```
node agent/wrap-cspr.js --amount 25
```

The key defaults to `agent/keys/agent-secret.pem`, so no `CASPER_AGENT_KEY_PATH`
is needed. The script needs Odra's `proxy_caller_with_return.wasm` session wasm
to make the payable `deposit` call; it defaults to the copy in the Odra 2.9.0
crate under `~/.cargo`, and `ODRA_PROXY_CALLER_WASM` overrides it. Gas for the
session wasm is capped at 10 CSPR and comes out of the native balance. There is
no npm script, so run it with `node` directly.

**How much to wrap is a security decision, not a logistics one.** Casper has no
scoped keys yet — Smart Accounts are a 2026/2027 roadmap item — so until they
ship, *the agent's balance is its spending cap*. There is no limit, allowlist,
expiry or revocation behind it. Wrap what you would accept losing if the key
leaks, not the whole native balance. See
[`agent-custody-and-quoting.md`](./agent-custody-and-quoting.md).

A note on the figures above: prices are fixed in USD, so the WCSPR amounts drift
with the CSPR rate. Link A was 4.944816 WCSPR when it settled on 9 Nov and
quoted 6.317040 WCSPR on 14 Nov — 28% more for the same one cent. Size any
top-up against the current quote, not the numbers in this table.
