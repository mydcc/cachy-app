---
id: BUG-0230
title: Market Analyst never terminates its retry loop, starving live feeds and blanking the dashboard
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: market-data
data_class: none
adr: none
depends_on: []
start_date: 2026-08-18
target_date: 2026-08-18
size: S
estimate: 2
---


# BUG-0230 — Market Analyst never terminates its retry loop

## Symptom

Opening the Market Overview window makes the whole app flicker: the favourite
cards and the Technicals panel lose their values roughly once a second, show
numbers again for an instant, then blank out. The dashboard itself shows only
zeroes — every trend cell grey, every RSI exactly 50.0, every score 0. Closing
the window stops the flicker, but the Technicals panel stays empty and the
funding rate takes a while to reappear. Clicking a different symbol fixes it
briefly, until the window is opened again.

Reported against `BUG-0218`, which addressed a different mechanism (`markPrice`
gaps in the REST fallback) and did not close this one.

## Evidence

*Demonstrated* — observed on a running dev server, and reproduced by a failing
test.

**1. Server logs.** The kline proxy logs every upstream request. With Market
Overview *closed*, the same block repeats indefinitely:

```
[Bitunix API] BTCUSDT:1h requested 1000 ... Got 200
[Bitunix API] BTCUSDT:4h requested 1000 ... Got 200
[Bitunix API] BTCUSDT:15m requested 1000 ... Got 200
[Bitunix API] BTCUSDT:1d requested 1000 ... Got 200
   ... then ETH, SOL, LINK, then round again
```

Two facts in one line: the analyst asks for 1000 candles, and Bitunix returns
200 — it hard-caps every kline response regardless of `limit`. The repetition
is the loop.

**2. Failing test.** `src/services/marketAnalyst_storm.test.ts` drives the
analyst against a feed that never produces an EMA 200. Against the pre-fix
scheduler it records 64 backfills in 30 s of simulated time where 16 (one pass)
is correct.

## Cause

A retry loop whose exit condition was unsatisfiable over the chosen data path.

1. The analyst forces `ema3.length = 200` and asks for 1000 candles
   (`marketAnalyst.ts`, `getAnalystSettings`), then calls
   `apiService.fetchBitunixKlines(symbol, tf, 1000)` **directly**. Bitunix caps
   at 200. `historyFetcher.ensureHistory()` exists precisely to page around
   that cap (`"Hardened for Bitunix 200-candle limit"`) — the analyst did not
   use it.
2. With 200 candles the EMA 200 does not converge, so `getTrend()` returned
   `"neutral"`.
3. `isInvalid` treated `trends["4h"] === "neutral"` as "retry this", so the
   freshness cache could never skip a symbol.
4. `anyNeedsUpdate` used the same predicate, pinning the scheduler to its 2 s
   fast path instead of the user's `marketAnalysisInterval` (default 60 s).

`"neutral"` carried two incompatible meanings — "the market has no direction"
and "we could not measure it" — and the loop's exit condition depended on
telling them apart.

**Why the window made it visible.** `RequestManager.MAX_CONCURRENCY` is 8. The
analyst's `Promise.all` over four timeframes held 4 of those slots
continuously. Opening the dashboard additionally registers every favourite for
`ticker` *and* `price`, so ticker responses exceeded the marketWatcher's 10 s
`isStale` threshold, which triggered REST fallback polling on top — more load
again. The cards blanked and refilled on that cycle. The Technicals panel
schedules non-active symbols via `requestIdleCallback`, which never fires idle
time on a saturated main thread; clicking a symbol promotes it to the active
"Takt 1" path with a real `setTimeout`, which is why that worked around it.

## Fix

1. **Route history through the backfiller.** `loadHistory()` calls
   `marketWatcher.ensureHistory(symbol, tf, ANALYST_HISTORY_TARGET)` and reads
   the store. `ensureHistory` gained an optional `targetLimit` so the analyst
   can ask for its own warm-up depth (600 = 3x the EMA period) rather than the
   full `chartHistoryLimit`. Bitget keeps the direct fetch — no backfiller
   exists for it yet.
2. **Sequential timeframes.** `ensureHistory` already fans out 6 parallel range
   requests internally; four concurrent timeframes on top would put ~24
   requests against a ceiling of 8 and starve the live feeds the visible cards
   depend on.
3. **Separate `"unknown"` from `"neutral"`.** `TrendState` gains `"unknown"`,
   meaning "not measurable", and `SymbolAnalysis` gains `quality` and
   `partialAttempts`.
4. **Age-gated freshness.** The skip decision uses `updatedAt` only. Partial
   results retry on exponential backoff (30 s, doubling, capped at 10 min) so a
   genuinely short-history symbol settles instead of spinning.
5. **Failures are recorded too.** `recordFailure()` writes a partial entry, so
   an erroring symbol cannot keep `anyNeedsUpdate` true forever — the same loop
   entered through the error path.

Left alone: the trend definition itself (price vs EMA 200), the confluence
scoring, and `BUG-0218`'s `markPrice` work, which remains a separate defect.

## Acceptance criteria

- [x] A test reproduces the defect and fails without the fix (64 vs 16 backfills)
- [x] The test passes with the fix
- [x] The analyst returns to `marketAnalysisInterval` after the initial fill
- [x] A symbol that can never produce an EMA 200 backs off instead of retrying
- [x] Missing data is recorded as `"unknown"`, never as a trend reading
- [x] Favourite cards and the Technicals panel keep their values while the
      Market Overview window is open (manual verification)

## Out of scope

- `markPrice` REST fallback gaps — `BUG-0218`.
- Synthetic timeframe depth (6m/12m) — `BUG-0231`.
- The two divergent favourites lists — `BUG-0232`.
- Dashboard readability and score semantics — `FEAT-0233`.

## Links

- `docs/backlog/bugs/BUG-0218-open-positions-price-sync-stall.md`
