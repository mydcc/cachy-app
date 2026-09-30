---
name: gortex-services-14-dirs
description: "Work in the services +14 dirs area — 605 symbols across 57 files (69% cohesion)"
---

# services +14 dirs

605 symbols | 57 files | 69% cohesion

## When to Use

Use this skill when working on files in:
- ``
- `docs/backlog/backlog.generated.ts`
- `src/components/shared/FundingRatePopover.svelte`
- `src/components/shared/PositionsSidebar.dedup.component.test.ts`
- `src/components/shared/journal/JournalTable.svelte`
- `src/components/shared/journal/TradeDetailDrawer.svelte`
- `src/lib/alerts/indicatorCatalogue.test.ts`
- `src/lib/alerts/indicatorCatalogue.ts`
- `src/lib/alerts/indicatorSettingsSeed.ts`
- `src/lib/alerts/priceFormLeaf.ts`
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
- `src/lib/rules/types.ts`
- `src/services/alertEngine/alertEngine.test.ts`
- `src/services/alertEngine/alertEngine.ts`
- `src/services/alertEngine/legacyReplayCoordinator.test.ts`
- `src/services/alertEngine/legacyReplayCoordinator.ts`
- `src/services/alertEngine/replayClosedCandles.ts`
- `src/services/alertEngine/ruleEvaluationLoop.ts`
- `src/services/alertEngine/ruleLoopWiring.ts`
- `src/services/alertEngine/shadowLedger.ts`
- `src/services/apiService.ts`
- `src/services/cloudService.rateLimit.test.ts`
- `src/services/dataRepairService.ts`
- `src/services/marketWatcher/subscriptionRegistry.ts`
- `src/services/notificationService.svelte.ts`
- `src/services/omsService.ts`
- `src/services/orderGate.test.ts`
- `src/services/paperAccountFeed.ts`
- `src/services/technicalsService.ts`
- `src/services/technicalsTypes.ts`
- `src/services/tradeService.ts`
- `src/stores/alertPanel.svelte.ts`
- `src/stores/alerts.svelte.ts`
- `src/stores/alerts_engineWiring.test.ts`
- `src/stores/analysis.svelte.ts`
- `src/stores/externalDeliveryLog.svelte.ts`
- `src/stores/journal_paperTrades.test.ts`
- `src/stores/journal_persistence.test.ts`
- `src/stores/quiz.test.ts`
- `src/stores/types.ts`
- `src/tests/performance/startup_benchmark.test.ts`
- `src/utils/circularBuffer.ts`
- `src/utils/confluenceAnalyzer.ts`
- `src/utils/scheduler.ts`
- `src/utils/server/bitunix.test.ts`
- `src/utils/statefulTechnicalsCalculator.ts`
- `vitest.setup.ts`

## Key Files

| File | Symbols |
|------|---------|
| `` | values, sort, filter, keys, reverse |
| `docs/backlog/backlog.generated.ts` | getBacklogItem, area, BacklogItem, milestone, getBacklogByMilestone, ... |
| `src/components/shared/FundingRatePopover.svelte` | y, placement, result, side, middlewareData, ... |
| `src/components/shared/PositionsSidebar.dedup.component.test.ts` | accountPostCount |
| `src/components/shared/journal/JournalTable.svelte` | Props |
| `src/components/shared/journal/TradeDetailDrawer.svelte` | Props |
| `src/lib/alerts/indicatorCatalogue.test.ts` | cumulativeIds |
| `src/lib/alerts/indicatorCatalogue.ts` | group, indicatorsInGroup |
| `src/lib/alerts/indicatorSettingsSeed.ts` | alertableIndicatorKeys, mappedIndicatorKeys |
| `src/lib/alerts/priceFormLeaf.ts` | record, value, entries, canonicalise |
| `src/lib/calculator_charts.test.ts` | createTrade, overrides |
| `src/lib/calculators/aggregator.ts` | context, getJournalAnalysis, journal, openTrades, journal, ... |
| `src/lib/calculators/charts.ts` | won, countShort, pf, winRateShort, avgWin, ... |
| `src/lib/calculators/core.ts` | t, val, getTradePnL |
| `src/lib/calculators/getQualityData.test.ts` | dateStr, createTrade, pnl, risk, status, ... |
| `src/lib/calculators/new_charts.test.ts` | createTrade, overrides |
| `src/lib/calculators/rolling_stats.test.ts` | overrides, createTrade |
| `src/lib/calculators/stats.test.ts` | createTrade, overrides |
| `src/lib/calculators/stats.ts` | context, risks, closedTrades, totalRRSum, avgWin, ... |
| `src/lib/calculators/types.ts` | JournalContext, JournalStats, PerformanceStats |
| `src/lib/marketDashboard.ts` | measured, bullish, marketBreadth, rows |
| `src/lib/rules/types.ts` | RuleRefusal, Refused |
| `src/services/alertEngine/alertEngine.test.ts` | remove_alert, id |
| `src/services/alertEngine/alertEngine.ts` | symbol, heldAlertsFor |
| `src/services/alertEngine/legacyReplayCoordinator.test.ts` | initialHistory, held, history, EvaluateCall, symbol, ... |
| `src/services/alertEngine/legacyReplayCoordinator.ts` | from, from, symbol, report, replayScoped, ... |
| `src/services/alertEngine/replayClosedCandles.ts` | ReplayReport |
| `src/services/alertEngine/ruleEvaluationLoop.ts` | unevaluableRules |
| `src/services/alertEngine/ruleLoopWiring.ts` | readAvailableKlineTimeframes, klines, symbol, e |
| `src/services/alertEngine/shadowLedger.ts` | counterpart, queue, keyOf, key, shadowQueues, ... |
| `src/services/apiService.ts` | now, key, pruneCache, nextTask, nextTask, ... |
| `src/services/cloudService.rateLimit.test.ts` | globalMessage.delete, row, senderActivity.iter |
| `src/services/dataRepairService.ts` | processed, promises, groupTrades, t, t, ... |
| `src/services/marketWatcher/subscriptionRegistry.ts` | intendedTargets, marketData, intended |
| `src/services/notificationService.svelte.ts` | oldest, key, remember |
| `src/services/omsService.ts` | getAllOrders |
| `src/services/orderGate.test.ts` | t, key, options, echo, options, ... |
| `src/services/paperAccountFeed.ts` | endTime, query, historyOrders, startTime, HistoryQuery |
| `src/services/technicalsService.ts` | cleanupStaleCache, now, staleKeys |
| `src/services/technicalsTypes.ts` | ConfluenceData |
| `src/services/tradeService.ts` | failedSymbols, closeAllPositions, symbol, e, provider, ... |
| `src/stores/alertPanel.svelte.ts` | claimedFields, refusals, unclaimedRefusals, refusalsForField, field, ... |
| `src/stores/alerts.svelte.ts` | heldAlertsFor, symbol |
| `src/stores/alerts_engineWiring.test.ts` | remove_alert, id, resyncs |
| `src/stores/analysis.svelte.ts` | isAnalyzing, maxSize, data, sortedByScore, toRemove, ... |
| `src/stores/externalDeliveryLog.svelte.ts` | failureCount |
| `src/stores/journal_paperTrades.test.ts` | entry, id, isPaper, pnl |
| `src/stores/journal_persistence.test.ts` | pnl, isPaper, createTestEntry, id |
| `src/stores/quiz.test.ts` | index, value.key |
| `src/stores/types.ts` | JournalEntry, FeeRateType |
| `src/tests/performance/startup_benchmark.test.ts` | attempts, waitForAnalysis |
| `src/utils/circularBuffer.ts` | i, forEach, callback |
| `src/utils/confluenceAnalyzer.ts` | buyCount, adjust, analyze, score, ConfluenceAnalyzer, ... |
| `src/utils/scheduler.ts` | flush |
| `src/utils/server/bitunix.test.ts` | queryParamsStr, body, apiKey, apiKey, timestamp, ... |
| `src/utils/statefulTechnicalsCalculator.ts` | lastClose, newCandle, shift |
| `vitest.setup.ts` | mock, mock.length, ownKeys, createStorageMock, store |

## Entry Points

- `src/services/dataRepairService.ts::dataRepairService.repairMfeMae@365`
- `src/services/dataRepairService.ts::dataRepairService.repairMissingAtr@156`

## Connected Communities

- **utils +10 dirs** (30 cross-edges)
- **services +5 dirs · calculateIndicatorsFromArrays** (11 cross-edges)
- **services +42 dirs** (11 cross-edges)
- **services +10 dirs · slice** (9 cross-edges)
- **rules +10 dirs** (7 cross-edges)
- **services/alertEngine +4 dirs** (6 cross-edges)
- **benchmarks +11 dirs** (6 cross-edges)
- **services +5 dirs · encrypt** (6 cross-edges)
- **utils +2 dirs** (5 cross-edges)
- **components/shared +13 dirs** (4 cross-edges)
- **services/alertEngine · push** (4 cross-edges)
- **services +5 dirs · ensureHistory** (4 cross-edges)
- **services +2 dirs · set** (4 cross-edges)
- **services +6 dirs · dispatchMessage** (3 cross-edges)
- **services +30 dirs** (3 cross-edges)
- **calculators +12 dirs** (2 cross-edges)
- **services +2 dirs · syncService.syncBitunixPositions** (2 cross-edges)
- **services +6 dirs · processNext** (2 cross-edges)
- **services +6 dirs · BitunixWebSocketService** (2 cross-edges)
- **services +1 dirs · app.init** (1 cross-edges)
- **. +2 dirs · parseDateString** (1 cross-edges)
- **services +4 dirs · normalizeTpSlRow** (1 cross-edges)
- **services/exchange +2 dirs · closePosition** (1 cross-edges)
- **alerts · parsePriceThreshold** (1 cross-edges)
- **services +3 dirs · delete** (1 cross-edges)
- **components/shared +5 dirs · formatApiNum** (1 cross-edges)
- **server/venues +22 dirs** (1 cross-edges)
- **services/alertEngine +1 dirs · withAlertsWithheld** (1 cross-edges)
- **services · ensurePositionFreshness** (1 cross-edges)
- **stores/market +1 dirs** (1 cross-edges)
- **services · checkOpfsSnapshotOnStartup** (1 cross-edges)
- **services +5 dirs · safeDecimal** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-745")
explore(operation:"context", task:"understand services +14 dirs", format:"gcx")
relations(operation:"usages", target:{symbol:"src/services/dataRepairService.ts::dataRepairService.repairMfeMae@365"}, format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
