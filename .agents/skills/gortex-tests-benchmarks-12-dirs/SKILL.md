---
name: gortex-tests-benchmarks-12-dirs
description: "Work in the tests/benchmarks +12 dirs area — 247 symbols across 30 files (75% cohesion)"
---

# tests/benchmarks +12 dirs

247 symbols | 30 files | 75% cohesion

## When to Use

Use this skill when working on files in:
- ``
- `.worktrees/backlog-jcodemunch/src/lib/calculators/charts.ts`
- `.worktrees/backlog-jcodemunch/src/services/calculationStrategy.ts`
- `.worktrees/backlog-jcodemunch/src/services/csvService.ts`
- `.worktrees/backlog-jcodemunch/src/services/incrementalCache.ts`
- `.worktrees/backlog-jcodemunch/src/types/orderSchemas.ts`
- `.worktrees/backlog-jcodemunch/src/utils/inputUtils.ts`
- `.worktrees/backlog-jcodemunch/src/utils/storageHelper.ts`
- `.worktrees/backlog-jcodemunch/src/utils/storageUtils.ts`
- `.worktrees/backlog-jcodemunch/tests/benchmarks/patternDetection.bench.ts`
- `.worktrees/backlog-jcodemunch/tests/benchmarks/safeJson.bench.ts`
- `.worktrees/backlog-jcodemunch/tests/benchmarks/slidingWindow.bench.ts`
- `.worktrees/backlog-jcodemunch/tests/benchmarks/technicals.bench.ts`
- `.worktrees/backlog-jcodemunch/tests/benchmarks/wma_optimization.bench.ts`
- `src/lib/utils/timeUtils.ts`
- `src/services/calculationStrategy.ts`
- `src/services/csvService.ts`
- `src/services/exchange/registry.ts`
- `src/services/incrementalCache.ts`
- `src/stores/ai.svelte.ts`
- `src/stores/tpsl.svelte.ts`
- `src/types/orderSchemas.ts`
- `src/utils/inputUtils.ts`
- `src/utils/storageHelper.ts`
- `src/utils/storageUtils.ts`
- `src/utils/technicalsPresenter.ts`
- `tests/benchmarks/patternDetection.bench.ts`
- `tests/benchmarks/stochrsi.bench.ts`
- `tests/benchmarks/technicals.bench.ts`
- `tests/benchmarks/worker_simulation.bench.ts`

## Key Files

| File | Symbols |
|------|---------|
| `` | toFixed, flat |
| `.worktrees/backlog-jcodemunch/src/lib/calculators/charts.ts` | symbolStats, getAssetData, journal, tradesToIterate, context, ... |
| `.worktrees/backlog-jcodemunch/src/services/calculationStrategy.ts` | engine, success, duration, recordMetrics, m, ... |
| `.worktrees/backlog-jcodemunch/src/services/csvService.ts` | csvService.generateCSV, rows, escape, journalData, headers, ... |
| `.worktrees/backlog-jcodemunch/src/services/incrementalCache.ts` | avgHitCount, totalHits, getStats |
| `.worktrees/backlog-jcodemunch/src/types/orderSchemas.ts` | val, serializeDecimal, d |
| `.worktrees/backlog-jcodemunch/src/utils/inputUtils.ts` | formatNewValue, value, operation |
| `.worktrees/backlog-jcodemunch/src/utils/storageHelper.ts` | getStatsFormatted, quotaMB, usedMB, stats |
| `.worktrees/backlog-jcodemunch/src/utils/storageUtils.ts` | quota, storageUtils.getQuotaStatus |
| `.worktrees/backlog-jcodemunch/tests/benchmarks/patternDetection.bench.ts` | runBench, i, start, opsPerSec, name, ... |
| `.worktrees/backlog-jcodemunch/tests/benchmarks/safeJson.bench.ts` | fn, i, iterations, runBench, opsPerSec, ... |
| `.worktrees/backlog-jcodemunch/tests/benchmarks/slidingWindow.bench.ts` | i, name, runBench, fn, end, ... |
| `.worktrees/backlog-jcodemunch/tests/benchmarks/technicals.bench.ts` | runBench, name, i, start, opsPerSec, ... |
| `.worktrees/backlog-jcodemunch/tests/benchmarks/wma_optimization.bench.ts` | runBench, i, duration, start, iterations, ... |
| `src/lib/utils/timeUtils.ts` | publishedDate, diffSeconds, dateString, diffWeeks, locale, ... |
| `src/services/calculationStrategy.ts` | engine, duration, candleCount, success, recordMetrics, ... |
| `src/services/csvService.ts` | rows, headers, csvService.generateCSV, escape, journalData, ... |
| `src/services/exchange/registry.ts` | activeExchange |
| `src/services/incrementalCache.ts` | totalHits, getStats, avgHitCount |
| `src/stores/ai.svelte.ts` | cmcContext, settings, technicalsContext, currentLocale, get, ... |
| `src/stores/tpsl.svelte.ts` | _orders, now, ensureFresh, hasPlansFor, _loading, ... |
| `src/types/orderSchemas.ts` | d, serializeDecimal, val |
| `src/utils/inputUtils.ts` | operation, value, formatNewValue |
| `src/utils/storageHelper.ts` | stats, getStatsFormatted, quotaMB, usedMB |
| `src/utils/storageUtils.ts` | quota, storageUtils.getQuotaStatus |
| `src/utils/technicalsPresenter.ts` | val, precision, formatVal |
| `tests/benchmarks/patternDetection.bench.ts` | i, end, name, start, runBench, ... |
| `tests/benchmarks/stochrsi.bench.ts` | i, iterations, fn, duration, i, ... |
| `tests/benchmarks/technicals.bench.ts` | i, runBench, name, iterations, opsPerSec, ... |
| `tests/benchmarks/worker_simulation.bench.ts` | duration, iterations, i, benchmark, name, ... |

## Entry Points

- `.worktrees/backlog-jcodemunch/src/services/csvService.ts::csvService.generateCSV@34`
- `src/services/csvService.ts::csvService.generateCSV@34`
- `src/stores/ai.svelte.ts::AiManager.gatherContext`

## Connected Communities

- **lib/calculators +24 dirs** (12 cross-edges)
- **calculators +2 dirs** (10 cross-edges)
- **src/services +26 dirs** (9 cross-edges)
- **services +8 dirs** (6 cross-edges)
- **utils/server +16 dirs** (5 cross-edges)
- **src/services +21 dirs** (4 cross-edges)
- **lib/windows +10 dirs** (3 cross-edges)
- **backlog-jcodemunch/src · map** (2 cross-edges)
- **src/services +11 dirs** (2 cross-edges)
- **backlog-jcodemunch/src · syncService.syncBitunixPositions** (2 cross-edges)
- **services +4 dirs · error** (2 cross-edges)
- **services +4 dirs · syncService.syncBitunixPositions** (2 cross-edges)
- **services +30 dirs** (1 cross-edges)
- **pets +1 dirs** (1 cross-edges)
- **services +2 dirs · warn** (1 cross-edges)
- **backlog-jcodemunch/src · handleEvent** (1 cross-edges)
- **services/exchange · getExchangeAdapter · registry · types (8) #1** (1 cross-edges)
- **backlog-jcodemunch/src · MarketManager** (1 cross-edges)
- **src/utils · getStats** (1 cross-edges)
- **utils · getStats** (1 cross-edges)
- **services +5 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-408")
explore(operation:"context", task:"understand tests/benchmarks +12 dirs", format:"gcx")
relations(operation:"usages", target:{symbol:".worktrees/backlog-jcodemunch/src/services/csvService.ts::csvService.generateCSV@34"}, format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
