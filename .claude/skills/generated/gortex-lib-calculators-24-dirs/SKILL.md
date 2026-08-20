---
name: gortex-lib-calculators-24-dirs
description: "Work in the lib/calculators +24 dirs area — 893 symbols across 77 files (71% cohesion)"
---

# lib/calculators +24 dirs

893 symbols | 77 files | 71% cohesion

## When to Use

Use this skill when working on files in:
- ``
- `.worktrees/backlog-jcodemunch/docs/backlog/backlog.generated.ts`
- `.worktrees/backlog-jcodemunch/src/components/results/PlaceOrderPanel.metadata.component.test.ts`
- `.worktrees/backlog-jcodemunch/src/lib/calculator_charts.test.ts`
- `.worktrees/backlog-jcodemunch/src/lib/calculators/aggregator.ts`
- `.worktrees/backlog-jcodemunch/src/lib/calculators/charts.ts`
- `.worktrees/backlog-jcodemunch/src/lib/calculators/core.ts`
- `.worktrees/backlog-jcodemunch/src/lib/calculators/getQualityData.test.ts`
- `.worktrees/backlog-jcodemunch/src/lib/calculators/new_charts.test.ts`
- `.worktrees/backlog-jcodemunch/src/lib/calculators/rolling_stats.test.ts`
- `.worktrees/backlog-jcodemunch/src/lib/calculators/stats.test.ts`
- `.worktrees/backlog-jcodemunch/src/lib/calculators/stats.ts`
- `.worktrees/backlog-jcodemunch/src/lib/calculators/types.ts`
- `.worktrees/backlog-jcodemunch/src/lib/marketDashboard.ts`
- `.worktrees/backlog-jcodemunch/src/lib/server/rateLimit.ts`
- `.worktrees/backlog-jcodemunch/src/services/alertEngine/alertEngine.ts`
- `.worktrees/backlog-jcodemunch/src/services/exchange/bitgetAdapter.ts`
- `.worktrees/backlog-jcodemunch/src/services/exchange/bitunixAdapter.ts`
- `.worktrees/backlog-jcodemunch/src/services/incrementalCache.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/marketWatcher.ts`
- `.worktrees/backlog-jcodemunch/src/services/marketWatcher/subscriptionRegistry.ts`
- `.worktrees/backlog-jcodemunch/src/services/omsService.ts`
- `.worktrees/backlog-jcodemunch/src/services/orderGate.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/storageService.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/technicalsService.ts`
- `.worktrees/backlog-jcodemunch/src/services/technicalsTypes.ts`
- `.worktrees/backlog-jcodemunch/src/services/tradeService.ts`
- `.worktrees/backlog-jcodemunch/src/services/workerPool.ts`
- `.worktrees/backlog-jcodemunch/src/stores/account.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/stores/analysis.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/stores/journal.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/stores/journal_paperTrades.test.ts`
- `.worktrees/backlog-jcodemunch/src/stores/quiz.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/stores/quiz.test.ts`
- `.worktrees/backlog-jcodemunch/src/stores/types.ts`
- `.worktrees/backlog-jcodemunch/src/tests/performance/startup_benchmark.test.ts`
- `.worktrees/backlog-jcodemunch/src/utils/circularBuffer.ts`
- `.worktrees/backlog-jcodemunch/src/utils/confluenceAnalyzer.ts`
- `.worktrees/backlog-jcodemunch/src/utils/statefulTechnicalsCalculator.ts`
- `.worktrees/backlog-jcodemunch/tests/benchmarks/saveJournal.bench.ts`
- `.worktrees/backlog-jcodemunch/tests/benchmarks/storage.bench.ts`
- `.worktrees/backlog-jcodemunch/vitest.setup.ts`
- `src/lib/calculator_charts.test.ts`
- `src/lib/calculators/aggregator.ts`
- `src/lib/calculators/charts.ts`
- `src/lib/calculators/core.ts`
- `src/lib/calculators/getQualityData.test.ts`
- `src/lib/calculators/new_charts.test.ts`
- `src/lib/calculators/rolling_stats.test.ts`
- `src/lib/calculators/stats.test.ts`
- `src/lib/calculators/stats.ts`
- `src/lib/calculators/types.ts`
- `src/lib/marketDashboard.ts`
- `src/lib/server/rateLimit.ts`
- `src/services/alertEngine/alertEngine.ts`
- `src/services/dataRepairService.ts`
- `src/services/exchange/bitunixAdapter.ts`
- `src/services/incrementalCache.test.ts`
- `src/services/marketWatcher.ts`
- `src/services/omsService.ts`
- `src/services/orderGate.test.ts`
- `src/services/storageService.test.ts`
- `src/services/tradeService.ts`
- `src/services/workerPool.ts`
- `src/stores/account.svelte.ts`
- `src/stores/analysis.svelte.ts`
- `src/stores/journal.svelte.ts`
- `src/stores/quiz.svelte.ts`
- `src/stores/quiz.test.ts`
- `src/tests/performance/startup_benchmark.test.ts`
- `src/utils/circularBuffer.ts`
- `src/utils/confluenceAnalyzer.ts`
- `src/utils/statefulTechnicalsCalculator.ts`
- `src/utils/utils.ts`
- `tests/benchmarks/saveJournal.bench.ts`
- `tests/benchmarks/storage.bench.ts`
- `vitest.setup.ts`

## Key Files

| File | Symbols |
|------|---------|
| `` | localeCompare, sort, filter, values, repeat, ... |
| `.worktrees/backlog-jcodemunch/docs/backlog/backlog.generated.ts` | status, getBacklogByStatus, area, milestone, getBacklogByMilestone, ... |
| `.worktrees/backlog-jcodemunch/src/components/results/PlaceOrderPanel.metadata.component.test.ts` | key, lookup |
| `.worktrees/backlog-jcodemunch/src/lib/calculator_charts.test.ts` | overrides, createTrade |
| `.worktrees/backlog-jcodemunch/src/lib/calculators/aggregator.ts` | journal, getJournalContext, context, getJournalAnalysis, openTrades, ... |
| `.worktrees/backlog-jcodemunch/src/lib/calculators/charts.ts` | shortWin, closedTrades, shortWinRate, winRate, stdDev, ... |
| `.worktrees/backlog-jcodemunch/src/lib/calculators/core.ts` | val, getTradePnL, t |
| `.worktrees/backlog-jcodemunch/src/lib/calculators/getQualityData.test.ts` | id, risk, createTrade, dateStr, pnl, ... |
| `.worktrees/backlog-jcodemunch/src/lib/calculators/new_charts.test.ts` | createTrade, overrides |
| `.worktrees/backlog-jcodemunch/src/lib/calculators/rolling_stats.test.ts` | createTrade, overrides |
| `.worktrees/backlog-jcodemunch/src/lib/calculators/stats.test.ts` | createTrade, overrides |
| `.worktrees/backlog-jcodemunch/src/lib/calculators/stats.ts` | worstDays, maxWinStreak, cumulativeProfit, tagStats, riskBuckets, ... |
| `.worktrees/backlog-jcodemunch/src/lib/calculators/types.ts` | JournalContext, PerformanceStats, JournalStats |
| `.worktrees/backlog-jcodemunch/src/lib/marketDashboard.ts` | bullish, measured, marketBreadth, rows |
| `.worktrees/backlog-jcodemunch/src/lib/server/rateLimit.ts` | toDelete, overflow, evictIfCrowded, now, entry, ... |
| `.worktrees/backlog-jcodemunch/src/services/alertEngine/alertEngine.ts` | callback, onAlertFired |
| `.worktrees/backlog-jcodemunch/src/services/exchange/bitgetAdapter.ts` | trading.fetchTpSlOrders, view |
| `.worktrees/backlog-jcodemunch/src/services/exchange/bitunixAdapter.ts` | trading.fetchTpSlOrders, view |
| `.worktrees/backlog-jcodemunch/src/services/incrementalCache.test.ts` | startTime, count, generateKlines |
| `.worktrees/backlog-jcodemunch/src/services/marketWatcher.ts` | getActiveSymbols |
| `.worktrees/backlog-jcodemunch/src/services/marketWatcher/subscriptionRegistry.ts` | current, intended, toUnsubscribe, settings, syncSubscriptions |
| `.worktrees/backlog-jcodemunch/src/services/omsService.ts` | getAllOrders |
| `.worktrees/backlog-jcodemunch/src/services/orderGate.test.ts` | options, key, echo |
| `.worktrees/backlog-jcodemunch/src/services/storageService.test.ts` | mockStore.getAll |
| `.worktrees/backlog-jcodemunch/src/services/technicalsService.ts` | now, staleKeys, cleanupStaleCache |
| `.worktrees/backlog-jcodemunch/src/services/technicalsTypes.ts` | ConfluenceData |
| `.worktrees/backlog-jcodemunch/src/services/tradeService.ts` | symbolsToFetch, results, fetchTpSlOrders, provider, batch, ... |
| `.worktrees/backlog-jcodemunch/src/services/workerPool.ts` | getStats |
| `.worktrees/backlog-jcodemunch/src/stores/account.svelte.ts` | totalUnrealizedPnl |
| `.worktrees/backlog-jcodemunch/src/stores/analysis.svelte.ts` | sorted, AnalysisManager, bullishCount, keys, sortedByScore, ... |
| `.worktrees/backlog-jcodemunch/src/stores/journal.svelte.ts` | deleteEntry, id |
| `.worktrees/backlog-jcodemunch/src/stores/journal_paperTrades.test.ts` | id, isPaper, entry, pnl |
| `.worktrees/backlog-jcodemunch/src/stores/quiz.svelte.ts` | exportState |
| `.worktrees/backlog-jcodemunch/src/stores/quiz.test.ts` | value.key, index |
| `.worktrees/backlog-jcodemunch/src/stores/types.ts` | JournalEntry |
| `.worktrees/backlog-jcodemunch/src/tests/performance/startup_benchmark.test.ts` | attempts, waitForAnalysis |
| `.worktrees/backlog-jcodemunch/src/utils/circularBuffer.ts` | callback, forEach, i |
| `.worktrees/backlog-jcodemunch/src/utils/confluenceAnalyzer.ts` | ichi, reason, amount, analyze, adjust, ... |
| `.worktrees/backlog-jcodemunch/src/utils/statefulTechnicalsCalculator.ts` | lastClose, shift, newCandle |
| `.worktrees/backlog-jcodemunch/tests/benchmarks/saveJournal.bench.ts` | count, generateJournal |
| `.worktrees/backlog-jcodemunch/tests/benchmarks/storage.bench.ts` | lower, results, req, startTs, getAll, ... |
| `.worktrees/backlog-jcodemunch/vitest.setup.ts` | ownKeys, store, createStorageMock, mock, mock.length |
| `src/lib/calculator_charts.test.ts` | createTrade, overrides |
| `src/lib/calculators/aggregator.ts` | context, journal, getJournalAnalysis, closedTrades, journal, ... |
| `src/lib/calculators/charts.ts` | totalFees, tradesToIterate, context, atrs, expectancy, ... |
| `src/lib/calculators/core.ts` | t, getTradePnL, val |
| `src/lib/calculators/getQualityData.test.ts` | createTrade, status, pnl, dateStr, risk, ... |
| `src/lib/calculators/new_charts.test.ts` | createTrade, overrides |
| `src/lib/calculators/rolling_stats.test.ts` | createTrade, overrides |
| `src/lib/calculators/stats.test.ts` | createTrade, overrides |
| `src/lib/calculators/stats.ts` | step, maxLoss, totalLossPnl, pnlData, closedTrades, ... |
| `src/lib/calculators/types.ts` | JournalContext, JournalStats, PerformanceStats |
| `src/lib/marketDashboard.ts` | marketBreadth, rows, measured, bullish |
| `src/lib/server/rateLimit.ts` | now, toDelete, overflow, evictIfCrowded, entry, ... |
| `src/services/alertEngine/alertEngine.ts` | callback, onAlertFired |
| `src/services/dataRepairService.ts` | successCount, timeStr, total, symbolGroups, processed, ... |
| `src/services/exchange/bitunixAdapter.ts` | view, trading.fetchTpSlOrders |
| `src/services/incrementalCache.test.ts` | generateKlines, count, startTime |
| `src/services/marketWatcher.ts` | getActiveSymbols |
| `src/services/omsService.ts` | getAllOrders |
| `src/services/orderGate.test.ts` | options, echo, key |
| `src/services/storageService.test.ts` | T, resolveLater, mockIDB.open, MockRequest, req, ... |
| `src/services/tradeService.ts` | batch, positions, BATCH_SIZE, view, uniqueOrders, ... |
| `src/services/workerPool.ts` | getStats |
| `src/stores/account.svelte.ts` | totalUnrealizedPnl |
| `src/stores/analysis.svelte.ts` | results, isAnalyzing, bearishCount, AnalysisQuality, enforceCacheLimit, ... |
| `src/stores/journal.svelte.ts` | id, deleteEntry |
| `src/stores/quiz.svelte.ts` | exportState |
| `src/stores/quiz.test.ts` | value.key, index |
| `src/tests/performance/startup_benchmark.test.ts` | waitForAnalysis, attempts |
| `src/utils/circularBuffer.ts` | forEach, i, callback |
| `src/utils/confluenceAnalyzer.ts` | reason, ConfluenceAnalyzer, score, sellCount, vwap, ... |
| `src/utils/statefulTechnicalsCalculator.ts` | shift, lastClose, newCandle |
| `src/utils/utils.ts` | isUnsafeObjectKey, key |
| `tests/benchmarks/saveJournal.bench.ts` | count, generateJournal |
| `tests/benchmarks/storage.bench.ts` | upper, results, k, req, startTs, ... |
| `vitest.setup.ts` | mock, ownKeys, createStorageMock, store, mock.length |

## Entry Points

- `src/services/dataRepairService.ts::dataRepairService.repairMfeMae@365`
- `src/services/dataRepairService.ts::dataRepairService.repairMissingAtr@156`

## Connected Communities

- **calculators +2 dirs** (26 cross-edges)
- **services +8 dirs** (19 cross-edges)
- **src/services +21 dirs** (15 cross-edges)
- **tests/benchmarks +12 dirs** (13 cross-edges)
- **src/services +26 dirs** (13 cross-edges)
- **backlog-jcodemunch/src · map** (12 cross-edges)
- **backlog-jcodemunch/src · calculateIndicatorsFromArrays** (8 cross-edges)
- **calculators +6 dirs** (7 cross-edges)
- **services +30 dirs** (7 cross-edges)
- **services +3 dirs · set** (5 cross-edges)
- **utils · reconstructState** (4 cross-edges)
- **services +2 dirs · warn** (4 cross-edges)
- **services +5 dirs** (4 cross-edges)
- **src/utils · reconstructState** (4 cross-edges)
- **stores +1 dirs · RiskManager** (4 cross-edges)
- **src/services +11 dirs** (4 cross-edges)
- **lib/server +38 dirs** (2 cross-edges)
- **services · get** (2 cross-edges)
- **services +4 dirs · error** (2 cross-edges)
- **. +4 dirs · parseDateString** (2 cross-edges)
- **src/services +33 dirs** (2 cross-edges)
- **services +9 dirs** (2 cross-edges)
- **src/services · resolveLater** (1 cross-edges)
- **backlog-jcodemunch/src · safeDecimal** (1 cross-edges)
- **api/klines +1 dirs** (1 cross-edges)
- **stores +1 dirs · safeDecimal** (1 cross-edges)
- **backlog-jcodemunch/src · MarketManager** (1 cross-edges)
- **services · calculate** (1 cross-edges)
- **backlog-jcodemunch/src · GET** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-399")
explore(operation:"context", task:"understand lib/calculators +24 dirs", format:"gcx")
relations(operation:"usages", target:{symbol:"src/services/dataRepairService.ts::dataRepairService.repairMfeMae@365"}, format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
