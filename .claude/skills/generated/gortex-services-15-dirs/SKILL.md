---
name: gortex-services-15-dirs
description: "Work in the services +15 dirs area — 627 symbols across 62 files (69% cohesion)"
---

# services +15 dirs

627 symbols | 62 files | 69% cohesion

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
- `src/lib/alerts/indicatorFormLeaf.ts`
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
- `src/lib/rules/alertPathIndicators.ts`
- `src/lib/rules/indicatorRequests.ts`
- `src/lib/rules/types.ts`
- `src/services/alertEngine/alertEngine.test.ts`
- `src/services/alertEngine/alertEngine.ts`
- `src/services/alertEngine/indicatorWarmup.ts`
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
- `src/services/storageService.test.ts`
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
- `src/stores/types.ts`
- `src/tests/performance/startup_benchmark.test.ts`
- `src/utils/circularBuffer.ts`
- `src/utils/confluenceAnalyzer.ts`
- `src/utils/scheduler.ts`
- `src/utils/server/bitunix.test.ts`
- `src/utils/statefulTechnicalsCalculator.ts`
- `tests/benchmarks/storage.bench.ts`
- `vitest.setup.ts`

## Key Files

| File | Symbols |
|------|---------|
| `` | localeCompare, reverse, keys, values, filter, ... |
| `docs/backlog/backlog.generated.ts` | milestone, id, getBacklogItem, status, getBacklogByMilestone, ... |
| `src/components/shared/FundingRatePopover.svelte` | result, placement, updatePosition, arrowY, staticSideMap, ... |
| `src/components/shared/PositionsSidebar.dedup.component.test.ts` | accountPostCount |
| `src/components/shared/journal/JournalTable.svelte` | Props |
| `src/components/shared/journal/TradeDetailDrawer.svelte` | Props |
| `src/lib/alerts/indicatorCatalogue.test.ts` | cumulativeIds |
| `src/lib/alerts/indicatorCatalogue.ts` | group, indicatorsInGroup |
| `src/lib/alerts/indicatorFormLeaf.ts` | params, canonicalRef, ref |
| `src/lib/alerts/indicatorSettingsSeed.ts` | mappedIndicatorKeys, alertableIndicatorKeys |
| `src/lib/alerts/priceFormLeaf.ts` | canonicalise, value, record, entries |
| `src/lib/calculator_charts.test.ts` | overrides, createTrade |
| `src/lib/calculators/aggregator.ts` | openTrades, closedTrades, journal, context, journal, ... |
| `src/lib/calculators/charts.ts` | getRiskData, context, winStreaks, closedTrades, pf, ... |
| `src/lib/calculators/core.ts` | val, getTradePnL, t |
| `src/lib/calculators/getQualityData.test.ts` | risk, dateStr, status, pnl, id, ... |
| `src/lib/calculators/new_charts.test.ts` | createTrade, overrides |
| `src/lib/calculators/rolling_stats.test.ts` | overrides, createTrade |
| `src/lib/calculators/stats.test.ts` | createTrade, overrides |
| `src/lib/calculators/stats.ts` | trade, context, feeImpact, peakEquity, winRate, ... |
| `src/lib/calculators/types.ts` | JournalContext, JournalStats, PerformanceStats |
| `src/lib/marketDashboard.ts` | measured, marketBreadth, bullish, rows |
| `src/lib/rules/alertPathIndicators.ts` | indicator, effectiveFieldOf |
| `src/lib/rules/indicatorRequests.ts` | field, indicatorKey, params, indicator, timeframe |
| `src/lib/rules/types.ts` | RuleRefusal, Refused |
| `src/services/alertEngine/alertEngine.test.ts` | id, remove_alert |
| `src/services/alertEngine/alertEngine.ts` | symbol, heldAlertsFor |
| `src/services/alertEngine/indicatorWarmup.ts` | params, sortedParams |
| `src/services/alertEngine/legacyReplayCoordinator.test.ts` | history, source.heldAlertsFor, symbol, initialHeld, alert, ... |
| `src/services/alertEngine/legacyReplayCoordinator.ts` | from, a, outsidersOf, replayScoped, from, ... |
| `src/services/alertEngine/replayClosedCandles.ts` | ReplayReport |
| `src/services/alertEngine/ruleEvaluationLoop.ts` | unevaluableRules |
| `src/services/alertEngine/ruleLoopWiring.ts` | e, klines, readAvailableKlineTimeframes, symbol |
| `src/services/alertEngine/shadowLedger.ts` | emptyShadowLedger, keyOf, delaysMs, legacyOnly, records, ... |
| `src/services/apiService.ts` | next, pruneCache, evicted, now, key, ... |
| `src/services/cloudService.rateLimit.test.ts` | row, globalMessage.delete, senderActivity.iter |
| `src/services/dataRepairService.ts` | total, reqStart, proposedEnd, s, currentChunk, ... |
| `src/services/marketWatcher/subscriptionRegistry.ts` | intendedTargets, marketData, intended |
| `src/services/notificationService.svelte.ts` | remember, key, oldest |
| `src/services/omsService.ts` | getAllOrders |
| `src/services/orderGate.test.ts` | key, options, options, key, key, ... |
| `src/services/paperAccountFeed.ts` | startTime, endTime, query, HistoryQuery, historyOrders |
| `src/services/storageService.test.ts` | mockStore.getAll |
| `src/services/technicalsService.ts` | staleKeys, cleanupStaleCache, now |
| `src/services/technicalsTypes.ts` | ConfluenceData |
| `src/services/tradeService.ts` | failures, provider, results, positions, closeAllPositions, ... |
| `src/stores/alertPanel.svelte.ts` | claimedFields, refusals, unclaimedRefusals, refusals, refusalsForField, ... |
| `src/stores/alerts.svelte.ts` | heldAlertsFor, symbol |
| `src/stores/alerts_engineWiring.test.ts` | id, resyncs, remove_alert |
| `src/stores/analysis.svelte.ts` | AnalysisManager, lastUpdate, bullishCount, toRemove, reset, ... |
| `src/stores/externalDeliveryLog.svelte.ts` | failureCount |
| `src/stores/journal_paperTrades.test.ts` | pnl, id, entry, isPaper |
| `src/stores/journal_persistence.test.ts` | id, createTestEntry, pnl, isPaper |
| `src/stores/types.ts` | FeeRateType, JournalEntry |
| `src/tests/performance/startup_benchmark.test.ts` | waitForAnalysis, attempts |
| `src/utils/circularBuffer.ts` | forEach, callback, i |
| `src/utils/confluenceAnalyzer.ts` | contributing, score, data, ichi, buyCount, ... |
| `src/utils/scheduler.ts` | flush |
| `src/utils/server/bitunix.test.ts` | queryString, timestamp, nonce, digest, params, ... |
| `src/utils/statefulTechnicalsCalculator.ts` | shift, lastClose, newCandle |
| `tests/benchmarks/storage.bench.ts` | v, k, v, StoredRecord, req, ... |
| `vitest.setup.ts` | mock, mock.length, ownKeys, createStorageMock, store |

## Entry Points

- `src/services/dataRepairService.ts::dataRepairService.repairMfeMae@365`
- `src/services/dataRepairService.ts::dataRepairService.repairMissingAtr@156`

## Connected Communities

- **utils +10 dirs** (30 cross-edges)
- **services +46 dirs** (13 cross-edges)
- **services +5 dirs · calculateIndicatorsFromArrays** (11 cross-edges)
- **services +10 dirs · slice** (9 cross-edges)
- **rules +9 dirs** (7 cross-edges)
- **services +5 dirs · encrypt** (6 cross-edges)
- **benchmarks +11 dirs** (6 cross-edges)
- **services/alertEngine +4 dirs** (6 cross-edges)
- **utils +2 dirs** (5 cross-edges)
- **services/alertEngine · push** (4 cross-edges)
- **components/shared +13 dirs** (4 cross-edges)
- **services +6 dirs · ensureHistory** (4 cross-edges)
- **services +2 dirs · set** (4 cross-edges)
- **services +6 dirs · dispatchMessage** (3 cross-edges)
- **services +29 dirs** (3 cross-edges)
- **backgrounds/engines +11 dirs** (2 cross-edges)
- **services +6 dirs · processNext** (2 cross-edges)
- **services +2 dirs · syncService.syncBitunixPositions** (2 cross-edges)
- **services +6 dirs · BitunixWebSocketService** (2 cross-edges)
- **services +1 dirs · app.init** (1 cross-edges)
- **alerts · parsePriceThreshold** (1 cross-edges)
- **services/alertEngine +1 dirs · withAlertsWithheld** (1 cross-edges)
- **services · resolveLater** (1 cross-edges)
- **server/venues +16 dirs** (1 cross-edges)
- **services +4 dirs · normalizeTpSlRow** (1 cross-edges)
- **alerts +2 dirs · cardAlertField** (1 cross-edges)
- **services · ensurePositionFreshness** (1 cross-edges)
- **components/shared +5 dirs · formatApiNum** (1 cross-edges)
- **stores +1 dirs · safeDecimal** (1 cross-edges)
- **stores/market +1 dirs** (1 cross-edges)
- **services · checkOpfsSnapshotOnStartup** (1 cross-edges)
- **services +3 dirs · delete** (1 cross-edges)
- **. +2 dirs · parseDateString** (1 cross-edges)
- **services/exchange +2 dirs · closePosition** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-739")
explore(operation:"context", task:"understand services +15 dirs", format:"gcx")
relations(operation:"usages", target:{symbol:"src/services/dataRepairService.ts::dataRepairService.repairMfeMae@365"}, format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
