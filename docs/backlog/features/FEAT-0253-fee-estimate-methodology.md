---
id: FEAT-0253
title: Make the calculator's entry/exit fee estimate honest about what it assumes
type: feature
status: in-progress
assignee: pheinze
branch: worktree-issue-2164-14da99
priority: P1
milestone: none
editions: [community, pro, private]
area: calculator
data_class: A
adr: none
depends_on: []
---

# FEAT-0253 — Make the calculator's entry/exit fee estimate honest about what it assumes

## Problem

`calculateBaseMetrics` (`src/lib/calculators/core.ts`) applies one flat
`values.fees` rate identically to both the entry fee and the simulated
stop-loss exit fee:

```js
entryFee = orderVolume × feeFactor
slExitFee = positionSize × stopLossPrice × feeFactor   // same feeFactor
```

Two problems with this:

1. **Entry fee ignores the order type the user actually picked.** A Market
   order is a taker fill; a Limit order is (usually) a maker fill — these
   carry different rates on Bitunix, but `entryFee` uses the same flat rate
   either way.
2. **Exit fee is not "the" fee, it's a guess presented as a fact.** At
   simulation time it is genuinely unknowable — the position might close via
   the stop-loss (market or limit, depending on `slOrderType`), the take-profit,
   or a manual close, each potentially at a different rate. The UI currently
   shows `Exit Fee` with no indication that this is an assumption, not a
   quote.

There is also dead infrastructure suggesting this was meant to be more
accurate: `tradeState.feeMode`, `remoteMakerFee`/`remoteTakerFee` and the
"sync fee" button in `GeneralInputs.svelte` exist, but nothing in the
codebase ever populates `remoteMakerFee`/`remoteTakerFee` — the sync button
is currently a no-op.

> **Since resolved.** This paragraph used to end "so *sync from REST* may not
> even be achievable". It is achievable, just not the way it was being looked
> for: there is no fee-*tariff* endpoint, but every fill carries the fee that
> was actually charged plus its `roleType`, and Cachy already fetches those.
> See decision 1 below.

## Proposal

- Use the order type actually selected (`entryType`: market/limit) to pick
  the entry-fee rate, once a real maker/taker rate source exists — until
  then, keep the flat rate but say so.
- Treat the exit fee explicitly as a worst-case estimate (taker-equivalent)
  rather than an implied fact, and say so in its tooltip — this is the
  direction that protects the user from underestimating risk, and is the
  de-facto behavior already.
- Either wire up `remoteMakerFee`/`remoteTakerFee` to a real data source (if
  one exists on Bitunix — needs research, see Open Questions) and make the
  "sync fee" button functional, or remove the dead sync affordance so the UI
  does not suggest a capability that does not exist.

## Decisions — settled 2026-08-31

Taken after FEAT-0328 hit the same wall from the other side. Recorded here
because this item now owns the fee model; do not re-open them during
implementation.

**1. The broker's fees are the source of truth, and they are reachable —
just not as a tariff.**

There is no fee-rate endpoint. Verified twice: the repo's crawl
(`docs/bitunix-api/`) has none, and the live navigation of Bitunix's own API
docs lists Account (6), Common, CopyTrading, ErrorCode, Market (6),
Position (3), Tp sl (7), Trade (11) and Websocket with no fee, commission or
VIP-tier endpoint anywhere. `get_single_account` returns balances and PnL, no
rate.

What *is* reachable is the amount actually charged, per fill:
`GET /api/v1/futures/trade/get_history_trades` returns `fee`, `roleType`
(`MAKER`/`TAKER`), `price`, `qty` and `orderType` on every trade record
(`docs/bitunix-api/07_trade.md:336`). So the effective rate is

```
rate = fee / (price × qty)          grouped by roleType
```

That is not an estimate — it is what the broker took. It carries the account's
VIP tier, promotions and discounts automatically, which is why **the user
never enters a VIP level**: the number already contains it, and Cachy has no
reason to know or display the tier itself.

Cachy already fetches this endpoint —
`src/routes/api/sync/+server.ts:117` (`fetchBitunixHistory`), listed as
integrated in `docs/bitunix-api/INTEGRATION_STATUS.md:84`. The fills are
already arriving for the Journal. This is a computation over data on hand, not
a new integration.

**2. Resolution order for the rate**, most authoritative first:

| Source | Shown as | When |
| --- | --- | --- |
| Derived from the broker's own fills | "from broker" | a fill of that role exists |
| Venue default (Bitunix VIP 0: 0.02 / 0.06) | "assumed — no fills yet" | fresh account, that role unseen |
| User-entered value | "manual" | paper trading, or a deliberate override |

Provenance is displayed, always. A number the broker never sent must never be
labelled as coming from the broker.

**3. Per leg: entry is derived, exit is assumed conservatively.**
Entry follows the order type Cachy actually holds — `MARKET` → taker,
`LIMIT` → maker. Exit is genuinely unknowable when the plan is made (ADR-0010:
"decided after the fact"), so it is assumed **taker**, the expensive side. A
risk tool errs toward overstating cost.

**4. The Settings MAKER/TAKER buttons become the exit-leg assumption**, not a
display preference. Default taker. Choosing maker is choosing the optimistic
assumption and is labelled as such — legitimate for someone who only ever
closes with resting limits, but it should be a deliberate, visible choice.

**Known hazards for the derivation** (each needs handling, not hand-waving):

- A fresh account has no fills — fall back, and say so, never show a zero.
- `fee` is denominated in the margin coin; `fee / (price × qty)` yields a
  fraction, and Cachy stores a **percentage** (`0.06` = 0.06%). Multiply by
  100 exactly once. See BUG-0329 for what the unit confusion costs.
- Maker rebates can make `fee` negative on some venues — keep the sign rather
  than taking an absolute value.
- Discount tokens, bonus balances and coupons can distort a single fill's
  implied rate. Prefer a median or a recent-window aggregate over one fill.
- `decimal.js` throughout — never `parseFloat`.

## Acceptance criteria

- [ ] `remoteMakerFee`/`remoteTakerFee` are populated by deriving
      `fee / (price × qty)` per `roleType` from the fills Cachy already syncs.
      Proven by a test with synthetic fills asserting both rates.
- [ ] The derivation is robust to the hazards listed above: no fills, negative
      fee, and a single outlier fill each have a pinned expected behaviour.
- [ ] The entry-fee rate follows the selected order type (`MARKET` → taker,
      `LIMIT` → maker).
- [ ] The exit-fee rate defaults to taker, and the Settings selector changes
      that assumption rather than "what is displayed".
- [ ] The Entry Fee tooltip states plainly which rate it assumes and why.
- [ ] The Exit Fee tooltip explicitly says it is a worst-case assumption,
      not a quote from the exchange.
- [ ] Every displayed fee carries its provenance — "from broker", "assumed",
      or "manual" — and a fee never sourced from the broker is never labelled
      as if it were.
- [ ] The "sync fee" affordance in `GeneralInputs.svelte` either works or is
      gone; it must not stay a dead control.
- [ ] With a broker connected the trade panel's fee field mirrors the derived
      rate read-only, the way the leverage field does since FEAT-0328; it
      stays editable in paper trading and when no rate could be derived.

## Out of scope

- Modeling take-profit exit fees separately from stop-loss exit fees.
- Restating past journal entries. The derivation reads history to learn the
  *rate*; it does not rewrite what closed trades recorded as paid.
- Raising `CONSTANTS.DEFAULT_FEES` — that is BUG-0329, deliberately separate so
  the optimistic default can be corrected without waiting for this model.

> Note: "per-trade historical fee reconciliation" was previously listed here as
> out of scope. It is now the core mechanism — see decision 1. Reading the
> fills is the only way the broker's own rate is obtainable at all.

## Open questions

None blocking. The one that stood here — whether Bitunix exposes a fee tier or
maker/taker rate on some endpoint outside the crawl — is answered no, verified
against the live API-docs navigation, and decision 1 records what replaces it.

## Links

- `src/lib/calculators/core.ts` (`calculateBaseMetrics`)
- `src/components/inputs/GeneralInputs.svelte` (fee sync UI)
- `src/stores/trade.svelte.ts` (`feeMode`, `remoteMakerFee`, `remoteTakerFee`)
- `docs/bitunix-api/02_account.md`
