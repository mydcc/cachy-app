---
name: gortex-benchmarks-13-dirs
description: "Work in the benchmarks +13 dirs area — 366 symbols across 32 files (80% cohesion)"
---

# benchmarks +13 dirs

366 symbols | 32 files | 80% cohesion

## When to Use

Use this skill when working on files in:
- ``
- `src/components/shared/AccountSummary.component.test.ts`
- `src/lib/calculators/charts.ts`
- `src/lib/rules/__fixtures__/candleSeries.ts`
- `src/lib/server/clientToken.ts`
- `src/lib/utils/timeUtils.ts`
- `src/services/calculationStrategy.ts`
- `src/services/chart/priceLineManager.ts`
- `src/services/csvService.ts`
- `src/services/exchange/adapterConformance.harness.ts`
- `src/services/incrementalCache.ts`
- `src/services/technicalsService.ts`
- `src/services/technicalsTypes.ts`
- `src/services/wasmIndicatorWindows.test.ts`
- `src/stores/ai.svelte.ts`
- `src/stores/quiz.test.ts`
- `src/types/apiSchemas.ts`
- `src/types/orderSchemas.ts`
- `src/utils/circularBuffer.ts`
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
| `` | toFixed, size |
| `src/components/shared/AccountSummary.component.test.ts` | value, formatDynamicDecimal |
| `src/lib/calculators/charts.ts` | context, getAssetData, symbolStats, journal, bubbleData, ... |
| `src/lib/rules/__fixtures__/candleSeries.ts` | price, random, volume, spread, candles, ... |
| `src/lib/server/clientToken.ts` | _tokenStoreSizeForTests |
| `src/lib/utils/timeUtils.ts` | diffSeconds, now, diffHours, diffYears, dateString, ... |
| `src/services/calculationStrategy.ts` | performanceHistory, selectEngine, recordCacheHit, m, candleCount, ... |
| `src/services/chart/priceLineManager.ts` | sign, dp, tpTitle, kind, value, ... |
| `src/services/csvService.ts` | headers, journalData, escape, val, rows, ... |
| `src/services/exchange/adapterConformance.harness.ts` | bitunixHarness.getSubscriptionCount, bitgetHarness.getSubscriptionCount |
| `src/services/incrementalCache.ts` | totalHits, avgHitCount, getStats |
| `src/services/technicalsService.ts` | klinesInput, wasmCalculator, e, t0, len, ... |
| `src/services/technicalsTypes.ts` | getEmptyData |
| `src/services/wasmIndicatorWindows.test.ts` | i, shown, within, expected, label |
| `src/stores/ai.svelte.ts` | currentLocale, totalBidVol, bidRatio, rrRatio, e, ... |
| `src/stores/quiz.test.ts` | value.length |
| `src/types/apiSchemas.ts` | sizeBytes, data, validateResponseSize, sizeMB, maxSizeMB |
| `src/types/orderSchemas.ts` | d, val, serializeDecimal |
| `src/utils/circularBuffer.ts` | buffer, constructor, updateLast, item, lastIndex, ... |
| `src/utils/inputUtils.ts` | formatNewValue, value, operation |
| `src/utils/storageHelper.ts` | stats, usedMB, getStatsFormatted, quotaMB |
| `src/utils/storageUtils.ts` | quota, dataSize, value, quota, e, ... |
| `src/utils/technicalsPresenter.ts` | formatVal, val, precision |
| `tests/benchmarks/mfi_optimization.bench.ts` | duration, end, i, opsPerSec, i, ... |
| `tests/benchmarks/safeJson.bench.ts` | i, name, duration, fn, end, ... |
| `tests/benchmarks/slidingWindow.bench.ts` | fn, duration, opsPerSec, name, runBench, ... |
| `tests/benchmarks/stochrsi.bench.ts` | opsPerSec, i, runBench, name, start, ... |
| `tests/benchmarks/technicals.bench.ts` | iterations, name, i, i, runBench, ... |
| `tests/benchmarks/wasm_parity.bench.ts` | price, out, seed, makeSeries, n, ... |
| `tests/benchmarks/wma_optimization.bench.ts` | start, iterations, runBench, i, end, ... |
| `tests/benchmarks/worker_simulation.bench.ts` | duration, i, benchmark, iterations, fn, ... |
| `tests/integration/wasm_parity.test.ts` | price, t, rand, i, rand, ... |

## Entry Points

- `src/services/csvService.ts::csvService.generateCSV@34`
- `src/stores/ai.svelte.ts::AiManager.gatherContext`
- `src/services/technicalsService.ts::technicalsService.calculateTechnicals@201`

## Connected Communities

- **utils +10 dirs** (11 cross-edges)
- **services +14 dirs** (7 cross-edges)
- **services +10 dirs · slice** (7 cross-edges)
- **services +42 dirs** (5 cross-edges)
- **components/shared +13 dirs** (5 cross-edges)
- **services +30 dirs** (5 cross-edges)
- **. +9 dirs** (4 cross-edges)
- **services +2 dirs · syncService.syncBitunixPositions** (3 cross-edges)
- **stores +1 dirs · find** (3 cross-edges)
- **services +10 dirs · appFetch** (3 cross-edges)
- **services +6 dirs · dispatchMessage** (2 cross-edges)
- **services +5 dirs · calculateIndicatorsFromArrays** (2 cross-edges)
- **services · getCoinMetadata** (2 cross-edges)
- **services +6 dirs · encrypt** (2 cross-edges)
- **services · placeOrder** (2 cross-edges)
- **services +6 dirs · BitunixWebSocketService** (2 cross-edges)
- **rules +10 dirs** (2 cross-edges)
- **services +3 dirs · calculate** (1 cross-edges)
- **services · detectBrowserCapabilities** (1 cross-edges)
- **stores/market +1 dirs** (1 cross-edges)
- **services/chart · PriceLineManager** (1 cross-edges)
- **services +3 dirs · delete** (1 cross-edges)
- **services +5 dirs · ensureHistory** (1 cross-edges)
- **services +4 dirs · toNumFast** (1 cross-edges)
- **services · runBenchmark** (1 cross-edges)
- **utils · getStats** (1 cross-edges)
- **scripts +6 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-513")
explore(operation:"context", task:"understand benchmarks +13 dirs", format:"gcx")
relations(operation:"usages", target:{symbol:"src/services/csvService.ts::csvService.generateCSV@34"}, format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
