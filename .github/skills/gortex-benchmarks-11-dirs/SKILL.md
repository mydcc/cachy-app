---
name: gortex-benchmarks-11-dirs
description: "Work in the benchmarks +11 dirs area — 335 symbols across 27 files (82% cohesion)"
---

# benchmarks +11 dirs

335 symbols | 27 files | 82% cohesion

## When to Use

Use this skill when working on files in:
- ``
- `src/components/shared/AccountSummary.component.test.ts`
- `src/lib/calculators/charts.ts`
- `src/lib/rules/__fixtures__/candleSeries.ts`
- `src/lib/utils/timeUtils.ts`
- `src/services/calculationStrategy.ts`
- `src/services/chart/priceLineManager.ts`
- `src/services/csvService.ts`
- `src/services/incrementalCache.ts`
- `src/services/technicalsService.ts`
- `src/services/technicalsTypes.ts`
- `src/services/wasmIndicatorWindows.test.ts`
- `src/stores/ai.svelte.ts`
- `src/types/orderSchemas.ts`
- `src/utils/inputUtils.ts`
- `src/utils/storageHelper.ts`
- `src/utils/storageUtils.ts`
- `src/utils/technicalsPresenter.ts`
- `tests/benchmarks/mfi_optimization.bench.ts`
- `tests/benchmarks/safeJson.bench.ts`
- `tests/benchmarks/slidingWindow.bench.ts`
- `tests/benchmarks/stochrsi.bench.ts`
- `tests/benchmarks/technicals.bench.ts`
- `tests/benchmarks/wasm_parity.bench.ts`
- `tests/benchmarks/wma_optimization.bench.ts`
- `tests/benchmarks/worker_simulation.bench.ts`
- `tests/integration/wasm_parity.test.ts`

## Key Files

| File | Symbols |
|------|---------|
| `` | toFixed |
| `src/components/shared/AccountSummary.component.test.ts` | value, formatDynamicDecimal |
| `src/lib/calculators/charts.ts` | tradesToIterate, journal, bubbleData, getAssetData, symbolStats, ... |
| `src/lib/rules/__fixtures__/candleSeries.ts` | i, shock, drift, reversion, low, ... |
| `src/lib/utils/timeUtils.ts` | e, dateString, diffHours, diffWeeks, diffMonths, ... |
| `src/services/calculationStrategy.ts` | slowRuns, context, capabilitiesRequested, m, cacheStats, ... |
| `src/services/chart/priceLineManager.ts` | field, syncPendingOrders, orders, minDp, PendingOrderLineInput, ... |
| `src/services/csvService.ts` | val, csvService.generateCSV, escape, rows, headers, ... |
| `src/services/incrementalCache.ts` | getStats, avgHitCount, totalHits |
| `src/services/technicalsService.ts` | result, oldestKey, len, startTime, firstTime, ... |
| `src/services/technicalsTypes.ts` | getEmptyData |
| `src/services/wasmIndicatorWindows.test.ts` | expected, i, shown, label, within |
| `src/stores/ai.svelte.ts` | entry, sl, lang, trade, shareTradeContext, ... |
| `src/types/orderSchemas.ts` | val, d, serializeDecimal |
| `src/utils/inputUtils.ts` | value, operation, formatNewValue |
| `src/utils/storageHelper.ts` | quotaMB, usedMB, getStatsFormatted, stats |
| `src/utils/storageUtils.ts` | storageUtils.getQuotaStatus, e, oldValue, quota, value, ... |
| `src/utils/technicalsPresenter.ts` | precision, formatVal, val |
| `tests/benchmarks/mfi_optimization.bench.ts` | duration, name, runBench, opsPerSec, fn, ... |
| `tests/benchmarks/safeJson.bench.ts` | runBench, i, i, duration, name, ... |
| `tests/benchmarks/slidingWindow.bench.ts` | runBench, opsPerSec, name, i, start, ... |
| `tests/benchmarks/stochrsi.bench.ts` | i, runBench, start, fn, end, ... |
| `tests/benchmarks/technicals.bench.ts` | i, opsPerSec, end, name, runBench, ... |
| `tests/benchmarks/wasm_parity.bench.ts` | makeSeries, seed, price, rand, t, ... |
| `tests/benchmarks/wma_optimization.bench.ts` | i, duration, opsPerSec, fn, start, ... |
| `tests/benchmarks/worker_simulation.bench.ts` | i, i, start, opsPerSec, iterations, ... |
| `tests/integration/wasm_parity.test.ts` | out, i, t, c, rand, ... |

## Entry Points

- `src/services/csvService.ts::csvService.generateCSV@34`
- `src/stores/ai.svelte.ts::AiManager.gatherContext`
- `src/services/technicalsService.ts::technicalsService.calculateTechnicals@201`

## Connected Communities

- **utils +10 dirs** (11 cross-edges)
- **services +10 dirs · slice** (7 cross-edges)
- **services +15 dirs** (7 cross-edges)
- **components/shared +13 dirs** (5 cross-edges)
- **services +29 dirs** (5 cross-edges)
- **services +46 dirs** (5 cross-edges)
- **. +9 dirs** (4 cross-edges)
- **stores +1 dirs · find** (3 cross-edges)
- **services +10 dirs · appFetch** (3 cross-edges)
- **services +2 dirs · syncService.syncBitunixPositions** (3 cross-edges)
- **services +6 dirs · dispatchMessage** (2 cross-edges)
- **services +6 dirs · BitunixWebSocketService** (2 cross-edges)
- **services +5 dirs · encrypt** (2 cross-edges)
- **services · getCoinMetadata** (2 cross-edges)
- **rules +9 dirs** (2 cross-edges)
- **services · placeOrder** (2 cross-edges)
- **services +4 dirs · toNumFast** (1 cross-edges)
- **services +2 dirs · set** (1 cross-edges)
- **services · detectBrowserCapabilities** (1 cross-edges)
- **stores/market +1 dirs** (1 cross-edges)
- **utils · getStats** (1 cross-edges)
- **services/chart · PriceLineManager** (1 cross-edges)
- **services +6 dirs · ensureHistory** (1 cross-edges)
- **services +5 dirs · calculateIndicatorsFromArrays** (1 cross-edges)
- **scripts +6 dirs** (1 cross-edges)
- **services · runBenchmark** (1 cross-edges)
- **services +3 dirs · delete** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-505")
explore(operation:"context", task:"understand benchmarks +11 dirs", format:"gcx")
relations(operation:"usages", target:{symbol:"src/services/csvService.ts::csvService.generateCSV@34"}, format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
