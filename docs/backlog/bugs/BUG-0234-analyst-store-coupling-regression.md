---
id: BUG-0234
title: Analyst backfill through the shared store makes the whole UI flicker continuously
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: market-data
data_class: none
adr: ADR-0009
depends_on: [BUG-0230]
---

# BUG-0234 — Analyst backfill through the shared store makes the UI flicker

## Symptom

Worse than the defect it followed. Every card and the Technicals panel blank
and refill continuously, permanently, **without opening the Market Overview
window at all**. Reported against the fix for `BUG-0230`, which introduced it.

Observed with 12 favourites and `analyzeAllFavorites` on: the dashboard sits at
"2 of 12 analysed" while cards show "No market data available" and the
Technicals panel shows only a spinner.

## Evidence

*Demonstrated* — user-reported with a screenshot, and derived from the two code
paths below. The prior flicker needed the Market Overview window open; this one
does not, because the analyst runs unconditionally.

## Cause

`BUG-0230` routed the analyst's history through
`marketWatcher.ensureHistory()`, intending to share one cache between the
analyst and the visible UI. Sharing the store turned out to mean sharing its
reactivity, in two ways:

1. **Forced recalculation.** `ensureHistory()` ends with
   `activeTechnicalsManager.forceRefresh(symbol, tf)`
   (`historyFetcher.ts:204`). That call discards the worker's warm state and
   recomputes the entire indicator set. It is correct for a UI-driven backfill
   — the panel is waiting on it — but the analyst sweeps every favourite across
   four timeframes, so with 12 favourites one sweep became 48 full
   recalculations in a burst.
2. **Store writes.** Every backfill batch lands via
   `marketState.updateSymbolKlines(..., "rest")`, which applies immediately and
   reassigns `data[symbol]`. Each write fires the per-symbol `$effect` that
   `activeTechnicalsManager.startMonitoring()` registers, scheduling still more
   work — and re-renders every component reading that symbol.

Both saturate the main thread. Non-active tiles schedule their updates through
`requestIdleCallback`, which never gets idle time on a saturated thread, so
they blank and refill. That is the flicker.

The deeper mistake was architectural: **background work was moved into the
store the foreground renders from.** The request-count win was real but small;
the coupling cost was the entire visible UI.

## Fix

The analyst fetches directly again and does not touch `marketState`:

```ts
return provider === "bitget"
    ? apiService.fetchBitgetKlines(symbol, tf, ANALYST_HISTORY_TARGET, ...)
    : apiService.fetchBitunixKlines(symbol, tf, ANALYST_HISTORY_TARGET, ...);
```

This is not a revert to the pre-`BUG-0230` state. The reason the direct call
was insufficient before was depth — a request for 1000 silently returned 200,
so the EMA 200 could not converge. `BUG-0231` fixed that inside `apiService`,
which now pages past the venue's row cap on its own. The direct call delivers
the full 600 candles without involving the store at all.

Everything else from `BUG-0230` stands: age-gated freshness, the
`"unknown"`/`"neutral"` split, exponential backoff on partial results, and
recording failures so the fast path terminates.

## What this costs

The analyst loses its IndexedDB cache, and a symbol the UI also displays is
fetched twice (modulo `RequestManager`'s 10s dedup window). Accepted: the
analyst has its own freshness cache in `analysisState`, and correctness of the
visible UI outranks request count.

## Acceptance criteria

- [x] The analyst writes nothing into `marketState` (regression test asserts
      the store stays empty across a full sweep)
- [x] No forced technicals recalculation originates from analyst activity
- [x] Candle depth for EMA 200 is still reached, via `apiService` paging
- [x] Twelve favourites with `analyzeAllFavorites` on produce no flicker in the
      running app (manual — the environment available here runs the preview
      pane hidden, which throttles exactly the timers involved)

## Out of scope

- Removing `ensureHistory`'s `targetLimit` parameter. It is now only exercised
  by tests, but it lets a test pin a specific depth instead of pulling the full
  2000-candle chart history, and it is documented. Revisit if a second unused
  parameter accumulates there.

## Links

- `docs/backlog/bugs/BUG-0230-market-analyst-fetch-storm.md`
- `docs/adr/0009-candle-depth-and-background-store-isolation.md`
