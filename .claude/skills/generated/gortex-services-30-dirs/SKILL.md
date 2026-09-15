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
| `` | parse, stringify, error |
| `.pi/extensions/gortex/index.ts` | out, envelope, callHook, PiDecision |
| `evals/hook-guard.eval.test.ts` | result, runGuard, payload |
| `external-call::stdlib:dompurify` | dompurify |
| `src/components/inputs/PortfolioInputs.component.test.ts` | safeJsonParse, text |
| `src/components/settings/tabs/SystemTab.svelte` | clearAppCache |
| `src/lib/academy/usePatternFavorites.svelte.ts` | next, id, toggle |
| `src/lib/alerts/indicatorCatalogue.test.ts` | refusalOf, document, lookback, e, valid, ... |
| `src/lib/alerts/patternCatalogue.test.ts` | patternDoc, timeframe, pattern |
| `src/lib/chartSetup.ts` | err, plugin, initZoomPlugin |
| `src/lib/rules/ruleEvaluationGate.ts` | document, ctx, verdict, evaluate, lastAnchorMs, ... |
| `src/lib/rules/ruleSchema.test.ts` | rule_validate, rule_schema_version, rule_validate, rule_warmup_candles, rule_evaluate, ... |
| `src/lib/rules/ruleSchema.ts` | document, contentHash, timeframes, core, document, ... |
| `src/lib/rules/ruleSentence.test.ts` | overrides, ruleWith, conditions |
| `src/lib/rules/types.ts` | TriggerFrequency, Provenance, RuleDocument, Verdict, RuleAction, ... |
| `src/lib/utils/sanitizer.ts` | dirty, sanitizeHtml |
| `src/lib/windows/implementations/MarkdownView.svelte` | MarkdownView |
| `src/routes/api/account-settings/account_settings.test.ts` | url, text, init, text, sentRequest |
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
| `src/routes/api/orders/orders_place_order_ordertype.test.ts` | text, sentBody, options, text |
| `src/routes/api/positions/positions_positionId.test.ts` | text |
| `src/routes/api/sentiment/sentiment.test.ts` | response.text |
| `src/routes/api/stream-logs/+server.ts` | stream.start, controller, initMsg, cleanup, stream.cancel |
| `src/routes/api/sync/positions-history/positions_history_security.test.ts` | text |
| `src/routes/api/tickers/tickers.test.ts` | text, text, text, text |
| `src/routes/api/tpsl/tpsl_paths.test.ts` | text |
| `src/services/alertEngine/alertEngine.test.ts` | add_alert, alert, failNextSet, HoldingWasm, alerts, ... |
| `src/services/alertEngine/alertEngine.ts` | WasmAlertEngineInstance |
| `src/services/alertEngine/armRule.test.ts` | id, rule, threshold, stored |
| `src/services/alertEngine/armRule.ts` | next, index, armRule, parsed, rules, ... |
| `src/services/alertEngine/correctedCandle.integration.test.ts` | alwaysFiringRule, loop.readRules |
| `src/services/alertEngine/cutoverNotice.test.ts` | withCoveredAlert |
| `src/services/alertEngine/indicatorContext.test.ts` | loop.readRules, loopFor, ruleReading, id, loop.readRules, ... |
| `src/services/alertEngine/legacyReplayCoordinator.ts` | configureLegacyReplay, next |
| `src/services/alertEngine/migrateAlertsToRules.test.ts` | createdAtMs, readRules, readLedger, timeframe, raw, ... |
| `src/services/alertEngine/migrateAlertsToRules.ts` | migratedIds, e, e, existingRules, existingIndex, ... |
| `src/services/alertEngine/reconcileOrphanedRules.test.ts` | id, rule, enabled |
| `src/services/alertEngine/reconcileOrphanedRules.ts` | raw, e, reconcileStoredRules, result, parsed, ... |
| `src/services/alertEngine/ruleCoverage.ts` | releaseCoverage, parsed, parsed, updated, e, ... |
| `src/services/alertEngine/ruleEvaluation.integration.test.ts` | timeframe, loop.readRules, loop.readRules, threshold, alert, ... |
| `src/services/alertEngine/ruleEvaluationLoop.test.ts` | loop.readRules, timeframe, reading, markCross, loop.readRules, ... |
| `src/services/alertEngine/ruleEvaluationLoop.ts` | verdict, timeframe, timeframe, RuleFiring, markCandles, ... |
| `src/services/alertEngine/ruleLifecycleView.test.ts` | ruleDoc, origins, overrides, entries, seed, ... |
| `src/services/alertEngine/ruleLifecycleView.ts` | raw, e, parsed, readRules |
| `src/services/alertEngine/ruleLoopWiring.ts` | readStoredRules, parsed, e, raw |
| `src/services/alertEngine/ruleOriginLedger.test.ts` | storedLedger, raw, entries, ledgerWith |
| `src/services/alertEngine/ruleOriginLedger.ts` | version, entry, e, ledger, value, ... |
| `src/services/apiService_fundingRate.test.ts` | text, text, text, text, text |
| `src/services/apiService_infinity.test.ts` | text |
| `src/services/apiService_rateLimit.test.ts` | fetchMock.text, fetchMock.json, fetchMock.text, fetchMock.json |
| `src/services/app.test.ts` | json, json, json |
| `src/services/app.ts` | s, app.deletePreset, app.savePreset, app.getInputsAsObject, name, ... |
| `src/services/bitgetWs.ts` | ws, payload, sendUnsubscribe, symbol, channel |
| `src/services/calculationStrategy.test.ts` | makeStrategy, caps |
| `src/services/exchange/adapterConformance.harness.ts` | bitgetHarness.simulateLogin, inject |
| `src/services/exchange/bitgetAdapter.ts` | account.fetchFundingRateHistory |
| `src/services/marketWatcher/syntheticHistory.test.ts` | body, jsonResponse, text, text, installFakeExchange |
| `src/services/newsService_limit.test.ts` | mockResponse.text, mockResponse.text |
| `src/services/newsService_sentiment.test.ts` | text, text |
| `src/services/orderPlacementService.test.ts` | effectOf |
| `src/services/paperTrading_modeSwitchRace.test.ts` | body, respond, hold, text, resolve, ... |
| `src/services/paperTrading_seam.test.ts` | text |
| `src/services/paperTrading_tracking.test.ts` | text |
| `src/services/serializationService.ts` | chunks, chunkSize, total, content, T, ... |
| `src/services/syncService.parallel.test.ts` | lastJournalWrite, calls |
| `src/services/tradeService_accountSettings.test.ts` | text, calls, text |
| `src/services/tradeService_flashClose.test.ts` | text, text, text |
| `src/services/tradeService_hardening.test.ts` | text, text, text |
| `src/services/tradeService_hedgeClose.test.ts` | fetchSpy.text, call, lastBody, calls |
| `src/services/tradeService_race.test.ts` | text |
| `src/services/tradeService_requestFields.test.ts` | call, fetchSpy.text, lastBody |
| `src/services/tradeService_serialization.test.ts` | fetchSpy.text |
| `src/services/tradeService_tpslModify.test.ts` | spy, spyRequest, body, sentParams |
| `src/services/tradeService_tpslPlacement.test.ts` | body, sentParams, spyRequest, spy |
| `src/stores/ai.svelte.ts` | e, stored, constructor, parsed, load |
| `src/stores/alertPanel.svelte.ts` | blankDraft, e, symbol, validateDraft, accepted |
| `src/stores/alerts.svelte.ts` | e, covered, replayed, resyncCoverage, t, ... |
| `src/stores/alerts_engineWiring.test.ts` | env, seedCoveredRule, closes, armMidSessionThenReceiveHistory, alertJson, ... |
| `src/stores/alerts_firingSink.test.ts` | overrides, ruleDoc, run, _.subscribe |
| `src/stores/journal.svelte.ts` | autoCalculateMissingAtr, parsedData, count, current, sliced, ... |
| `src/stores/modal.test.ts` | browser |
| `src/stores/notes.svelte.ts` | constructor, clearNotes, load, NotesManager, e, ... |
| `src/stores/settings.credentialStore.test.ts` | storedPayload |
| `src/tests/flash-close.confirmation.test.ts` | text |
| `src/tests/flash-close.test.ts` | text, text |
| `src/tests/security/credential_transport.test.ts` | text, text, text |
| `src/tests/tradeService_race.test.ts` | text |
| `src/types/apiSchemas.money.test.ts` | mustParse, result, T |
| `src/utils/markdownUtils.ts` | raw, renderTrustedMarkdown, cleaned, text, e, ... |
| `src/utils/storageHelper.ts` | e, cacheKeys, retryError, size, safeSave, ... |
| `src/utils/storageUtils.ts` | oldValue, key, storedCache, keys, key, ... |
| `src/utils/storageWrapper.ts` | SafeLocalStorage, key, key, options, e, ... |
| `tests/unit/verify_tpsl_validation.test.ts` | text, request.text, request.text, request.text, request.text, ... |

## Connected Communities

- **services +42 dirs** (12 cross-edges)
- **services +6 dirs · dispatchMessage** (12 cross-edges)
- **services +14 dirs** (11 cross-edges)
- **services/alertEngine · push** (7 cross-edges)
- **services/alertEngine +4 dirs** (6 cross-edges)
- **services +10 dirs · slice** (5 cross-edges)
- **services +5 dirs · ensureHistory** (5 cross-edges)
- **stores +3 dirs** (5 cross-edges)
- **utils +15 dirs** (5 cross-edges)
- **server/venues +22 dirs** (4 cross-edges)
- **services · checkOpfsSnapshotOnStartup** (3 cross-edges)
- **services/alertEngine +1 dirs · readCoveredAlertIds** (3 cross-edges)
- **services/alertEngine +1 dirs · refresh** (3 cross-edges)
- **services +6 dirs · processNext** (3 cross-edges)
- **benchmarks +13 dirs** (2 cross-edges)
- **services +4 dirs · parseDecimal** (1 cross-edges)
- **alerts/tabs +4 dirs** (1 cross-edges)
- **rules +3 dirs** (1 cross-edges)
- **services/alertEngine · reconcileOrphanedRules** (1 cross-edges)
- **services/alertEngine +1 dirs · ensureLoaded** (1 cross-edges)
- **calculators +12 dirs** (1 cross-edges)
- **alerts/tabs +2 dirs · AlertsManager** (1 cross-edges)
- **services/alertEngine · RuleEvaluationLoop** (1 cross-edges)
- **services +3 dirs · calculate** (1 cross-edges)
- **utils +10 dirs** (1 cross-edges)
- **. +2 dirs · repeat** (1 cross-edges)
- **services/alertEngine +1 dirs · firingMessage** (1 cross-edges)
- **components/shared +2 dirs · handleScreenshotUpload** (1 cross-edges)
- **scripts +6 dirs** (1 cross-edges)
- **services +2 dirs · syncService.syncBitunixPositions** (1 cross-edges)
- **services +1 dirs · show** (1 cross-edges)
- **services +6 dirs · BitunixWebSocketService** (1 cross-edges)
- **services +4 dirs · queueSubscription** (1 cross-edges)
- **services +10 dirs · appFetch** (1 cross-edges)
- **services +2 dirs · restoreFromBackup** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-447")
explore(operation:"context", task:"understand services +30 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
