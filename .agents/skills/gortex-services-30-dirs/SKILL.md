---
name: gortex-services-30-dirs
description: "Work in the services +30 dirs area — 682 symbols across 102 files (76% cohesion)"
---

# services +30 dirs

682 symbols | 102 files | 76% cohesion

## When to Use

Use this skill when working on files in:
- ``
- `.pi/extensions/gortex/index.ts`
- `evals/hook-guard.eval.test.ts`
- `external-call::stdlib:dompurify`
- `src/components/inputs/PortfolioInputs.component.test.ts`
- `src/components/settings/tabs/SystemTab.svelte`
- `src/lib/academy/usePatternFavorites.svelte.ts`
- `src/lib/alerts/indicatorCatalogue.test.ts`
- `src/lib/alerts/patternCatalogue.test.ts`
- `src/lib/chartSetup.ts`
- `src/lib/rules/ruleEvaluationGate.ts`
- `src/lib/rules/ruleSchema.test.ts`
- `src/lib/rules/ruleSchema.ts`
- `src/lib/rules/ruleSentence.test.ts`
- `src/lib/rules/types.ts`
- `src/lib/utils/sanitizer.ts`
- `src/lib/windows/implementations/MarkdownView.svelte`
- `src/routes/api/account-settings/account_settings.test.ts`
- `src/routes/api/funding-rate/funding-rate.test.ts`
- `src/routes/api/klines/klines.test.ts`
- `src/routes/api/orders/orders_bitget_history.test.ts`
- `src/routes/api/orders/orders_cancel_path.test.ts`
- `src/routes/api/orders/orders_history_queryCanceled.test.ts`
- `src/routes/api/orders/orders_history_reduceOnly.test.ts`
- `src/routes/api/orders/orders_history_time_range.test.ts`
- `src/routes/api/orders/orders_leverage_marginmode.test.ts`
- `src/routes/api/orders/orders_native_bulk.test.ts`
- `src/routes/api/orders/orders_place_order_hedge.test.ts`
- `src/routes/api/orders/orders_place_order_ordertype.test.ts`
- `src/routes/api/positions/positions_positionId.test.ts`
- `src/routes/api/sentiment/sentiment.test.ts`
- `src/routes/api/stream-logs/+server.ts`
- `src/routes/api/sync/positions-history/positions_history_security.test.ts`
- `src/routes/api/tickers/tickers.test.ts`
- `src/routes/api/tpsl/tpsl_paths.test.ts`
- `src/services/alertEngine/alertEngine.test.ts`
- `src/services/alertEngine/alertEngine.ts`
- `src/services/alertEngine/armRule.test.ts`
- `src/services/alertEngine/armRule.ts`
- `src/services/alertEngine/correctedCandle.integration.test.ts`
- `src/services/alertEngine/cutoverNotice.test.ts`
- `src/services/alertEngine/indicatorContext.test.ts`
- `src/services/alertEngine/legacyReplayCoordinator.ts`
- `src/services/alertEngine/migrateAlertsToRules.test.ts`
- `src/services/alertEngine/migrateAlertsToRules.ts`
- `src/services/alertEngine/reconcileOrphanedRules.test.ts`
- `src/services/alertEngine/reconcileOrphanedRules.ts`
- `src/services/alertEngine/ruleCoverage.ts`
- `src/services/alertEngine/ruleEvaluation.integration.test.ts`
- `src/services/alertEngine/ruleEvaluationLoop.test.ts`
- `src/services/alertEngine/ruleEvaluationLoop.ts`
- `src/services/alertEngine/ruleLifecycleView.test.ts`
- `src/services/alertEngine/ruleLifecycleView.ts`
- `src/services/alertEngine/ruleLoopWiring.ts`
- `src/services/alertEngine/ruleOriginLedger.test.ts`
- `src/services/alertEngine/ruleOriginLedger.ts`
- `src/services/apiService_fundingRate.test.ts`
- `src/services/apiService_infinity.test.ts`
- `src/services/apiService_rateLimit.test.ts`
- `src/services/app.test.ts`
- `src/services/app.ts`
- `src/services/bitgetWs.ts`
- `src/services/calculationStrategy.test.ts`
- `src/services/exchange/adapterConformance.harness.ts`
- `src/services/exchange/bitgetAdapter.ts`
- `src/services/marketWatcher/syntheticHistory.test.ts`
- `src/services/newsService_limit.test.ts`
- `src/services/newsService_sentiment.test.ts`
- `src/services/orderPlacementService.test.ts`
- `src/services/paperTrading_modeSwitchRace.test.ts`
- `src/services/paperTrading_seam.test.ts`
- `src/services/paperTrading_tracking.test.ts`
- `src/services/serializationService.ts`
- `src/services/syncService.parallel.test.ts`
- `src/services/tradeService_accountSettings.test.ts`
- `src/services/tradeService_flashClose.test.ts`
- `src/services/tradeService_hardening.test.ts`
- `src/services/tradeService_hedgeClose.test.ts`
- `src/services/tradeService_race.test.ts`
- `src/services/tradeService_requestFields.test.ts`
- `src/services/tradeService_serialization.test.ts`
- `src/services/tradeService_tpslModify.test.ts`
- `src/services/tradeService_tpslPlacement.test.ts`
- `src/stores/ai.svelte.ts`
- `src/stores/alertPanel.svelte.ts`
- `src/stores/alerts.svelte.ts`
- `src/stores/alerts_engineWiring.test.ts`
- `src/stores/alerts_firingSink.test.ts`
- `src/stores/journal.svelte.ts`
- `src/stores/modal.test.ts`
- `src/stores/notes.svelte.ts`
- `src/stores/settings.credentialStore.test.ts`
- `src/tests/flash-close.confirmation.test.ts`
- `src/tests/flash-close.test.ts`
- `src/tests/security/credential_transport.test.ts`
- `src/tests/tradeService_race.test.ts`
- `src/types/apiSchemas.money.test.ts`
- `src/utils/markdownUtils.ts`
- `src/utils/storageHelper.ts`
- `src/utils/storageUtils.ts`
- `src/utils/storageWrapper.ts`
- `tests/unit/verify_tpsl_validation.test.ts`

## Key Files

| File | Symbols |
|------|---------|
| `` | stringify, error, parse |
| `.pi/extensions/gortex/index.ts` | out, envelope, callHook, PiDecision |
| `evals/hook-guard.eval.test.ts` | runGuard, result, payload |
| `external-call::stdlib:dompurify` | dompurify |
| `src/components/inputs/PortfolioInputs.component.test.ts` | text, safeJsonParse |
| `src/components/settings/tabs/SystemTab.svelte` | clearAppCache |
| `src/lib/academy/usePatternFavorites.svelte.ts` | id, next, toggle |
| `src/lib/alerts/indicatorCatalogue.test.ts` | lookback, document, valid, e, refusalOf, ... |
| `src/lib/alerts/patternCatalogue.test.ts` | timeframe, patternDoc, pattern |
| `src/lib/chartSetup.ts` | initZoomPlugin, err, plugin |
| `src/lib/rules/ruleEvaluationGate.ts` | evaluate, ctx, anchorMs, closedCandles, lastAnchorMs, ... |
| `src/lib/rules/ruleSchema.test.ts` | rule_evaluate, rule_authorise, rule_timeframes, rule_warmup_candles, rule_schema_version, ... |
| `src/lib/rules/ruleSchema.ts` | isReady, authorise, require, validate, core, ... |
| `src/lib/rules/ruleSentence.test.ts` | overrides, ruleWith, conditions |
| `src/lib/rules/types.ts` | RuleDocument, Verdict, TriggerFrequency, Provenance, ConsequenceLevel, ... |
| `src/lib/utils/sanitizer.ts` | sanitizeHtml, dirty |
| `src/lib/windows/implementations/MarkdownView.svelte` | MarkdownView |
| `src/routes/api/account-settings/account_settings.test.ts` | init, text, sentRequest, text, url |
| `src/routes/api/funding-rate/funding-rate.test.ts` | mockFetch.text, mockFetch.text |
| `src/routes/api/klines/klines.test.ts` | text, text, text, text, text, ... |
| `src/routes/api/orders/orders_bitget_history.test.ts` | text, text |
| `src/routes/api/orders/orders_cancel_path.test.ts` | text, text, text |
| `src/routes/api/orders/orders_history_queryCanceled.test.ts` | text, text |
| `src/routes/api/orders/orders_history_reduceOnly.test.ts` | text, text, text |
| `src/routes/api/orders/orders_history_time_range.test.ts` | text, text, text, text, text |
| `src/routes/api/orders/orders_leverage_marginmode.test.ts` | text, text, text |
| `src/routes/api/orders/orders_native_bulk.test.ts` | text, text, text, text, text, ... |
| `src/routes/api/orders/orders_place_order_hedge.test.ts` | text, text |
| `src/routes/api/orders/orders_place_order_ordertype.test.ts` | text, options, sentBody, text |
| `src/routes/api/positions/positions_positionId.test.ts` | text |
| `src/routes/api/sentiment/sentiment.test.ts` | response.text |
| `src/routes/api/stream-logs/+server.ts` | controller, initMsg, stream.start, stream.cancel, cleanup |
| `src/routes/api/sync/positions-history/positions_history_security.test.ts` | text |
| `src/routes/api/tickers/tickers.test.ts` | text, text, text, text |
| `src/routes/api/tpsl/tpsl_paths.test.ts` | text |
| `src/services/alertEngine/alertEngine.test.ts` | free, set_alerts, failNextSet, fireOnEvaluate, HoldingWasm, ... |
| `src/services/alertEngine/alertEngine.ts` | WasmAlertEngineInstance |
| `src/services/alertEngine/armRule.test.ts` | rule, stored, threshold, id |
| `src/services/alertEngine/armRule.ts` | document, next, parsed, index, armRule, ... |
| `src/services/alertEngine/correctedCandle.integration.test.ts` | loop.readRules, alwaysFiringRule |
| `src/services/alertEngine/cutoverNotice.test.ts` | withCoveredAlert |
| `src/services/alertEngine/indicatorContext.test.ts` | rule, ruleReading, loop.readRules, loop.readRules, params, ... |
| `src/services/alertEngine/legacyReplayCoordinator.ts` | next, configureLegacyReplay |
| `src/services/alertEngine/migrateAlertsToRules.test.ts` | readMigratedAlertIds, raw, threshold, readLedger, conditionKey, ... |
| `src/services/alertEngine/migrateAlertsToRules.ts` | rule, value, createdAtMs, freshRule, rule, ... |
| `src/services/alertEngine/reconcileOrphanedRules.test.ts` | rule, enabled, id |
| `src/services/alertEngine/reconcileOrphanedRules.ts` | nothing, parsed, reconcileStoredRules, e, result, ... |
| `src/services/alertEngine/ruleCoverage.ts` | ledger, alertId, ruleIds, updated, e, ... |
| `src/services/alertEngine/ruleEvaluation.integration.test.ts` | loop.readRules, timeframe, migratedRule, loop.readRules, alert, ... |
| `src/services/alertEngine/ruleEvaluationLoop.test.ts` | reading, onFiring, loop.readRules, overrides, loop.readRules, ... |
| `src/services/alertEngine/ruleEvaluationLoop.ts` | rule, e, rule, record, firing, ... |
| `src/services/alertEngine/ruleLifecycleView.test.ts` | origins, entries, ruleDoc, seed, overrides, ... |
| `src/services/alertEngine/ruleLifecycleView.ts` | readRules, parsed, raw, e |
| `src/services/alertEngine/ruleLoopWiring.ts` | parsed, readStoredRules, raw, e |
| `src/services/alertEngine/ruleOriginLedger.test.ts` | raw, entries, storedLedger, ledgerWith |
| `src/services/alertEngine/ruleOriginLedger.ts` | emptyLedger, added, migratedAtMs, skipped, parseEntry, ... |
| `src/services/apiService_fundingRate.test.ts` | text, text, text, text, text |
| `src/services/apiService_infinity.test.ts` | text |
| `src/services/apiService_rateLimit.test.ts` | fetchMock.json, fetchMock.json, fetchMock.text, fetchMock.text |
| `src/services/app.test.ts` | json, json, json |
| `src/services/app.ts` | presets, app.getInputsAsObject, presets, s, presets, ... |
| `src/services/bitgetWs.ts` | channel, sendUnsubscribe, payload, symbol, ws |
| `src/services/calculationStrategy.test.ts` | makeStrategy, caps |
| `src/services/exchange/adapterConformance.harness.ts` | bitgetHarness.simulateLogin, inject |
| `src/services/exchange/bitgetAdapter.ts` | account.fetchFundingRateHistory |
| `src/services/marketWatcher/syntheticHistory.test.ts` | body, text, installFakeExchange, jsonResponse, text |
| `src/services/newsService_limit.test.ts` | mockResponse.text, mockResponse.text |
| `src/services/newsService_sentiment.test.ts` | text, text |
| `src/services/orderPlacementService.test.ts` | effectOf |
| `src/services/paperTrading_modeSwitchRace.test.ts` | respond, hold, body, resolve, text, ... |
| `src/services/paperTrading_seam.test.ts` | text |
| `src/services/paperTrading_tracking.test.ts` | text |
| `src/services/serializationService.ts` | chunkStr, content, end, total, i, ... |
| `src/services/syncService.parallel.test.ts` | lastJournalWrite, calls |
| `src/services/tradeService_accountSettings.test.ts` | text, text, calls |
| `src/services/tradeService_flashClose.test.ts` | text, text, text |
| `src/services/tradeService_hardening.test.ts` | text, text, text |
| `src/services/tradeService_hedgeClose.test.ts` | fetchSpy.text, calls, call, lastBody |
| `src/services/tradeService_race.test.ts` | text |
| `src/services/tradeService_requestFields.test.ts` | lastBody, fetchSpy.text, call |
| `src/services/tradeService_serialization.test.ts` | fetchSpy.text |
| `src/services/tradeService_tpslModify.test.ts` | sentParams, body, spyRequest, spy |
| `src/services/tradeService_tpslPlacement.test.ts` | spyRequest, spy, sentParams, body |
| `src/stores/ai.svelte.ts` | e, constructor, parsed, stored, load |
| `src/stores/alertPanel.svelte.ts` | symbol, accepted, blankDraft, validateDraft, e |
| `src/stores/alerts.svelte.ts` | initAlertEngine, startRuleEvaluationLoop, readAvailableKlineTimeframes, e, readClosedCandles, ... |
| `src/stores/alerts_engineWiring.test.ts` | resetModulesAndFlush, seedCoveredRule, seedCoveredRule, importFreshAlertsModule, FakeAlertEngineWasm, ... |
| `src/stores/alerts_firingSink.test.ts` | _.subscribe, overrides, run, ruleDoc |
| `src/stores/journal.svelte.ts` | data, current, json, load, e, ... |
| `src/stores/modal.test.ts` | browser |
| `src/stores/notes.svelte.ts` | messages, clearNotes, e, addNote, e, ... |
| `src/stores/settings.credentialStore.test.ts` | storedPayload |
| `src/tests/flash-close.confirmation.test.ts` | text |
| `src/tests/flash-close.test.ts` | text, text |
| `src/tests/security/credential_transport.test.ts` | text, text, text |
| `src/tests/tradeService_race.test.ts` | text |
| `src/types/apiSchemas.money.test.ts` | T, mustParse, result |
| `src/utils/markdownUtils.ts` | cleaned, e, e, text, text, ... |
| `src/utils/storageHelper.ts` | key, cacheKeys, e, value, retryError, ... |
| `src/utils/storageUtils.ts` | key, calculateUsage, scheduleCacheUpdate, oldValue, storageUtils.checkQuota, ... |
| `src/utils/storageWrapper.ts` | isAvailable, getEstimatedAvailableSpace, getItem, e, e, ... |
| `tests/unit/verify_tpsl_validation.test.ts` | request.text, request.text, request.text, text, request.text, ... |

## Connected Communities

- **services +6 dirs · dispatchMessage** (12 cross-edges)
- **services +42 dirs** (12 cross-edges)
- **services +14 dirs** (11 cross-edges)
- **services/alertEngine · push** (7 cross-edges)
- **services/alertEngine +4 dirs** (6 cross-edges)
- **stores +3 dirs** (5 cross-edges)
- **services +10 dirs · slice** (5 cross-edges)
- **services +5 dirs · ensureHistory** (5 cross-edges)
- **utils +15 dirs** (5 cross-edges)
- **server/venues +22 dirs** (4 cross-edges)
- **services +6 dirs · processNext** (3 cross-edges)
- **services/alertEngine +1 dirs · readCoveredAlertIds** (3 cross-edges)
- **services/alertEngine +1 dirs · refresh** (3 cross-edges)
- **services · checkOpfsSnapshotOnStartup** (3 cross-edges)
- **benchmarks +11 dirs** (2 cross-edges)
- **services +10 dirs · appFetch** (1 cross-edges)
- **rules +3 dirs** (1 cross-edges)
- **services +4 dirs · parseDecimal** (1 cross-edges)
- **services +2 dirs · syncService.syncBitunixPositions** (1 cross-edges)
- **calculators +12 dirs** (1 cross-edges)
- **services/alertEngine +1 dirs · ensureLoaded** (1 cross-edges)
- **services/alertEngine +1 dirs · firingMessage** (1 cross-edges)
- **scripts +6 dirs** (1 cross-edges)
- **services +2 dirs · set** (1 cross-edges)
- **services +6 dirs · BitunixWebSocketService** (1 cross-edges)
- **services +1 dirs · show** (1 cross-edges)
- **alerts/tabs +2 dirs · AlertsManager** (1 cross-edges)
- **. +2 dirs · repeat** (1 cross-edges)
- **services/alertEngine · reconcileOrphanedRules** (1 cross-edges)
- **alerts/tabs +4 dirs** (1 cross-edges)
- **services +5 dirs · safeDecimal** (1 cross-edges)
- **utils +10 dirs** (1 cross-edges)
- **services +2 dirs · restoreFromBackup** (1 cross-edges)
- **services/alertEngine · RuleEvaluationLoop** (1 cross-edges)
- **components/shared +2 dirs · handleScreenshotUpload** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-447")
explore(operation:"context", task:"understand services +30 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
