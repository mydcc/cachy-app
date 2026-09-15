---
name: gortex-services-42-dirs
description: "Work in the services +42 dirs area — 856 symbols across 96 files (72% cohesion)"
---

# services +42 dirs

856 symbols | 96 files | 72% cohesion

## When to Use

Use this skill when working on files in:
- ``
- `scripts/lib/backlog-flip.ts`
- `scripts/lib/issue-sync-payload.ts`
- `scripts/sync-github-issues.ts`
- `src/components/alerts/tabs/ManageTab.component.test.ts`
- `src/components/settings/tabs/ConnectionsTab.svelte`
- `src/components/shared/OfflineBanner.component.test.ts`
- `src/components/shared/PositionsSidebar.dedup.component.test.ts`
- `src/components/shared/PositionsSidebar.svelte`
- `src/components/shared/TimeframeSelector.component.test.ts`
- `src/config/rssPresets.ts`
- `src/lib/actions/tooltip.ts`
- `src/lib/ai/directRequest.ts`
- `src/lib/alerts/indicatorFormLeaf.ts`
- `src/lib/notificationPolicy.ts`
- `src/lib/physics/StressLogic.ts`
- `src/lib/server/aiEndpoint.ts`
- `src/lib/server/clientToken.ts`
- `src/lib/server/logger.ts`
- `src/lib/server/ollamaBaseUrl.ts`
- `src/lib/server/rateLimit.ts`
- `src/lib/server/urlValidator.test.ts`
- `src/lib/server/urlValidator.ts`
- `src/lib/staleDeploymentRecovery.ts`
- `src/lib/themeBackgrounds.ts`
- `src/lib/windows/implementations/IframeWindow.svelte.ts`
- `src/locales/i18n.ts`
- `src/params/lang.ts`
- `src/routes/api/ai/anthropic/+server.ts`
- `src/routes/api/ai/anthropic/models/+server.ts`
- `src/routes/api/ai/gemini/models/+server.ts`
- `src/routes/api/ai/ollama/+server.ts`
- `src/routes/api/ai/ollama/models/+server.ts`
- `src/routes/api/ai/ollama/models/ollama_models.test.ts`
- `src/routes/api/ai/ollama/models/server.test.ts`
- `src/routes/api/ai/ollama/ollama.test.ts`
- `src/routes/api/ai/openai-responses/+server.ts`
- `src/routes/api/ai/openai-responses/server.test.ts`
- `src/routes/api/ai/openai/+server.ts`
- `src/routes/api/ai/openai/models/+server.ts`
- `src/routes/api/ai/openai/server.test.ts`
- `src/routes/api/ai/openrouter/+server.ts`
- `src/routes/api/ai/openrouter/models/+server.ts`
- `src/routes/api/external/article-content/+server.ts`
- `src/routes/api/external/article-content/article_content.test.ts`
- `src/routes/api/external/check-frame-support/+server.ts`
- `src/routes/api/external/cmc/+server.ts`
- `src/routes/api/external/cmc/cmc_auth.test.ts`
- `src/routes/api/rss-fetch/+server.ts`
- `src/service-worker.ts`
- `src/services/alertEngine/indicatorWarmup.ts`
- `src/services/alertEngine/legacyReplayCoordinator.ts`
- `src/services/apiQuotaTracker.svelte.ts`
- `src/services/apiService.ts`
- `src/services/app.ts`
- `src/services/backupService.ts`
- `src/services/bitgetWs.ts`
- `src/services/bitunixWs.ts`
- `src/services/capabilityDetection.ts`
- `src/services/cloudService.rateLimit.test.ts`
- `src/services/csvService.ts`
- `src/services/dataRepairService.ts`
- `src/services/dbService.ts`
- `src/services/exchange/bitgetAdapter.ts`
- `src/services/exchange/bitunixAdapter.ts`
- `src/services/frameSupportService.ts`
- `src/services/hotkeyService.ts`
- `src/services/markdownLoader.ts`
- `src/services/marketWatcher.ts`
- `src/services/marketWatcher/subscriptionRegistry.ts`
- `src/services/marketWatcher_resync.test.ts`
- `src/services/rmsService_riskLimits.test.ts`
- `src/services/syncService.parallel.test.ts`
- `src/services/wasmCalculator.ts`
- `src/stores/ai.svelte.ts`
- `src/stores/chat.svelte.ts`
- `src/stores/quiz.svelte.ts`
- `src/stores/quiz.test.ts`
- `src/stores/tpsl.svelte.ts`
- `src/stores/trade.svelte.ts`
- `src/stores/ui.svelte.ts`
- `src/tests/architecture/order_gate_bypass.test.ts`
- `src/tests/flash-close.confirmation.test.ts`
- `src/types/ai.ts`
- `src/types/bitgetValidation.ts`
- `src/utils/colors.ts`
- `src/utils/errorUtils.ts`
- `src/utils/heatmapUtils.ts`
- `src/utils/redact.ts`
- `src/utils/server/venues/bitunix.ts`
- `src/utils/symbolUtils.ts`
- `src/utils/technicalsPresenter.ts`
- `src/utils/utils.ts`
- `tests/benchmarks/safeJson.bench.ts`
- `tests/gpu/webGpuParity.spec.ts`
- `vite.config.ts`

## Key Files

| File | Symbols |
|------|---------|
| `` | startsWith, catch, replace, any, endsWith, ... |
| `scripts/lib/backlog-flip.ts` | findItemFile, itemId, hit, repoFiles |
| `scripts/lib/issue-sync-payload.ts` | raw, invalid, assignableLogins, sanitizeAssignees, assignable, ... |
| `scripts/sync-github-issues.ts` | hasOpenPR, mapStatusToOptionName, status |
| `src/components/alerts/tabs/ManageTab.component.test.ts` | current, options, part, _.subscribe, key, ... |
| `src/components/settings/tabs/ConnectionsTab.svelte` | data, createAccessToken, res |
| `src/components/shared/OfflineBanner.component.test.ts` | fn, v, options, getNestedTranslation, current, ... |
| `src/components/shared/PositionsSidebar.dedup.component.test.ts` | json, json, routeFetchDeferred |
| `src/components/shared/PositionsSidebar.svelte` | live, resolveMarkPrice, lastPrice, symbolData, p |
| `src/components/shared/TimeframeSelector.component.test.ts` | input, normalizeTimeframeInput |
| `src/config/rssPresets.ts` | getRSSUrlsByIds, ids, p, urls |
| `src/lib/actions/tooltip.ts` | updatePosition |
| `src/lib/ai/directRequest.ts` | hostname, resolveDirectUrl, rel, trimmed, baseUrl, ... |
| `src/lib/alerts/indicatorFormLeaf.ts` | ref, params, canonicalRef |
| `src/lib/notificationPolicy.ts` | value, isNotificationCategory |
| `src/lib/physics/StressLogic.ts` | ammoInstance.locateFile, path |
| `src/lib/server/aiEndpoint.ts` | customBaseUrl, trimmed, resolveProviderEndpoint, qs, baseWithoutQuery, ... |
| `src/lib/server/clientToken.ts` | rateLimited, checkClientToken, unauthorized, rawToken, clientAddress, ... |
| `src/lib/server/logger.ts` | key, sanitizeString, s, isSensitiveKey, lowerKey, ... |
| `src/lib/server/ollamaBaseUrl.ts` | resolveBaseUrl, parsed, candidate, raw |
| `src/lib/server/rateLimit.ts` | consume, now, key, entry |
| `src/lib/server/urlValidator.test.ts` | lookup, resolved, getSafeDispatcher, DispatcherLookup, lookupWith |
| `src/lib/server/urlValidator.ts` | isUrlAllowedAsync, isUrlAllowed, allowed, dispatcher, url, ... |
| `src/lib/staleDeploymentRecovery.ts` | normalized, scheduleStaleReload, isStaleChunkError, error, message, ... |
| `src/lib/themeBackgrounds.ts` | themeName, isLightTheme |
| `src/lib/windows/implementations/IframeWindow.svelte.ts` | constructor, url, title, options |
| `src/locales/i18n.ts` | syncDocumentLang, value |
| `src/params/lang.ts` | param, match |
| `src/routes/api/ai/anthropic/+server.ts` | headers, parseResult, model, err, parsed, ... |
| `src/routes/api/ai/anthropic/models/+server.ts` | AnthropicModel, apiKey, data, authError, models, ... |
| `src/routes/api/ai/gemini/models/+server.ts` | GeminiModel, targetUrl, GET, baseUrl, response, ... |
| `src/routes/api/ai/ollama/+server.ts` | rawBody, apiKey, POST, response, e, ... |
| `src/routes/api/ai/ollama/models/+server.ts` | response, rawBaseUrl, authError, GET, e, ... |
| `src/routes/api/ai/ollama/models/ollama_models.test.ts` | getClientAddress |
| `src/routes/api/ai/ollama/models/server.test.ts` | baseUrl, get, qs, request, url |
| `src/routes/api/ai/ollama/ollama.test.ts` | getClientAddress |
| `src/routes/api/ai/openai-responses/+server.ts` | parseResult, POST, apiKey, err, tools, ... |
| `src/routes/api/ai/openai-responses/server.test.ts` | getClientAddress |
| `src/routes/api/ai/openai/+server.ts` | baseUrl, headers, rawBody, targetUrl, e, ... |
| `src/routes/api/ai/openai/models/+server.ts` | apiKey, data, isVendorCatalog, models, targetUrl, ... |
| `src/routes/api/ai/openai/server.test.ts` | getClientAddress |
| `src/routes/api/ai/openrouter/+server.ts` | targetUrl, POST, headers, authError, response, ... |
| `src/routes/api/ai/openrouter/models/+server.ts` | baseUrl, GET, response, err, headers, ... |
| `src/routes/api/external/article-content/+server.ts` | message, html, candidates, extractArticleContent, bestTarget, ... |
| `src/routes/api/external/article-content/article_content.test.ts` | getClientAddress, text |
| `src/routes/api/external/check-frame-support/+server.ts` | controller, csp, authError, hostname, xfo, ... |
| `src/routes/api/external/cmc/+server.ts` | endpoint, response, errorBody, queryParams, ALLOWED_ENDPOINTS, ... |
| `src/routes/api/external/cmc/cmc_auth.test.ts` | getClientAddress |
| `src/routes/api/rss-fetch/+server.ts` | controller, POST, timeout, id, uas, ... |
| `src/service-worker.ts` | cache, response, err, response, respond, ... |
| `src/services/alertEngine/indicatorWarmup.ts` | sortedParams, params |
| `src/services/alertEngine/legacyReplayCoordinator.ts` | Attempt, symbol, attempt, report |
| `src/services/apiQuotaTracker.svelte.ts` | recordError, errorMsg, provider, entry |
| `src/services/apiService.ts` | provider, key, limit, startFetch, symbol, ... |
| `src/services/app.ts` | suggestions, input, app.updateSymbolSuggestions |
| `src/services/backupService.ts` | value, isSafeHostOrUrl, trimmed, url, lower |
| `src/services/bitgetWs.ts` | symbol, subKey, normalizedSymbol, symbol, symbol, ... |
| `src/services/bitunixWs.ts` | resolved, args, symbol, channel, symbol, ... |
| `src/services/capabilityDetection.ts` | mobileKeywords, userAgent, isMobileDevice |
| `src/services/cloudService.rateLimit.test.ts` | sender, senderActivity.find |
| `src/services/csvService.ts` | val, csvService.cleanCSVValue |
| `src/services/dataRepairService.ts` | total, dataRepairService.scanForInvalidSymbols, onProgress, symbol, targets, ... |
| `src/services/dbService.ts` | key, get, storeName, db, T |
| `src/services/exchange/bitgetAdapter.ts` | marketData.normalizeSymbol, symbol, requirement, marketData.channelsForRequirement |
| `src/services/exchange/bitunixAdapter.ts` | marketData.normalizeSymbol, marketData.subscribeTrades, symbol, symbol, onTrade, ... |
| `src/services/frameSupportService.ts` | isDomainFrameSupported, loadCache, supported, parsed, obj, ... |
| `src/services/hotkeyService.ts` | nextIndex, cycleTakeProfitFocus, count, HOTKEY_ACTIONS.action, currentIndex, ... |
| `src/services/markdownLoader.ts` | slugify, renderer.heading, text, id |
| `src/services/marketWatcher.ts` | refreshActiveHistory |
| `src/services/marketWatcher/subscriptionRegistry.ts` | requirement, normSymbol, register, channels, channel, ... |
| `src/services/marketWatcher_resync.test.ts` | requirement, marketData.channelsForRequirement |
| `src/services/rmsService_riskLimits.test.ts` | journalState.entries |
| `src/services/syncService.parallel.test.ts` | run, _.subscribe |
| `src/services/wasmCalculator.ts` | lower, key, pre, middle, convertResult, ... |
| `src/stores/ai.svelte.ts` | executeAction, e, idx, mult, confirmNeeded, ... |
| `src/stores/chat.svelte.ts` | unsubscribe, destroy |
| `src/stores/quiz.svelte.ts` | text, loadQuestions, regex, e, lines, ... |
| `src/stores/quiz.test.ts` | text |
| `src/stores/tpsl.svelte.ts` | planTypeOf, order, raw |
| `src/stores/trade.svelte.ts` | normalized, setSymbol, symbol, provider |
| `src/stores/ui.svelte.ts` | themeName, setTheme, bgColor, html, applyThemeToDom, ... |
| `src/tests/architecture/order_gate_bypass.test.ts` | findBypasses, window, file, found, i, ... |
| `src/tests/flash-close.confirmation.test.ts` | orderCalls, cancelCalls |
| `src/types/ai.ts` | AiModelInfo |
| `src/types/bitgetValidation.ts` | AllowedBitgetChannel, ch, isAllowedBitgetChannel |
| `src/utils/colors.ts` | hexToRgba, alpha, c, hex, n |
| `src/utils/errorUtils.ts` | msg, code, error, lowerMsg, codeStr, ... |
| `src/utils/heatmapUtils.ts` | symbol, getCoinankHeatmapSymbol |
| `src/utils/redact.ts` | input, out, redactString |
| `src/utils/server/venues/bitunix.ts` | data, body, bitunixIsSymbolNotFoundBody |
| `src/utils/symbolUtils.ts` | normalizeSymbol, formatSymbolForDisplay, symbol, provider, s, ... |
| `src/utils/technicalsPresenter.ts` | getActionColor, action, a |
| `src/utils/utils.ts` | suffix, input, normalizeTimeframeInput, match, d, ... |
| `tests/benchmarks/safeJson.bench.ts` | protectedJson, safeJsonParseLegacy, jsonString |
| `tests/gpu/webGpuParity.spec.ts` | b, rawText.setup |
| `vite.config.ts` | output.manualChunks, id |

## Connected Communities

- **utils +15 dirs** (33 cross-edges)
- **services +14 dirs** (25 cross-edges)
- **components/shared +13 dirs** (25 cross-edges)
- **services +10 dirs · slice** (21 cross-edges)
- **services +30 dirs** (16 cross-edges)
- **services +5 dirs · calculateIndicatorsFromArrays** (13 cross-edges)
- **services +2 dirs · set** (12 cross-edges)
- **services +6 dirs · processNext** (10 cross-edges)
- **services +5 dirs · ensureHistory** (9 cross-edges)
- **utils +10 dirs** (8 cross-edges)
- **services +6 dirs · BitunixWebSocketService** (8 cross-edges)
- **server/venues +22 dirs** (7 cross-edges)
- **services +3 dirs · delete** (6 cross-edges)
- **rules +10 dirs** (5 cross-edges)
- **components/shared +6 dirs · querySelectorAll** (4 cross-edges)
- **services +10 dirs · appFetch** (4 cross-edges)
- **scripts +6 dirs** (4 cross-edges)
- **services +2 dirs · newsService.fetchNews** (4 cross-edges)
- **services +5 dirs · encrypt** (4 cross-edges)
- **services +5 dirs · safeDecimal** (3 cross-edges)
- **stores +2 dirs · ResultsManager** (3 cross-edges)
- **services · RateLimiter** (2 cross-edges)
- **services +6 dirs · dispatchMessage** (2 cross-edges)
- **. +9 dirs** (2 cross-edges)
- **services · connect** (1 cross-edges)
- **services · checkOpfsSnapshotOnStartup** (1 cross-edges)
- **services +2 dirs · restoreFromBackup** (1 cross-edges)
- **services · getAll** (1 cross-edges)
- **services +1 dirs · calculate** (1 cross-edges)
- **components/shared +11 dirs** (1 cross-edges)
- **benchmarks +11 dirs** (1 cross-edges)
- **server · evictExpired** (1 cross-edges)
- **server · sanitize** (1 cross-edges)
- **services · resetIfNeeded** (1 cross-edges)
- **services +3 dirs · handleHeatmapClick** (1 cross-edges)
- **stores +3 dirs** (1 cross-edges)
- **auth/token +2 dirs** (1 cross-edges)
- **. +2 dirs · GET** (1 cross-edges)
- **services · MarketWatcher** (1 cross-edges)
- **services · manualReset** (1 cross-edges)
- **src/lib +1 dirs · updateThemeColor** (1 cross-edges)
- **calculators +12 dirs** (1 cross-edges)
- **rules +3 dirs** (1 cross-edges)
- **services +4 dirs · toNumFast** (1 cross-edges)
- **stores +1 dirs · find** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-641")
explore(operation:"context", task:"understand services +42 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
