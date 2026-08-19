---
name: gortex-src-services-21-dirs
description: "Work in the src/services +21 dirs area — 1378 symbols across 74 files (80% cohesion)"
---

# src/services +21 dirs

1378 symbols | 74 files | 80% cohesion

## When to Use

Use this skill when working on files in:
- ``
- `.worktrees/backlog-jcodemunch/src/actions/viewport.ts`
- `.worktrees/backlog-jcodemunch/src/components/shared/PositionsSidebar.svelte`
- `.worktrees/backlog-jcodemunch/src/config/rssPresets.ts`
- `.worktrees/backlog-jcodemunch/src/lib/pets/DuckLogic.ts`
- `.worktrees/backlog-jcodemunch/src/lib/spacetimedb/types.ts`
- `.worktrees/backlog-jcodemunch/src/service-worker.ts`
- `.worktrees/backlog-jcodemunch/src/services/activeTechnicals/calculationExecutor.ts`
- `.worktrees/backlog-jcodemunch/src/services/activeTechnicals/visibilityController.ts`
- `.worktrees/backlog-jcodemunch/src/services/activeTechnicalsManager.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/services/activeTechnicalsManager.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/aggregatorService.ts`
- `.worktrees/backlog-jcodemunch/src/services/alertEngine/alertEngine.ts`
- `.worktrees/backlog-jcodemunch/src/services/apiQuotaTracker.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/services/apiService.repro.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/apiService.ts`
- `.worktrees/backlog-jcodemunch/src/services/apiService_syntheticTimeframes.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/appEffects.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/services/bitgetWs.ts`
- `.worktrees/backlog-jcodemunch/src/services/bitunixWs.ts`
- `.worktrees/backlog-jcodemunch/src/services/cloudService.ts`
- `.worktrees/backlog-jcodemunch/src/services/connectionManager.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/connectionManager.ts`
- `.worktrees/backlog-jcodemunch/src/services/dataRepairService.ts`
- `.worktrees/backlog-jcodemunch/src/services/dbService.ts`
- `.worktrees/backlog-jcodemunch/src/services/discordService.ts`
- `.worktrees/backlog-jcodemunch/src/services/exchange/bitgetAdapter.ts`
- `.worktrees/backlog-jcodemunch/src/services/exchange/bitunixAdapter.ts`
- `.worktrees/backlog-jcodemunch/src/services/fundingRateService.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/services/incrementalCache.ts`
- `.worktrees/backlog-jcodemunch/src/services/logger.ts`
- `.worktrees/backlog-jcodemunch/src/services/marketAnalyst.ts`
- `.worktrees/backlog-jcodemunch/src/services/marketWatcher.ts`
- `.worktrees/backlog-jcodemunch/src/services/marketWatcher/historyFetcher.ts`
- `.worktrees/backlog-jcodemunch/src/services/marketWatcher/subscriptionRegistry.ts`
- `.worktrees/backlog-jcodemunch/src/services/mdaService.ts`
- `.worktrees/backlog-jcodemunch/src/services/newsService.ts`
- `.worktrees/backlog-jcodemunch/src/services/omsService.ts`
- `.worktrees/backlog-jcodemunch/src/services/paperExchange.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/paperTrading_seam.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/rmsService.ts`
- `.worktrees/backlog-jcodemunch/src/services/rssParserService.ts`
- `.worktrees/backlog-jcodemunch/src/services/storageService.ts`
- `.worktrees/backlog-jcodemunch/src/services/technicalsService.ts`
- `.worktrees/backlog-jcodemunch/src/services/technicalsTypes.ts`
- `.worktrees/backlog-jcodemunch/src/services/toastService.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/services/tradeService.ts`
- `.worktrees/backlog-jcodemunch/src/services/webGpuCalculator.ts`
- `.worktrees/backlog-jcodemunch/src/services/workerPool.ts`
- `.worktrees/backlog-jcodemunch/src/stores/analysis.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/stores/chat.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/stores/entitlement.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/stores/market.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/stores/news.test.ts`
- `.worktrees/backlog-jcodemunch/src/stores/quiz.test.ts`
- `.worktrees/backlog-jcodemunch/src/types/apiSchemas.ts`
- `.worktrees/backlog-jcodemunch/src/utils/WasmTechnicalsCalculator.ts`
- `.worktrees/backlog-jcodemunch/src/utils/errorUtils.ts`
- `.worktrees/backlog-jcodemunch/src/utils/networkMonitor.ts`
- `.worktrees/backlog-jcodemunch/src/utils/requestDeduplicator.ts`
- `.worktrees/backlog-jcodemunch/src/utils/symbolUtils.ts`
- `.worktrees/backlog-jcodemunch/src/utils/timeUtils.ts`
- `.worktrees/backlog-jcodemunch/src/utils/utils.ts`
- `.worktrees/backlog-jcodemunch/src/workers/technicals.worker.ts`
- `src/components/shared/PositionsSidebar.svelte`
- `src/lib/spacetimedb/types.ts`
- `src/service-worker.ts`
- `src/services/activeTechnicalsManager.test.ts`
- `src/services/connectionManager.test.ts`
- `src/services/connectionManager.ts`
- `src/services/marketWatcher.ts`
- `src/services/mdaService.ts`
- `src/stores/news.test.ts`
- `src/utils/requestDeduplicator.ts`

## Key Files

| File | Symbols |
|------|---------|
| `` | finally, map |
| `.worktrees/backlog-jcodemunch/src/actions/viewport.ts` | destroy |
| `.worktrees/backlog-jcodemunch/src/components/shared/PositionsSidebar.svelte` | res, e, pos, msg, handleClosePosition |
| `.worktrees/backlog-jcodemunch/src/config/rssPresets.ts` | urls, urls, getPresetUrls, ids, presets, ... |
| `.worktrees/backlog-jcodemunch/src/lib/pets/DuckLogic.ts` | group, scene, mat, leftEye, init, ... |
| `.worktrees/backlog-jcodemunch/src/lib/spacetimedb/types.ts` | GlobalMessage |
| `.worktrees/backlog-jcodemunch/src/service-worker.ts` | key, deleteOldCaches |
| `.worktrees/backlog-jcodemunch/src/services/activeTechnicals/calculationExecutor.ts` | currentTechnicals, message, forceRefresh, timeframe, lastIdx, ... |
| `.worktrees/backlog-jcodemunch/src/services/activeTechnicals/visibilityController.ts` | VisibilityController, wasVisible, isVisible, constructor, isTabVisible, ... |
| `.worktrees/backlog-jcodemunch/src/services/activeTechnicalsManager.svelte.ts` | timeframe, userInterval, lastActiveSymbol, executor, cleanup, ... |
| `.worktrees/backlog-jcodemunch/src/services/activeTechnicalsManager.test.ts` | times, seedKlines, symbol, timeframe |
| `.worktrees/backlog-jcodemunch/src/services/aggregatorService.ts` | analyze, constructor, initWorker, pendingRejects, AggregatorService, ... |
| `.worktrees/backlog-jcodemunch/src/services/alertEngine/alertEngine.ts` | id, removeAlert, e, ensureLoaded |
| `.worktrees/backlog-jcodemunch/src/services/apiQuotaTracker.svelte.ts` | errorMsg, errorMsg, provider, logCall, recordError, ... |
| `.worktrees/backlog-jcodemunch/src/services/apiService.repro.test.ts` | text |
| `.worktrees/backlog-jcodemunch/src/services/apiService.ts` | controller, timeout, CACHE_TTL, key, getOptimalTimeframe, ... |
| `.worktrees/backlog-jcodemunch/src/services/apiService_syntheticTimeframes.test.ts` | calls, installFakeExchange |
| `.worktrees/backlog-jcodemunch/src/services/appEffects.svelte.ts` | symbolDebounceTimer, computeKeys, knownFundingRateSymbols, computeKeys, currentWatchedSymbol, ... |
| `.worktrees/backlog-jcodemunch/src/services/bitgetWs.ts` | cleanup, symbol, channel, ws, symbol, ... |
| `.worktrees/backlog-jcodemunch/src/services/bitunixWs.ts` | connectPrivate, delay, payload, bitunixChannel, last, ... |
| `.worktrees/backlog-jcodemunch/src/services/cloudService.ts` | subscribeMessages, conn, connect, e, onStatusCallback, ... |
| `.worktrees/backlog-jcodemunch/src/services/connectionManager.test.ts` | makeProvider |
| `.worktrees/backlog-jcodemunch/src/services/connectionManager.ts` | switchProvider, service, hiddenForMs, killAll, hiddenAt, ... |
| `.worktrees/backlog-jcodemunch/src/services/dataRepairService.ts` | count, clean, onProgress, trade, targets, ... |
| `.worktrees/backlog-jcodemunch/src/services/dbService.ts` | delete, db, key, key, T, ... |
| `.worktrees/backlog-jcodemunch/src/services/discordService.ts` | DiscordMessage, discordBotToken, discordChannels, thisPromise, discordService.fetchDiscordNews, ... |
| `.worktrees/backlog-jcodemunch/src/services/exchange/bitgetAdapter.ts` | params, marketData.subscribe, symbol, trading.cancelAllOrders, symbol, ... |
| `.worktrees/backlog-jcodemunch/src/services/exchange/bitunixAdapter.ts` | symbol, symbol, params, channel, symbol, ... |
| `.worktrees/backlog-jcodemunch/src/services/fundingRateService.svelte.ts` | rates, symbol, entry, fetchPromise, applyCachedRateFor, ... |
| `.worktrees/backlog-jcodemunch/src/services/incrementalCache.ts` | timeframe, cleanup, symbol, updateConfig, evictIfNeeded, ... |
| `.worktrees/backlog-jcodemunch/src/services/logger.ts` | prefix, settings, isEnabled, warn, debug, ... |
| `.worktrees/backlog-jcodemunch/src/services/marketAnalyst.ts` | primaryKlines, klinesResults, klinesMap, fetchTime, isPartial, ... |
| `.worktrees/backlog-jcodemunch/src/services/marketWatcher.ts` | constructor |
| `.worktrees/backlog-jcodemunch/src/services/marketWatcher/historyFetcher.ts` | hasGaps, batchesNeeded, lastErrorLog, currentTotal, symbol, ... |
| `.worktrees/backlog-jcodemunch/src/services/marketWatcher/subscriptionRegistry.ts` | symbol, _subscriptionsDirty, requests, symbol, tf, ... |
| `.worktrees/backlog-jcodemunch/src/services/mdaService.ts` | provider, mdaService.normalizeKlines, raw |
| `.worktrees/backlog-jcodemunch/src/services/newsService.ts` | e, text, news, newsHash, safeTitle, ... |
| `.worktrees/backlog-jcodemunch/src/services/omsService.ts` | id, oldersOutsideBuffer, forceOne, updatePosition, thresholdMs, ... |
| `.worktrees/backlog-jcodemunch/src/services/paperExchange.test.ts` | close, side, qty |
| `.worktrees/backlog-jcodemunch/src/services/paperTrading_seam.test.ts` | position, symbol |
| `.worktrees/backlog-jcodemunch/src/services/rmsService.ts` | monitorRisk, positions, e |
| `.worktrees/backlog-jcodemunch/src/services/rssParserService.ts` | urls, concurrency, rssParserService.parseMultipleFeeds, index, e, ... |
| `.worktrees/backlog-jcodemunch/src/services/storageService.ts` | saveKlines, usedMB, tx, logUsage, db, ... |
| `.worktrees/backlog-jcodemunch/src/services/technicalsService.ts` | pendingResolves, w, e, e, pendingRejects, ... |
| `.worktrees/backlog-jcodemunch/src/services/technicalsTypes.ts` | SerializedKline |
| `.worktrees/backlog-jcodemunch/src/services/toastService.svelte.ts` | info, oldest, duration, success, id, ... |
| `.worktrees/backlog-jcodemunch/src/services/tradeService.ts` | positionId, now, promises, e, ensurePositionFreshness, ... |
| `.worktrees/backlog-jcodemunch/src/services/webGpuCalculator.ts` | cached, getOrCreateInputBuffer, data, buffer |
| `.worktrees/backlog-jcodemunch/src/services/workerPool.ts` | transfer, recycleWorker, maxWorkers, task, workerUrl, ... |
| `.worktrees/backlog-jcodemunch/src/stores/analysis.svelte.ts` | data, symbol, updateAnalysis |
| `.worktrees/backlog-jcodemunch/src/stores/chat.svelte.ts` | constructor, status, applyStatus |
| `.worktrees/backlog-jcodemunch/src/stores/entitlement.svelte.ts` | hasBitunixKeys, hasApiKeys, capabilities, apiKeys, hasBitgetKeys |
| `.worktrees/backlog-jcodemunch/src/stores/market.svelte.ts` | updateTelemetry, timeframe, source, partial, limit, ... |
| `.worktrees/backlog-jcodemunch/src/stores/news.test.ts` | news, newsService.analyzeSentiment, mockAnalyzeSentiment |
| `.worktrees/backlog-jcodemunch/src/stores/quiz.test.ts` | key, value.removeItem |
| `.worktrees/backlog-jcodemunch/src/types/apiSchemas.ts` | validateResponseSize, data, maxSizeMB, sizeMB, sizeBytes |
| `.worktrees/backlog-jcodemunch/src/utils/WasmTechnicalsCalculator.ts` | shift |
| `.worktrees/backlog-jcodemunch/src/utils/errorUtils.ts` | code, codeStr, getBitunixErrorKey |
| `.worktrees/backlog-jcodemunch/src/utils/networkMonitor.ts` | type, getThrottleMultiplier |
| `.worktrees/backlog-jcodemunch/src/utils/requestDeduplicator.ts` | has, key |
| `.worktrees/backlog-jcodemunch/src/utils/symbolUtils.ts` | provider, s, symbol, normalizeSymbol |
| `.worktrees/backlog-jcodemunch/src/utils/timeUtils.ts` | native, getOptimalTimeframe, TimeframeResolution, nativeTfs, targetTf, ... |
| `.worktrees/backlog-jcodemunch/src/utils/utils.ts` | num, getIntervalMs, match, unit, timeframe, ... |
| `.worktrees/backlog-jcodemunch/src/workers/technicals.worker.ts` | arr, resize, n |
| `src/components/shared/PositionsSidebar.svelte` | res, handleClosePosition, msg, pos, e |
| `src/lib/spacetimedb/types.ts` | GlobalMessage |
| `src/service-worker.ts` | deleteOldCaches, key |
| `src/services/activeTechnicalsManager.test.ts` | symbol, seedKlines, timeframe, times |
| `src/services/connectionManager.test.ts` | makeProvider |
| `src/services/connectionManager.ts` | ManagedService |
| `src/services/marketWatcher.ts` | constructor |
| `src/services/mdaService.ts` | mdaService.normalizeKlines, raw, provider |
| `src/stores/news.test.ts` | mockAnalyzeSentiment, news, newsService.analyzeSentiment |
| `src/utils/requestDeduplicator.ts` | key, task, onJoin, execute, promise |

## Entry Points

- `.worktrees/backlog-jcodemunch/src/services/newsService.ts::newsService.fetchNews@189`
- `.worktrees/backlog-jcodemunch/src/services/newsService.ts::newsService.analyzeSentiment@429`
- `.worktrees/backlog-jcodemunch/src/services/apiService.ts::apiService.fetchBitunixKlines@654`

## Connected Communities

- **src/services +26 dirs** (64 cross-edges)
- **lib/calculators +24 dirs** (53 cross-edges)
- **services +30 dirs** (38 cross-edges)
- **src/services +33 dirs** (20 cross-edges)
- **utils/server +16 dirs** (15 cross-edges)
- **src/services +1 dirs** (14 cross-edges)
- **services +8 dirs** (14 cross-edges)
- **backlog-jcodemunch/src · syncService.syncBitunixPositions** (12 cross-edges)
- **backlog-jcodemunch/src · map** (11 cross-edges)
- **backlog-jcodemunch/src · calculateIndicatorsFromArrays** (11 cross-edges)
- **src/services +11 dirs** (10 cross-edges)
- **lib/actions +10 dirs · addEventListener** (8 cross-edges)
- **src/utils +14 dirs** (6 cross-edges)
- **tests/benchmarks +12 dirs** (6 cross-edges)
- **lib/server +38 dirs** (5 cross-edges)
- **src/services · getAll** (5 cross-edges)
- **src/services +5 dirs** (5 cross-edges)
- **services +5 dirs** (5 cross-edges)
- **src/services · resetIfNeeded** (4 cross-edges)
- **backlog-jcodemunch/src · IndicatorManager** (3 cross-edges)
- **lib/windows +10 dirs** (3 cross-edges)
- **backlog-jcodemunch/src · safeDecimal** (3 cross-edges)
- **. +2 dirs · login** (3 cross-edges)
- **src/services · canUseIncremental** (3 cross-edges)
- **src/services · shouldFetchNews** (2 cross-edges)
- **src/stores · QuizStore** (2 cross-edges)
- **src/services · getKlines** (2 cross-edges)
- **lib/actions +10 dirs · removeEventListener** (2 cross-edges)
- **backlog-jcodemunch/src · parseDecimal** (2 cross-edges)
- **src/services · RateLimiter** (2 cross-edges)
- **stores +1 dirs · RiskManager** (2 cross-edges)
- **backlog-jcodemunch/src · handleMessage** (2 cross-edges)
- **src/stores +4 dirs · error** (2 cross-edges)
- **src/services +3 dirs** (2 cross-edges)
- **backlog-jcodemunch/src · handleEvent** (2 cross-edges)
- **src/services · t** (1 cross-edges)
- **backlog-jcodemunch/src · MarketManager** (1 cross-edges)
- **services +1 dirs · WorkerPool** (1 cross-edges)
- **. +4 dirs · parseDateString** (1 cross-edges)
- **src/services · verify** (1 cross-edges)
- **src/stores · ChatManager** (1 cross-edges)
- **lib/pets · createAccessories** (1 cross-edges)
- **services +4 dirs · ensureHistory** (1 cross-edges)
- **src/services · WorkerPool** (1 cross-edges)
- **src/services · scheduleIdleCallback** (1 cross-edges)
- **src/stores · updateElement** (1 cross-edges)
- **src/services · calculateAnalysisMetrics** (1 cross-edges)
- **src/utils +6 dirs** (1 cross-edges)
- **backlog-jcodemunch/src · toNumFast** (1 cross-edges)
- **. +2 dirs · calculateStep** (1 cross-edges)
- **stores +4 dirs** (1 cross-edges)
- **src/services · syncToStores** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-235")
explore(operation:"context", task:"understand src/services +21 dirs", format:"gcx")
relations(operation:"usages", target:{symbol:".worktrees/backlog-jcodemunch/src/services/newsService.ts::newsService.fetchNews@189"}, format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
