---
id: FEAT-0253
title: Make the calculator's entry/exit fee estimate honest about what it assumes
type: feature
status: idea
priority: P3
milestone: none
editions: [community, pro, private]
area: calculator
data_class: none
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
is currently a no-op. Bitunix's documented API (`docs/bitunix-api/`) also has
no endpoint for the account's actual maker/taker fee rate or VIP tier, so
"sync from REST" may not even be achievable with the current doc crawl.

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

## Acceptance criteria

- [ ] The Entry Fee tooltip states plainly which rate it assumes and why
      (flat rate vs. order-type-aware, whichever is implemented).
- [ ] The Exit Fee tooltip explicitly says it is a worst-case assumption,
      not a quote from the exchange.
- [ ] `remoteMakerFee`/`remoteTakerFee` either resolve to a real fetch, or
      the "sync fee" UI is removed/disabled with a reason shown.

## Out of scope

- Modeling take-profit exit fees separately from stop-loss exit fees.
- Per-trade historical fee reconciliation (Journal already has actual paid
  fees per closed trade via REST history).

## Open questions

- Does Bitunix expose account fee tier / maker-taker rate through any
  endpoint not yet in the `docs/bitunix-api/` crawl? If not, the
  "sync fee" affordance should probably be removed rather than left dead.

## Links

- `src/lib/calculators/core.ts` (`calculateBaseMetrics`)
- `src/components/inputs/GeneralInputs.svelte` (fee sync UI)
- `src/stores/trade.svelte.ts` (`feeMode`, `remoteMakerFee`, `remoteTakerFee`)
- `docs/bitunix-api/02_account.md`
