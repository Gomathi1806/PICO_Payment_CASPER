# Agent-first: custody, quoting and receipts

Design note, 14 Nov 2026. Written after deciding that Pico's primary buyer is
an autonomous agent, not a human reader.

The question this note answers: **if we design for agents, what actually has to
change in Pico?** The short answer is that none of it is wallet code. Our seller
side is already custody-neutral. What needs work is the *quote*, the *window*
and the *receipt*.

| | |
|---|---|
| Decision | Agent / API access is the product; creator storefront is secondary |
| Store | `https://casper.picomicropay.nl` |
| Rails | `casper:casper-test` (WCSPR), `eip155:84532` (USDC) |
| Status | Analysis only — no code changed yet |

## 1. Who holds the wallet

Three setups, in increasing order of what a business will tolerate:

| | Model | Who signs | Where it is used |
|---|---|---|---|
| 1 | Agent holds its own key | agent, alone | demos, hobby agents, today's x402 |
| 2 | Human owns funds, agent holds a **scoped key** — caps, allowlist, expiry, revocable | agent, within limits | where businesses are heading |
| 3 | Agent pays small amounts alone, human **co-signs** large ones | both | business spend above a threshold |

Legal liability sits with the human or company in all three. A machine cannot
hold it, so whoever funded and authorised the agent answers for what it does.
That matters less for our contract law and more for who demands an invoice.

**For Pico:** the creator is always the human receiving money. On the payer
side it is whoever controls the agent's key. We should design for model 2,
because businesses will not let an agent hold unrestricted funds — and on
Casper, as section 2 sets out, models 2 and 3 already exist at the contract
level, so this is not a bet on a future protocol feature.

## 2. What Casper supports today

There are two separate questions here, and conflating them gives the wrong
answer.

**At the protocol level, scoped keys are not shipped.** The Casper Manifest
(12 May 2026) lists Smart Accounts — protocol-native account abstraction,
session keys with time-bounded permissions, programmable spending limits, "AI
Agent accounts with limited scope permissions" — as a **roadmap item targeted
2026/2027**. The near-term list is x402 micropayments, then EVM compatibility
and compliant security tokens. Smart Accounts are not in it, and the protocol
enhancement proposals that would specify the permission model have not been
published.

Source: [casper.network/roadmap](https://www.casper.network/roadmap). Most
secondary coverage is sponsored press release material, so treat announced
timings as promotional.

**At the contract level, models 2 and 3 already work.** Chainleash — one of the
five teams Casper announced into the Forward directory on 12 Nov 2026 — runs an
agent that stakes CSPR under rules enforced by a Casper contract: validator
allowlists, **spending caps**, a **human co-sign on large moves**, and
withdrawals only the owner controls. No account abstraction required.

So the honest position is not "model 1 only". It is: **a payer who wants limits
has to get them from a contract they deploy or use, not from their account.**
Nothing in Pico needs to change for that — a contract-controlled payer still
signs an authorization like any other — but it does mean models 2 and 3 are
real counterparties today rather than a 2027 hypothetical, and the gaps in
sections 5 and 6 are live problems rather than future-proofing.

**Worth watching in the same cohort:** Veridex describes itself as open-source
rails for AI agent payments — identity, spending controls, service discovery and
verifiable transactions across several chains. That overlaps our
`/api/casper/discover` and the principal-vs-agent problem in section 6 directly;
it is either the closest competitor or the most useful integration. CSPR402 is
also listed among the existing Forward teams and the name suggests overlap with
our rail. Neither has been assessed.

## 3. What is already custody-neutral

The seller side genuinely does not care how the buyer custodies a key. A
signature is a signature. Specifically, nothing in our verification path
inspects the payer's account type:

- `/api/content/[id]` answers `402` with a standard `accepts[]` array
- the Casper entry is `scheme: "exact"`, `network: "casper:casper-test"`, asset WCSPR
- settlement goes through the CSPR.cloud facilitator — the buyer signs, the
  facilitator pays the gas
- `/api/casper/discover` and `/.well-known/x402` advertise without leaking `contentUrl`

So the note's claim — "the agent just needs to pay the 402 price with whatever
key it has" — holds. The three gaps below are not custody problems. They are
places where our *pricing and record-keeping* assumptions were written for a
human buying one article, and quietly break for an agent operating under limits.

## 4. Gap one — our price floats, a spending cap does not

`src/lib/casper/price.ts` converts USD to motes at CoinGecko's spot rate:

```ts
export function usdToMotes(usd: number, rate: number): bigint {
  const cspr = usd / rate;
  const motes = BigInt(Math.ceil(cspr * Number(MOTES_PER_CSPR)));
  return motes < MIN_TRANSFER_MOTES ? MIN_TRANSFER_MOTES : motes;
}
```

The rate is cached 60 seconds in-process, with a `FALLBACK_RATE` if CoinGecko
fails. Verification allows 5% slippage via `minAcceptableMotes`, which takes
95% of the exact figure.

Note the asymmetry: **the slippage only protects downward.** It stops us
rejecting a payer who was quoted a moment ago and whose motes now look slightly
light. It does nothing about the quote itself rising.

That is the problem for a scoped key. The *cap* is denominated in CSPR or
WCSPR. Our *price* is denominated in USD. If CSPR falls 30%, the same $0.05
article costs 30% more WCSPR, and an agent with a hard per-call cap starts
failing mid-task — with no signal that the price "changed", because from our
side nothing did.

**This is not hypothetical — measured on our own link A ($0.01):**

| Date | WCSPR quoted | Implied CSPR/USD |
|---|---|---|
| 9 Nov 2026 | 4.944816 (settled on-chain) | ~0.002023 |
| 12 Nov 2026 | 5.424611 | ~0.001843 |
| 14 Nov 2026 | 6.317040 | 0.00158302 |

The same one-cent article cost **28% more WCSPR after five days**. An agent
given a 5 WCSPR per-call cap on 9 Nov — generous at the time, a 1% margin over
the price — would be failing outright today, and nothing in our API would tell
it why.

**Options, none free:**

| Approach | Good for | Cost |
|---|---|---|
| Keep USD quoting | creator revenue is stable | agent caps break on rate moves |
| Quote in token | agent caps hold | creator revenue swings with CSPR |
| Keep USD, publish rate + age in the 402 | agent can reason and set headroom | agent must implement the logic |

The third is the cheapest and should happen regardless — `price.ts` already
logs `rate`, `prev` and `prevAgeSec`, so the data exists. Putting the rate and
its age in the 402 `extra` costs us almost nothing and lets a disciplined agent
decide for itself.

## 5. Gap two — the 300-second window forecloses model 3

Our live `402` carries `maxTimeoutSeconds: 300`. The Casper client turns that
straight into the signed authorization's validity bound:

```js
const validBefore = now + paymentRequirements.maxTimeoutSeconds;
```

Five minutes is fine for an agent paying alone. It is often not enough for
"human co-signs big moves" — an approval that sits in a Slack message or a
phone notification routinely takes longer than five minutes.

**This is ours to fix, not a library limit.** `maxTimeoutSeconds` is part of
`PaymentRequirements` and is optional in `@x402/core`'s types; the 300 is a
default we are inheriting, not a constraint. We can set it per resource.

Irrelevant while we sell $0.05 articles. Decisive if agent-first means selling
$50 datasets, which is where the directory volume actually is.

**This is no longer hypothetical.** Chainleash ships a human co-sign on large
moves on Casper today (section 2), so a payer whose owner must approve a
purchase is a counterparty we can actually meet — and our 300-second window
would reject them. This should move up the order of work the moment we price
anything above pocket change.

## 6. Gap three — we record the agent, not the principal

We write `payer_address` from the settlement response. Under models 2 and 3
that address is the **agent's** account, not the company that funded it.

So our creator dashboard and any receipt we produce name a robot, when the
party who has to reconcile that line in an expense report is the business
behind it. x402 carries no principal field by default.

The businesses that insist on scoped keys are exactly the ones that need this.
"Agent-economy receipts a finance team can actually reconcile" is genuinely
unsolved, and is closer to a product than a chore.

## 7. The gap none of this covers — remedy

Liability answers *who is responsible*. It does not answer *what happens when
the purchase was wrong*.

Pico has no refund path at all. We confirmed this on 14 Nov: a buyer paid $0.50
for `my daily 5 prompt` 144 days ago, against a link whose gated content field
was empty. There is no mechanism to make that right.

Ignorable at consumer micro-amounts. Not ignorable for business agent spend,
where an agent buying the wrong thing is a routine operational event rather
than an incident.

This is also the clearest seam with **GuildNet** (Jaja Samson, cohort 1):
escrow, reputation scoring and dispute flags are its whole design, and they are
the missing half of our rail. GuildNet coordinates and judges agents; Pico
charges them. Neither of us has to build the other.

## 8. Proposed order of work

1. ~~**Publish rate and age in the 402 `extra`.**~~ **Done and settlement-tested,
   14 Nov.** `getCsprUsdQuote()` in
   `src/lib/casper/price.ts` returns `{ rate, ageSec, source }`;
   `src/lib/x402-config.ts` puts `priceUsd`, `rateUsd`, `rateAgeSec` and
   `rateSource` in the Casper `extra`. `name` and `version` are untouched
   because `buildDomain()` reads them positionally into the EIP-712 domain.
2. **Make `maxTimeoutSeconds` configurable per link**, with a longer default
   above some price threshold. Needed before any high-value item.
3. **Decide USD vs token quoting.** This is a product decision, not a technical
   one, and it should be made deliberately rather than inherited.
4. **Add a principal field to receipts**, populated when the payer supplies one.
   Optional, ignored by model 1 agents, essential for business buyers.
5. **Refunds — scope with GuildNet rather than alone.**

## Two caveats, honestly

1. **No code has changed.** This note is analysis against the repo as it stands
   on 14 Nov 2026. Line references are to `src/lib/casper/price.ts` and the
   live `402` response from `casper.picomicropay.nl`.
2. ~~**Model 2 is untestable on Casper today.**~~ **Corrected 14 Nov.** That was
   true only of protocol-native Smart Accounts. Chainleash enforces spending
   caps and human co-sign through a Casper contract right now, so models 2 and
   3 are testable against a real counterparty — just not via account
   abstraction. See section 2.
3. ~~**Step 1 is verified for shape, not for settlement.**~~ **Settled.** The
   agent key was topped up (wrapped to 10.666334222 WCSPR) and link A was
   bought end-to-end against a local build carrying the new fields:

   | | |
   |---|---|
   | Transaction | [`817af85b…`](https://testnet.cspr.live/deploy/817af85bb17e1d3154ccbdd24368c2724a7f15754cf09e1270399332afbf6f3a) |
   | Block | 9,832,152 |
   | Execution | no error, gas consumed 1.121085257 CSPR (facilitator's) |
   | Paid | 6.300284143 WCSPR — matches the quote exactly |
   | Agent balance | 10.666334222 → 4.366050079 WCSPR |

   **The CSPR.cloud facilitator accepts the extended `extra`.** It does not
   reject unknown keys, and the EIP-712 domain is unaffected, as expected from
   `buildDomain()` reading `name` and `version` positionally. Safe to deploy.
