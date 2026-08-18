---
id: BUG-0231
title: Synthetic timeframes return a fraction of the requested candles, silently dropping long look-back indicators
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: market-data
data_class: none
adr: none
depends_on: []
---

# BUG-0231 — Synthetic timeframes under-fetch their base candles

## Symptom

The Technicals panel works on standard timeframes (5m, 15m, 1h, 1d, 1w) but
degrades on non-standard ones. On 3m and 10m some indicators still compute
(RSI, CCI, MACD) while others are missing, and of the EMAs only the 21 and 50
appear — the 200 is absent. On 6m and 12m more indicators drop out.

No error is shown. The panel simply renders fewer rows.

## Evidence

*Demonstrated* — reproduced by a failing test,
`src/services/apiService_syntheticTimeframes.test.ts`, against a fake exchange
that truncates at 200 rows exactly like the real one. A 6m request for 600
candles returns **34**.

The truncation itself is visible in the live proxy log:

```
[Bitunix API] SOLUSDT:1h requested 1000 with end undefined. Got 200.
```

## Cause

Non-native timeframes are synthesised by aggregating a native base timeframe
(`getOptimalTimeframe` in `src/utils/timeUtils.ts`). `fetchBitunixKlines`
scaled the request — `fetchLimit = limit * multiplier` — but issued it as a
**single** call. Bitunix caps every kline response at 200 rows regardless of
`limit`, so the aggregation was fed 200 base candles no matter what:

| Target | Base | Multiplier | Target candles received |
|---|---|---|---|
| 5m, 15m, 1h, 1d, 1w | native | 1 | 200 |
| 10m | 5m | 2 | 100 |
| 3m | 1m | 3 | 66 |
| 6m | 1m | 6 | 33 |
| 12m | 1m | 12 | 16 |

That table is the reported symptom exactly: RSI(14) needs ~35 candles and
survives; EMA 200 needs 200+ and cannot exist. Because a short indicator still
rendered, the panel looked functional rather than starved.

## Fix

`fetchBitunixKlines` walks backwards in pages when base-candle demand exceeds
one response, anchoring each window just before the oldest candle seen so far.
The whole walk runs inside one scheduled request, so it costs one concurrency
slot rather than one per page.

Guards:

- **Duplicate/replay guard** — if a page returns nothing new, the upstream
  ignored `endTime`; stop rather than spin.
- **Page cap** (`MAX_KLINE_PAGES = 20`) — bounds a single request. When it
  binds, it is logged with the resulting candle count; a truncated fetch that
  reports success is what hid this defect in the first place.
- **Timeout** scales with page count, capped at 60 s.

Left alone: the aggregation maths, the native-timeframe path (still exactly one
request), and `getOptimalTimeframe`'s divisor choice.

## Acceptance criteria

- [x] A test reproduces the defect and fails without the fix (34 vs >200 candles)
- [x] The test passes with the fix
- [x] Native timeframes still issue exactly one request
- [x] Aggregated candles stay ordered, unique, and aligned to target buckets
- [x] A replaying upstream terminates the walk instead of looping
- [x] EMA 200 renders on 3m, 6m and 10m in the running app (manual verification)

## Out of scope

- Bitget klines — no backfiller exists for that provider yet.
- The analyst's own history depth — `BUG-0230`.

## Links

- `docs/backlog/bugs/BUG-0230-market-analyst-fetch-storm.md`
