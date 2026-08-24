---
id: BUG-0296
title: One transient kline error permanently disables chart history loading for all timeframes
type: bug
status: in-progress
priority: P2
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
assignee: opencode
---

# BUG-0296 — One transient kline error permanently disables chart history loading for all timeframes

## Symptom

In a lightweight-charts candle window the user cannot scroll back into the
past — older candles are never appended. The browser console shows:

```
[NETWORK] fetchBitunixKlines error for ICPUSDT Error: apiErrors.klineError
/api/klines?provider=bitunix&...&endTime=1787194619999 → 500 (Internal Server Error)
```

The trigger is sporadic (a retry minutes later often succeeds), but once it
happens the chart window stays broken: scrolling back loads nothing anymore,
and **every timeframe in that same window** is affected until the app or
window is reloaded.

## Evidence

**Demonstrated** — observed in a live session (2026-08-24): repeated client
errors above while scrolling back on ICPUSDT. Reproduction of the trigger
layer:

- Direct calls to the Bitunix kline endpoint with the exact parameter shapes
  our proxy sends (`interval`, `limit`, ms timestamps, `endTime` alone)
  return HTTP 200 / `code: 0` — the request parameters are correct.
- Therefore the 500 is a *transient* upstream failure (Bitunix 5xx /
  non-zero business code) passed through by
  `src/routes/api/klines/+server.ts`.

The permanent layer is derived directly from the code chain (quoted below).

## Cause

Two layers compound:

1. **Transient trigger:** Bitunix sporadically answers a valid kline request
   with an error. The proxy retries only 3× at a flat 250 ms backoff and maps
   everything not matching its "symbol not found" heuristic to a thrown
   error; the SvelteKit route turns that into a 500.
2. **Permanent bug (the real defect):** error ≠ exhausted is not
   distinguished anywhere downstream:
   - `HistoryFetcher.loadMoreHistory`
     (`src/services/marketWatcher/historyFetcher.ts`) catches **all**
     exceptions and `return false` — the same value that means "no more
     history".
   - `CandleChartView.loadMore`
     (`src/lib/windows/implementations/CandleChartView.svelte`) treats any
     `false` as final: `if (!hasMore) allHistoryLoaded = true`.
   - The scroll handler then never calls `loadMore()` again for the lifetime
     of the component, and `allHistoryLoaded` is not reset when `symbol` /
     `timeframe` props change — so one blip poisons every timeframe of that
     chart window until remount/reload.

## Fix

1. `HistoryFetcher.loadMoreHistory` returns an explicit result instead of an
   ambiguous boolean: `"loaded" | "exhausted" | "error"` ("loaded" = newer
   candles appended, "exhausted" = fetch succeeded but nothing older exists,
   "error" = the fetch failed). The delegate in
   `src/services/marketWatcher.ts` follows the new type.
2. `CandleChartView.loadMore` sets `allHistoryLoaded = true` only on
   `"exhausted"`; on `"error"` the flag stays false so the next scroll-left
   retriggers. Reset `allHistoryLoaded` (and loading state) when `symbol` or
   `timeframe` changes.
3. Proxy resilience in `src/routes/api/klines/+server.ts`: staged backoff
   instead of flat 250 ms and treat HTTP 429 as retryable with Retry-After
   respect (bounded), without weakening the 404/"Symbol not found" mapping.

## Acceptance criteria

- [ ] A unit test proves `loadMoreHistory` reports `"error"` when the kline
      fetch rejects (fails without the fix, which returned `false`)
- [ ] A component test proves `allHistoryLoaded` stays `false` after a failed
      load attempt and the next visible-range event triggers another
      `loadMoreHistory` call
- [ ] A component test proves `allHistoryLoaded` becomes `true` only after an
      `"exhausted"` result, and is reset when the symbol/timeframe changes
- [ ] The proxy retries 429 responses honoring a bounded `Retry-After`, and
      uses staged backoff across attempts
- [ ] Existing "symbol not found" → 404 behaviour unchanged (regression tests
      stay green)

## Out of scope

Reworking the WebSocket live-update path or initial-load strategy; changing
rate-limit budgets/polling cadence elsewhere; redesigning the synthetic
timeframe paging walk (`BUG-0231`); UI copy/toasts for history errors beyond
keeping the existing spinner honest.

## Links

- `src/services/marketWatcher/historyFetcher.ts` (`loadMoreHistory`)
- `src/services/marketWatcher.ts` (`loadMoreHistory` delegate)
- `src/lib/windows/implementations/CandleChartView.svelte` (`loadMore`,
  `handleVisibleLogicalRangeChange`)
- `src/routes/api/klines/+server.ts` (upstream retry loop)
- `docs/adr/0009-candle-depth-and-background-store-isolation.md`

Branch: `fix/bug-0296-chart-history-retry`
