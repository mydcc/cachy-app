# ADR-0009: A candle request must deliver the depth it asks for, and background work stays out of the foreground's store

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

Two rules, and the second was learned the hard way — see the correction note
below.

**1. A candle request delivers the depth it asks for, or says it did not.**
`apiService.fetchBitunixKlines()` pages internally whenever base-candle demand
exceeds `BITUNIX_MAX_ROWS_PER_REQUEST`. The whole walk runs inside one scheduled
request, so it consumes one concurrency slot, not one per page. No caller has to
know the venue's row cap exists.

**2. Background work stays out of the store the foreground renders from.**
A service that sweeps many symbols on a timer does not write into `marketState`
and does not call through `HistoryFetcher.ensureHistory()`. It fetches, computes,
and publishes its own result to its own store.

`ensureHistory()` remains the right path for UI-driven history — the chart and
the technicals panel — where the caller *is* the foreground and the forced
recalculation at the end of it is exactly what the user is waiting for.
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
- Background analysis cannot degrade the visible UI, whatever its scope grows to.
- Failures are visible. A capped fetch says what it delivered; an unmeasurable
  trend says it is unmeasurable rather than reporting "neutral".

### What this costs

- **A cold start is more requests, not fewer.** 600 candles is three round trips
  per symbol/timeframe instead of one. The first fill of four favourites across
  four timeframes is ~48 requests where it used to be 16 — the difference is
  that it now happens once and stops, rather than every 8 seconds forever.
- **Rule 2 costs deduplication.** A symbol the analyst covers and the chart
  displays is fetched twice, beyond `RequestManager`'s 10s dedup window, and the
  analyst gets no IndexedDB persistence. This is the price of the isolation and
  it is worth paying: the attempt to avoid it is what BUG-0234 was.
- Latency per analyst cycle rises: timeframes are fetched sequentially so the
  page walk does not exceed the global concurrency budget. A cold dashboard
  takes tens of seconds rather than seconds to fill.
- `MAX_KLINE_PAGES` means very large multipliers still cannot reach an arbitrary
  depth. A 12m timeframe tops out around 333 candles. That is enough for EMA 200
  and is logged when it binds, but it is a ceiling, not an absence of one.

### What is now forbidden

- Treating any kline result as complete without the paging that makes it so.
- **Writing into `marketState`, or calling `ensureHistory()`, from a service
  that sweeps symbols on a timer.** `marketState` is what every visible tile
  renders from; a write to it schedules work on the main thread, and
  `ensureHistory()` additionally forces a full technicals recalculation. A
  background sweep doing either at scale starves the `requestIdleCallback` path
  every non-active tile depends on, and the whole UI blanks and refills.
- Gating a retry, a cache skip, or a scheduling interval on whether an indicator
  produced a usable value.
- Collapsing "not measurable" into a neutral or bearish reading — in a store, in
  a computation, or in the UI. `TrendState` carries `"unknown"` for this, and it
  must survive to the surface. A user sizing a position may not be shown a
  fabricated signal where data is missing.
- Capping, sampling or truncating a fetch without logging what was dropped.

## Correction note (2026-08-18)

This ADR first said the opposite of rule 2: that any deep-history caller should
route through `ensureHistory()` so the analyst and the UI would share one cache.
That shipped, and made the flicker permanent and global instead of fixing it
(`BUG-0234`). The sharing was real; so was the coupling, and the coupling was
worth more than the saved requests.

Recorded rather than quietly rewritten, because the reasoning that produced it
is the reasoning most likely to produce it again: "one cache is better than two"
is true about data and false about reactivity.

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

## Amendment (2026-08-25)
Telemetry data (e.g. calculation engine metrics) is explicitly permitted to pass through the store to feed debug panels. This does not violate the core isolation rule which applies to primary market data.
