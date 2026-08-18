# ADR-0009: Candle history is requested through the backfiller, never straight from the venue

- **Status:** Proposed
- **Date:** 2026-08-18
- **Deciders:** pheinze82

## Context

Bitunix truncates every kline response at 200 rows. It does not reject a larger
`limit`, it does not say it truncated, and it returns HTTP 200. The proxy log
records the mismatch plainly:

```
[Bitunix API] BTCUSDT:1h requested 1000 with end undefined. Got 200.
```

`HistoryFetcher.ensureHistory()` (`src/services/marketWatcher/historyFetcher.ts`)
was written for exactly this: it walks backwards in `endTime` windows, merges,
fills gaps, persists to IndexedDB, and marks a symbol/timeframe exhausted when
the venue runs out. Its own comment says so — *"Parallel Backfill (Hardened for
Bitunix 200-candle limit)"*.

Two call sites bypassed it and asked `apiService` directly for more than one
response could hold:

1. `MarketAnalystService.processNext()` requested 1000 candles per timeframe so
   it could compute an EMA 200. It received 200. The EMA could not converge, the
   trend read `"neutral"`, and the analyst's own freshness gate treated that as
   "retry" — a loop whose exit condition was unreachable over the path it had
   chosen. It re-fetched every timeframe of every favourite every ~8 seconds
   indefinitely, starving the live ticker and technicals feeds that share
   `RequestManager`'s concurrency budget of 8 (`BUG-0230`).
2. `apiService.fetchBitunixKlines()` scaled synthetic timeframes as
   `limit * multiplier` in a single call. A 6m request funded by 1m candles
   asked for 3600 and received 200, which aggregated to 33 target candles.
   RSI(14) still rendered; EMA 200 could not exist. The panel looked functional
   rather than starved (`BUG-0231`).

Both defects are the same mistake: treating a venue response as if the
requested size were the delivered size. Neither surfaced as an error, which is
why both survived for months.

## Decision

**Any code path that needs more candles than a single venue response can carry
requests them through the backfiller, not through a direct `apiService` kline
call.**

Concretely:

- `HistoryFetcher.ensureHistory(symbol, tf, targetLimit?)` takes an optional
  target so a caller can state its own warm-up depth instead of inheriting the
  chart's. Callers read the result from `marketState`, which is also the cache
  the chart and technicals panel read — one fetch, shared.
- `apiService.fetchBitunixKlines()` pages internally whenever base-candle demand
  exceeds `BITUNIX_MAX_ROWS_PER_REQUEST`. The whole walk runs inside one
  scheduled request, so it consumes one concurrency slot, not one per page.
- An indicator's required depth is stated as a constant with its reasoning.
  `ANALYST_HISTORY_TARGET = 600` is 3× the EMA 200 period, the point at which
  the seed value stops dominating an EMA.
- **A truncated or capped fetch is logged.** `MAX_KLINE_PAGES = 20` bounds a
  single request; when it binds, the log names the resulting candle count. A
  fetch that silently delivers a third of what was asked for is the failure
  mode this ADR exists to prevent, so it may not be reintroduced as a quiet
  optimisation.

A corollary, learned from the same incident: **a retry loop's exit condition
must not depend on the quality of the data it fetched.** Freshness is decided by
age. Data that could not be computed is recorded as `"unknown"` — a state
distinct from a real reading — and retried on exponential backoff, so a symbol
that genuinely lacks history settles instead of spinning.

## Consequences

### What this enables

- EMA 200 and other long-look-back indicators are computable on every timeframe
  the UI offers, including synthetic ones.
- The analyst warms the same store the visible UI reads, so a symbol analysed in
  the background costs the chart nothing when the user opens it.
- Failures are visible. A capped fetch says what it delivered; an unmeasurable
  trend says it is unmeasurable rather than reporting "neutral".

### What this costs

- **A cold start is more requests, not fewer.** 600 candles is three round trips
  per symbol/timeframe instead of one. The first fill of four favourites across
  four timeframes is ~48 requests where it used to be 16 — the difference is
  that it now happens once and stops, rather than every 8 seconds forever.
- Latency per analyst cycle rises: timeframes are fetched sequentially so the
  page walk does not exceed the global concurrency budget. The analyst is a
  background job; this is the correct side of that trade, but it does mean a
  cold dashboard takes tens of seconds rather than seconds to fill.
- `MAX_KLINE_PAGES` means very large multipliers still cannot reach an arbitrary
  depth. A 12m timeframe tops out around 333 candles. That is enough for EMA 200
  and is logged when it binds, but it is a ceiling, not an absence of one.

### What is now forbidden

- Calling `apiService.fetchBitunixKlines()` / `fetchBitgetKlines()` with a limit
  above the venue's per-response cap and treating the result as complete.
- Gating a retry, a cache skip, or a scheduling interval on whether an indicator
  produced a usable value.
- Collapsing "not measurable" into a neutral or bearish reading — in a store, in
  a computation, or in the UI. `TrendState` carries `"unknown"` for this, and it
  must survive to the surface. A user sizing a position may not be shown a
  fabricated signal where data is missing.
- Capping, sampling or truncating a fetch without logging what was dropped.

## Alternatives considered

**Lower the indicator requirements to fit 200 candles.** Rejected: EMA 200 on
200 candles is dominated by its seed, so the number would be presented with a
confidence it does not have. In a tool that sizes real positions, a wrong
indicator is worse than an absent one. (The honest-`"unknown"` half of this
alternative was kept — it is what makes the retry loop terminate.)

**Raise `RequestManager.MAX_CONCURRENCY` so parallel timeframes fit.** Rejected:
it treats a symptom. The queue was saturated because one background job issued
unbounded repeat work; more lanes would have hidden that for longer.

**Cache aggressively and accept stale analysis.** Rejected as a primary fix —
caching a value that was never correct does not make it correct. Caching is
still used, but downstream of a fetch that now delivers what it promised.

**Move the analyst into a Web Worker.** Not rejected, deferred. It would relieve
main-thread contention (`requestIdleCallback` never firing was why the
technicals panel stalled), but it does not fix the request storm and would have
made the storm harder to observe. Worth revisiting once this load profile is
confirmed settled in production.
