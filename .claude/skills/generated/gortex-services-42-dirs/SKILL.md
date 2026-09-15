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
| `` | localeCompare, entries, endsWith, any, toLowerCase, ... |
| `scripts/lib/backlog-flip.ts` | hit, findItemFile, itemId, repoFiles |
| `scripts/lib/issue-sync-payload.ts` | assignable, raw, AssigneeSanitization, assignableLogins, invalid, ... |
| `scripts/sync-github-issues.ts` | hasOpenPR, status, mapStatusToOptionName |
| `src/components/alerts/tabs/ManageTab.component.test.ts` | path, key, current, translate, _.subscribe, ... |
| `src/components/settings/tabs/ConnectionsTab.svelte` | res, data, createAccessToken |
| `src/components/shared/OfflineBanner.component.test.ts` | options, current, k, translate, v, ... |
| `src/components/shared/PositionsSidebar.dedup.component.test.ts` | routeFetchDeferred, json, json |
| `src/components/shared/PositionsSidebar.svelte` | lastPrice, live, p, symbolData, resolveMarkPrice |
| `src/components/shared/TimeframeSelector.component.test.ts` | input, normalizeTimeframeInput |
| `src/config/rssPresets.ts` | ids, getRSSUrlsByIds, p, urls |
| `src/lib/actions/tooltip.ts` | updatePosition |
| `src/lib/ai/directRequest.ts` | relativePath, trimmed, hostname, baseUrl, isLoopback, ... |
| `src/lib/alerts/indicatorFormLeaf.ts` | params, ref, canonicalRef |
| `src/lib/notificationPolicy.ts` | isNotificationCategory, value |
| `src/lib/physics/StressLogic.ts` | path, ammoInstance.locateFile |
| `src/lib/server/aiEndpoint.ts` | extraParams, relativePath, trimmed, subPath, customBaseUrl, ... |
| `src/lib/server/clientToken.ts` | clientAddress, hash, record, request, unauthorized, ... |
| `src/lib/server/logger.ts` | key, lowerKey, eqRegex, sanitizeString, str, ... |
| `src/lib/server/ollamaBaseUrl.ts` | resolveBaseUrl, candidate, parsed, raw |
| `src/lib/server/rateLimit.ts` | now, consume, entry, key |
| `src/lib/server/urlValidator.test.ts` | lookupWith, DispatcherLookup, lookup, getSafeDispatcher, resolved |
| `src/lib/server/urlValidator.ts` | Agent, isUrlAllowed, match, dottedParts, u, ... |
| `src/lib/staleDeploymentRecovery.ts` | scheduleStaleReload, normalized, message, error, isStaleChunkError, ... |
| `src/lib/themeBackgrounds.ts` | themeName, isLightTheme |
| `src/lib/windows/implementations/IframeWindow.svelte.ts` | options, title, constructor, url |
| `src/locales/i18n.ts` | syncDocumentLang, value |
| `src/params/lang.ts` | param, match |
| `src/routes/api/ai/anthropic/+server.ts` | AnthropicMessageParam, tools, model, targetUrl, parseResult, ... |
| `src/routes/api/ai/anthropic/models/+server.ts` | e, baseUrl, data, AnthropicModel, headers, ... |
| `src/routes/api/ai/gemini/models/+server.ts` | err, targetUrl, baseUrl, response, headers, ... |
| `src/routes/api/ai/ollama/+server.ts` | rawBaseUrl, baseUrl, POST, hint, response, ... |
| `src/routes/api/ai/ollama/models/+server.ts` | response, rawBaseUrl, data, e, OllamaModel, ... |
| `src/routes/api/ai/ollama/models/ollama_models.test.ts` | getClientAddress |
| `src/routes/api/ai/ollama/models/server.test.ts` | baseUrl, url, request, get, qs |
| `src/routes/api/ai/ollama/ollama.test.ts` | getClientAddress |
| `src/routes/api/ai/openai-responses/+server.ts` | rawBody, e, parseResult, err, authError, ... |
| `src/routes/api/ai/openai-responses/server.test.ts` | getClientAddress |
| `src/routes/api/ai/openai/+server.ts` | rawBody, isOpenRouterTarget, messages, authError, e, ... |
| `src/routes/api/ai/openai/models/+server.ts` | apiKey, err, baseUrl, withScheme, e, ... |
| `src/routes/api/ai/openai/server.test.ts` | getClientAddress |
| `src/routes/api/ai/openrouter/+server.ts` | messages, parseResult, POST, model, targetUrl, ... |
| `src/routes/api/ai/openrouter/models/+server.ts` | authError, targetUrl, models, OpenRouterModel, data, ... |
| `src/routes/api/external/article-content/+server.ts` | url, bestTarget, targetUrl, doc, response, ... |
| `src/routes/api/external/article-content/article_content.test.ts` | getClientAddress, text |
| `src/routes/api/external/check-frame-support/+server.ts` | authError, GET, controller, timeoutId, response, ... |
| `src/routes/api/external/cmc/+server.ts` | GET, response, cmcApiKey, ALLOWED_ENDPOINTS, queryParams, ... |
| `src/routes/api/external/cmc/cmc_auth.test.ts` | getClientAddress |
| `src/routes/api/rss-fetch/+server.ts` | lower, response, result, url, timeout, ... |
| `src/service-worker.ts` | isCacheable, response, cache, response, response, ... |
| `src/services/alertEngine/indicatorWarmup.ts` | sortedParams, params |
| `src/services/alertEngine/legacyReplayCoordinator.ts` | attempt, report, symbol, Attempt |
| `src/services/apiQuotaTracker.svelte.ts` | errorMsg, entry, provider, recordError |
| `src/services/apiService.ts` | waitForToken, symbol, executeWithRetry, symbol, attempt, ... |
| `src/services/app.ts` | suggestions, app.updateSymbolSuggestions, input |
| `src/services/backupService.ts` | lower, value, url, trimmed, isSafeHostOrUrl |
| `src/services/bitgetWs.ts` | channel, map, sendSubscribe, channel, bitgetChannel, ... |
| `src/services/bitunixWs.ts` | targetChannel, map, resubscribePublic, subKey, resolved, ... |
| `src/services/capabilityDetection.ts` | mobileKeywords, userAgent, isMobileDevice |
| `src/services/cloudService.rateLimit.test.ts` | sender, senderActivity.find |
| `src/services/csvService.ts` | csvService.cleanCSVValue, val |
| `src/services/dataRepairService.ts` | t, clean, targets, trades, allTrades, ... |
| `src/services/dbService.ts` | T, key, get, storeName, db |
| `src/services/exchange/bitgetAdapter.ts` | marketData.channelsForRequirement, marketData.normalizeSymbol, symbol, requirement |
| `src/services/exchange/bitunixAdapter.ts` | marketData.normalizeSymbol, symbol, requirement, onTrade, marketData.subscribeTrades, ... |
| `src/services/frameSupportService.ts` | FrameSupportService, supported, obj, isDomainFrameSupported, k, ... |
| `src/services/hotkeyService.ts` | count, state, cycleTakeProfitFocus, targets, HOTKEY_ACTIONS.action, ... |
| `src/services/markdownLoader.ts` | id, renderer.heading, slugify, text |
| `src/services/marketWatcher.ts` | refreshActiveHistory |
| `src/services/marketWatcher/subscriptionRegistry.ts` | requirement, totalChannelCount, symbol, channels, requirement, ... |
| `src/services/marketWatcher_resync.test.ts` | marketData.channelsForRequirement, requirement |
| `src/services/rmsService_riskLimits.test.ts` | journalState.entries |
| `src/services/syncService.parallel.test.ts` | run, _.subscribe |
| `src/services/wasmCalculator.ts` | macdGroups, params, parts, action, fromWasmDecimal, ... |
| `src/stores/ai.svelte.ts` | idx, confirmNeeded, mult, executeAction, currentTargets, ... |
| `src/stores/chat.svelte.ts` | destroy, unsubscribe |
| `src/stores/quiz.svelte.ts` | loadQuestions, FlashCard, e, text, path, ... |
| `src/stores/quiz.test.ts` | text |
| `src/stores/tpsl.svelte.ts` | planTypeOf, order, raw |
| `src/stores/trade.svelte.ts` | symbol, normalized, provider, setSymbol |
| `src/stores/ui.svelte.ts` | bgColor, e, themeName, applyThemeToDom, expectedClass, ... |
| `src/tests/architecture/order_gate_bypass.test.ts` | file, found, source, i, action, ... |
| `src/tests/flash-close.confirmation.test.ts` | orderCalls, cancelCalls |
| `src/types/ai.ts` | AiModelInfo |
| `src/types/bitgetValidation.ts` | ch, AllowedBitgetChannel, isAllowedBitgetChannel |
| `src/utils/colors.ts` | n, hexToRgba, c, alpha, hex |
| `src/utils/errorUtils.ts` | lowerMsg, msg, code, codeStr, mapApiErrorToLabel, ... |
| `src/utils/heatmapUtils.ts` | getCoinankHeatmapSymbol, symbol |
| `src/utils/redact.ts` | input, out, redactString |
| `src/utils/server/venues/bitunix.ts` | body, data, bitunixIsSymbolNotFoundBody |
| `src/utils/symbolUtils.ts` | provider, formatSymbolForDisplay, symbol, symbol, normalizeSymbol, ... |
| `src/utils/technicalsPresenter.ts` | getActionColor, a, action |
| `src/utils/utils.ts` | str, match, parts, lastDot, suffix, ... |
| `tests/benchmarks/safeJson.bench.ts` | jsonString, protectedJson, safeJsonParseLegacy |
| `tests/gpu/webGpuParity.spec.ts` | b, rawText.setup |
| `vite.config.ts` | id, output.manualChunks |

## Connected Communities

- **utils +15 dirs** (33 cross-edges)
- **services +14 dirs** (25 cross-edges)
- **components/shared +13 dirs** (25 cross-edges)
- **services +10 dirs · slice** (21 cross-edges)
- **services +30 dirs** (16 cross-edges)
- **services +3 dirs · calculate** (13 cross-edges)
- **services +5 dirs · calculateIndicatorsFromArrays** (13 cross-edges)
- **services +6 dirs · processNext** (10 cross-edges)
- **services +5 dirs · ensureHistory** (9 cross-edges)
- **services +6 dirs · BitunixWebSocketService** (8 cross-edges)
- **utils +10 dirs** (8 cross-edges)
- **server/venues +22 dirs** (7 cross-edges)
- **services +3 dirs · delete** (6 cross-edges)
- **rules +10 dirs** (5 cross-edges)
- **components/shared +6 dirs · querySelectorAll** (4 cross-edges)
- **services +6 dirs · encrypt** (4 cross-edges)
- **scripts +6 dirs** (4 cross-edges)
- **services +1 dirs · newsService.fetchNews** (4 cross-edges)
- **services +10 dirs · appFetch** (4 cross-edges)
- **stores +2 dirs · ResultsManager** (3 cross-edges)
- **services +4 dirs · queueSubscription** (3 cross-edges)
- **. +9 dirs** (2 cross-edges)
- **services +6 dirs · dispatchMessage** (2 cross-edges)
- **services · RateLimiter** (2 cross-edges)
- **services · connect** (1 cross-edges)
- **services · resetIfNeeded** (1 cross-edges)
- **stores +1 dirs · find** (1 cross-edges)
- **benchmarks +13 dirs** (1 cross-edges)
- **services · MarketWatcher** (1 cross-edges)
- **. +2 dirs · GET** (1 cross-edges)
- **services +4 dirs · toNumFast** (1 cross-edges)
- **services +2 dirs · restoreFromBackup** (1 cross-edges)
- **src/lib +1 dirs · updateThemeColor** (1 cross-edges)
- **stores +3 dirs** (1 cross-edges)
- **calculators +12 dirs** (1 cross-edges)
- **server · sanitize** (1 cross-edges)
- **server · evictExpired** (1 cross-edges)
- **rules +3 dirs** (1 cross-edges)
- **components/shared +11 dirs** (1 cross-edges)
- **services · checkOpfsSnapshotOnStartup** (1 cross-edges)
- **services · getAll** (1 cross-edges)
- **services +3 dirs · handleHeatmapClick** (1 cross-edges)
- **services · manualReset** (1 cross-edges)
- **auth/token +2 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-641")
explore(operation:"context", task:"understand services +42 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
