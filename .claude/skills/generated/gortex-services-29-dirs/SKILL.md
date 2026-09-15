---
name: gortex-services-29-dirs
description: "Work in the services +29 dirs area — 584 symbols across 92 files (75% cohesion)"
---

# services +29 dirs

584 symbols | 92 files | 75% cohesion

## When to Use

Use this skill when working on files in:
- ``
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
- `src/services/alertEngine/cutoverNotice.test.ts`
- `src/services/alertEngine/legacyReplayCoordinator.ts`
- `src/services/alertEngine/migrateAlertsToRules.test.ts`
- `src/services/alertEngine/migrateAlertsToRules.ts`
- `src/services/alertEngine/reconcileOrphanedRules.ts`
- `src/services/alertEngine/ruleCoverage.ts`
- `src/services/alertEngine/ruleEvaluation.integration.test.ts`
- `src/services/alertEngine/ruleLifecycleView.test.ts`
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
| `` | error, stringify, parse |
| `evals/hook-guard.eval.test.ts` | payload, runGuard, result |
| `external-call::stdlib:dompurify` | dompurify |
| `src/components/inputs/PortfolioInputs.component.test.ts` | safeJsonParse, text |
| `src/components/settings/tabs/SystemTab.svelte` | clearAppCache |
| `src/lib/academy/usePatternFavorites.svelte.ts` | next, id, toggle |
| `src/lib/alerts/indicatorCatalogue.test.ts` | e, e, document, lookback, valid, ... |
| `src/lib/alerts/patternCatalogue.test.ts` | patternDoc, pattern, timeframe |
| `src/lib/chartSetup.ts` | err, initZoomPlugin, plugin |
| `src/lib/rules/ruleEvaluationGate.ts` | ctx, lastAnchorMs, anchorMs, closedCandles, verdict, ... |
| `src/lib/rules/ruleSchema.test.ts` | rule_warmup_candles, rule_from_alert_json, rule_evaluate, json, rule_timeframes, ... |
| `src/lib/rules/ruleSchema.ts` | core, document, timeframe, loader, core, ... |
| `src/lib/rules/types.ts` | Verdict |
| `src/lib/utils/sanitizer.ts` | dirty, sanitizeHtml |
| `src/lib/windows/implementations/MarkdownView.svelte` | MarkdownView |
| `src/routes/api/account-settings/account_settings.test.ts` | text, url, init, sentRequest, text |
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
| `src/routes/api/orders/orders_place_order_ordertype.test.ts` | sentBody, text, options, text |
| `src/routes/api/positions/positions_positionId.test.ts` | text |
| `src/routes/api/sentiment/sentiment.test.ts` | response.text |
| `src/routes/api/stream-logs/+server.ts` | stream.cancel, stream.start, initMsg, controller, cleanup |
| `src/routes/api/sync/positions-history/positions_history_security.test.ts` | text |
| `src/routes/api/tickers/tickers.test.ts` | text, text, text, text |
| `src/routes/api/tpsl/tpsl_paths.test.ts` | text |
| `src/services/alertEngine/alertEngine.test.ts` | free, alertJson, HoldingWasm, alerts, failNextSet, ... |
| `src/services/alertEngine/alertEngine.ts` | WasmAlertEngineInstance |
| `src/services/alertEngine/armRule.test.ts` | stored |
| `src/services/alertEngine/cutoverNotice.test.ts` | withCoveredAlert |
| `src/services/alertEngine/legacyReplayCoordinator.ts` | next, configureLegacyReplay |
| `src/services/alertEngine/migrateAlertsToRules.test.ts` | readLedger, threshold, createdAtMs, conditionKey, raw, ... |
| `src/services/alertEngine/migrateAlertsToRules.ts` | key, entry, claimedIds, recordMigratedIds, merged, ... |
| `src/services/alertEngine/reconcileOrphanedRules.ts` | raw, nothing, result, reconcileStoredRules, parsed, ... |
| `src/services/alertEngine/ruleCoverage.ts` | changed, parsed, updated, parsed, e, ... |
| `src/services/alertEngine/ruleEvaluation.integration.test.ts` | timeframe, loop.readRules, loop.readRules, threshold, alert, ... |
| `src/services/alertEngine/ruleLifecycleView.test.ts` | seed, origins, entries, rules |
| `src/services/alertEngine/ruleLoopWiring.ts` | readStoredRules, raw, e, parsed |
| `src/services/alertEngine/ruleOriginLedger.test.ts` | ledgerWith, raw, storedLedger, entries |
| `src/services/alertEngine/ruleOriginLedger.ts` | ledger, RuleOriginEntry, raw, version, entries, ... |
| `src/services/apiService_fundingRate.test.ts` | text, text, text, text, text |
| `src/services/apiService_infinity.test.ts` | text |
| `src/services/apiService_rateLimit.test.ts` | fetchMock.text, fetchMock.json, fetchMock.text, fetchMock.json |
| `src/services/app.test.ts` | json, json, json |
| `src/services/app.ts` | name, app.getInputsAsObject, app.deletePreset, app.populatePresetLoader, s, ... |
| `src/services/bitgetWs.ts` | symbol, sendUnsubscribe, channel, ws, payload |
| `src/services/calculationStrategy.test.ts` | makeStrategy, caps |
| `src/services/exchange/adapterConformance.harness.ts` | bitgetHarness.simulateLogin, inject |
| `src/services/exchange/bitgetAdapter.ts` | account.fetchFundingRateHistory |
| `src/services/marketWatcher/syntheticHistory.test.ts` | text, text, installFakeExchange, body, jsonResponse |
| `src/services/newsService_limit.test.ts` | mockResponse.text, mockResponse.text |
| `src/services/newsService_sentiment.test.ts` | text, text |
| `src/services/orderPlacementService.test.ts` | effectOf |
| `src/services/paperTrading_modeSwitchRace.test.ts` | hold, resolve, respond, body, body, ... |
| `src/services/paperTrading_seam.test.ts` | text |
| `src/services/paperTrading_tracking.test.ts` | text |
| `src/services/serializationService.ts` | serializationService.stringifyAsync, total, content, chunks, chunk, ... |
| `src/services/syncService.parallel.test.ts` | lastJournalWrite, calls |
| `src/services/tradeService_accountSettings.test.ts` | text, calls, text |
| `src/services/tradeService_flashClose.test.ts` | text, text, text |
| `src/services/tradeService_hardening.test.ts` | text, text, text |
| `src/services/tradeService_hedgeClose.test.ts` | calls, fetchSpy.text, lastBody, call |
| `src/services/tradeService_race.test.ts` | text |
| `src/services/tradeService_requestFields.test.ts` | fetchSpy.text, lastBody, call |
| `src/services/tradeService_serialization.test.ts` | fetchSpy.text |
| `src/services/tradeService_tpslModify.test.ts` | sentParams, body, spyRequest, spy |
| `src/services/tradeService_tpslPlacement.test.ts` | spyRequest, body, spy, sentParams |
| `src/stores/ai.svelte.ts` | load, stored, e, constructor, parsed |
| `src/stores/alerts.svelte.ts` | AlertEngineMode, ledgerSink, startRuleEvaluationLoop, readClosedCandles, t, ... |
| `src/stores/alerts_engineWiring.test.ts` | alerts, mod, armMidSessionThenReceiveHistory, free, lastPrices, ... |
| `src/stores/alerts_firingSink.test.ts` | _.subscribe, run |
| `src/stores/journal.svelte.ts` | current, sliced, saveSync, data, e, ... |
| `src/stores/modal.test.ts` | browser |
| `src/stores/notes.svelte.ts` | messages, addNote, clearNotes, e, load, ... |
| `src/stores/settings.credentialStore.test.ts` | storedPayload |
| `src/tests/flash-close.confirmation.test.ts` | text |
| `src/tests/flash-close.test.ts` | text, text |
| `src/tests/security/credential_transport.test.ts` | text, text, text |
| `src/tests/tradeService_race.test.ts` | text |
| `src/types/apiSchemas.money.test.ts` | T, mustParse, result |
| `src/utils/markdownUtils.ts` | text, renderSafeMarkdown, raw, cleaned, e, ... |
| `src/utils/storageHelper.ts` | e, key, freedSpace, onQuotaExceeded, value, ... |
| `src/utils/storageUtils.ts` | key, oldValue, storedCache, value, parsed, ... |
| `src/utils/storageWrapper.ts` | e, value, setItem, getEstimatedAvailableSpace, key, ... |
| `tests/unit/verify_tpsl_validation.test.ts` | text, request.text, text, request.text, request.text, ... |

## Connected Communities

- **services +46 dirs** (12 cross-edges)
- **services +6 dirs · dispatchMessage** (10 cross-edges)
- **services +15 dirs** (10 cross-edges)
- **services/alertEngine · push** (6 cross-edges)
- **services +6 dirs · ensureHistory** (5 cross-edges)
- **services/alertEngine +4 dirs** (5 cross-edges)
- **stores +3 dirs · MarketManager** (5 cross-edges)
- **server/venues +16 dirs** (4 cross-edges)
- **services +10 dirs · slice** (4 cross-edges)
- **services/alertEngine +1 dirs · readCoveredAlertIds** (3 cross-edges)
- **services +6 dirs · processNext** (3 cross-edges)
- **utils +15 dirs** (3 cross-edges)
- **benchmarks +11 dirs** (2 cross-edges)
- **services/alertEngine +1 dirs · refresh** (2 cross-edges)
- **services · checkOpfsSnapshotOnStartup** (2 cross-edges)
- **services/alertEngine +1 dirs · firingMessage** (1 cross-edges)
- **services/alertEngine · observeCandles** (1 cross-edges)
- **alerts/tabs +2 dirs · AlertsManager** (1 cross-edges)
- **services +2 dirs · restoreFromBackup** (1 cross-edges)
- **services +6 dirs · BitunixWebSocketService** (1 cross-edges)
- **services +4 dirs · parseDecimal** (1 cross-edges)
- **utils +10 dirs** (1 cross-edges)
- **services +10 dirs · appFetch** (1 cross-edges)
- **services/alertEngine +1 dirs · ensureLoaded** (1 cross-edges)
- **services +2 dirs · syncService.syncBitunixPositions** (1 cross-edges)
- **scripts +6 dirs** (1 cross-edges)
- **components/shared +2 dirs · handleScreenshotUpload** (1 cross-edges)
- **backgrounds/engines +11 dirs** (1 cross-edges)
- **services +1 dirs · show** (1 cross-edges)
- **. +2 dirs · repeat** (1 cross-edges)
- **services/alertEngine · reconcileOrphanedRules** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-439")
explore(operation:"context", task:"understand services +29 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
