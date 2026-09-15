---
name: gortex-services-46-dirs
description: "Work in the services +46 dirs area — 924 symbols across 100 files (73% cohesion)"
---

# services +46 dirs

924 symbols | 100 files | 73% cohesion

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
- `src/routes/api/ai/gemini/+server.ts`
- `src/routes/api/ai/gemini/gemini.test.ts`
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
- `src/routes/api/balance/+server.ts`
- `src/routes/api/external/article-content/+server.ts`
- `src/routes/api/external/article-content/article_content.test.ts`
- `src/routes/api/external/check-frame-support/+server.ts`
- `src/routes/api/external/cmc/+server.ts`
- `src/routes/api/external/cmc/cmc_auth.test.ts`
- `src/routes/api/rss-fetch/+server.ts`
- `src/routes/api/sync/order-detail/+server.ts`
- `src/routes/api/sync/positions-pending/+server.ts`
- `src/service-worker.ts`
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
- `src/utils/server/fetchWithTimeout.ts`
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
| `` | any, entries, substring, endsWith, startsWith, ... |
| `scripts/lib/backlog-flip.ts` | findItemFile, hit, repoFiles, itemId |
| `scripts/lib/issue-sync-payload.ts` | assignable, valid, assignableLogins, assignees, sanitizeAssignees, ... |
| `scripts/sync-github-issues.ts` | status, hasOpenPR, mapStatusToOptionName |
| `src/components/alerts/tabs/ManageTab.component.test.ts` | options, _.subscribe, key, translate, fn, ... |
| `src/components/settings/tabs/ConnectionsTab.svelte` | createAccessToken, data, res |
| `src/components/shared/OfflineBanner.component.test.ts` | result, parts, path, translate, _.subscribe, ... |
| `src/components/shared/PositionsSidebar.dedup.component.test.ts` | json, routeFetchDeferred, json |
| `src/components/shared/PositionsSidebar.svelte` | resolveMarkPrice, symbolData, lastPrice, live, p |
| `src/components/shared/TimeframeSelector.component.test.ts` | normalizeTimeframeInput, input |
| `src/config/rssPresets.ts` | p, getRSSUrlsByIds, urls, ids |
| `src/lib/actions/tooltip.ts` | updatePosition |
| `src/lib/ai/directRequest.ts` | relativePath, hostname, rel, resolveDirectUrl, baseUrl, ... |
| `src/lib/notificationPolicy.ts` | isNotificationCategory, value |
| `src/lib/physics/StressLogic.ts` | ammoInstance.locateFile, path |
| `src/lib/server/aiEndpoint.ts` | qs, extraParams, baseWithoutQuery, cleanBase, normalizedInput, ... |
| `src/lib/server/clientToken.ts` | request, hash, rawToken, clientAddress, rateLimited, ... |
| `src/lib/server/logger.ts` | sanitizeString, message, error, lowerKey, eqRegex, ... |
| `src/lib/server/ollamaBaseUrl.ts` | candidate, raw, parsed, resolveBaseUrl |
| `src/lib/server/rateLimit.ts` | entry, now, consume, key |
| `src/lib/server/urlValidator.test.ts` | getSafeDispatcher, DispatcherLookup, lookupWith, resolved, lookup |
| `src/lib/server/urlValidator.ts` | ipv4Regex, Agent, urlStr, url, cleanHost, ... |
| `src/lib/staleDeploymentRecovery.ts` | event, onUnhandledRejection, normalized, isStaleChunkError, error, ... |
| `src/lib/themeBackgrounds.ts` | themeName, isLightTheme |
| `src/lib/windows/implementations/IframeWindow.svelte.ts` | options, url, constructor, title |
| `src/locales/i18n.ts` | syncDocumentLang, value |
| `src/params/lang.ts` | match, param |
| `src/routes/api/ai/anthropic/+server.ts` | targetUrl, parsed, POST, authError, m, ... |
| `src/routes/api/ai/anthropic/models/+server.ts` | headers, err, e, baseUrl, response, ... |
| `src/routes/api/ai/gemini/+server.ts` | contents, payload, rawBody, encodedModel, GeminiFunctionDeclaration, ... |
| `src/routes/api/ai/gemini/gemini.test.ts` | getClientAddress |
| `src/routes/api/ai/gemini/models/+server.ts` | headers, data, GET, baseUrl, apiKey, ... |
| `src/routes/api/ai/ollama/+server.ts` | baseUrl, model, response, err, messages, ... |
| `src/routes/api/ai/ollama/models/+server.ts` | authError, baseUrl, OllamaModel, GET, models, ... |
| `src/routes/api/ai/ollama/models/ollama_models.test.ts` | getClientAddress |
| `src/routes/api/ai/ollama/models/server.test.ts` | get, qs, url, request, baseUrl |
| `src/routes/api/ai/ollama/ollama.test.ts` | getClientAddress |
| `src/routes/api/ai/openai-responses/+server.ts` | err, instructions, tools, input, OpenAiChatTool, ... |
| `src/routes/api/ai/openai-responses/server.test.ts` | getClientAddress |
| `src/routes/api/ai/openai/+server.ts` | response, isOpenRouterTarget, targetUrl, model, parseResult, ... |
| `src/routes/api/ai/openai/models/+server.ts` | rawModels, baseUrl, response, headers, trimmedBase, ... |
| `src/routes/api/ai/openai/server.test.ts` | getClientAddress |
| `src/routes/api/ai/openrouter/+server.ts` | targetUrl, rawBody, authError, messages, response, ... |
| `src/routes/api/ai/openrouter/models/+server.ts` | apiKey, targetUrl, GET, models, err, ... |
| `src/routes/api/balance/+server.ts` | authError, POST, passphrase, apiSecret, e, ... |
| `src/routes/api/external/article-content/+server.ts` | maxValidParagraphs, validCount, body, html, dom, ... |
| `src/routes/api/external/article-content/article_content.test.ts` | getClientAddress, text |
| `src/routes/api/external/check-frame-support/+server.ts` | isBlocked, targetUrl, response, controller, GET, ... |
| `src/routes/api/external/cmc/+server.ts` | queryParams, response, errorBody, data, endpoint, ... |
| `src/routes/api/external/cmc/cmc_auth.test.ts` | getClientAddress |
| `src/routes/api/rss-fetch/+server.ts` | text, response, cached, oldestKey, targetUrl, ... |
| `src/routes/api/sync/order-detail/+server.ts` | body, POST, orderId, order, result, ... |
| `src/routes/api/sync/positions-pending/+server.ts` | safeMsg, body, apiKey, authError, apiSecret, ... |
| `src/service-worker.ts` | response, err, cache, response, response, ... |
| `src/services/alertEngine/legacyReplayCoordinator.ts` | report, Attempt, symbol, attempt |
| `src/services/apiQuotaTracker.svelte.ts` | provider, entry, recordError, errorMsg |
| `src/services/apiService.ts` | now, status, timeout, apiService.fetchBitunixFundingRateHistory, status, ... |
| `src/services/app.ts` | suggestions, app.updateSymbolSuggestions, input |
| `src/services/backupService.ts` | value, lower, isSafeHostOrUrl, url, trimmed |
| `src/services/bitgetWs.ts` | subKey, map, symbol, payload, bitgetChannel, ... |
| `src/services/bitunixWs.ts` | targetChannel, symbol, bitunixChannel, currentCount, subKey, ... |
| `src/services/capabilityDetection.ts` | isMobileDevice, mobileKeywords, userAgent |
| `src/services/cloudService.rateLimit.test.ts` | sender, senderActivity.find |
| `src/services/csvService.ts` | val, csvService.cleanCSVValue |
| `src/services/dataRepairService.ts` | dataRepairService.repairSymbols, onProgress, fetchSmartKlines, clean, t, ... |
| `src/services/dbService.ts` | T, key, get, db, storeName |
| `src/services/exchange/bitgetAdapter.ts` | marketData.channelsForRequirement, requirement, symbol, marketData.normalizeSymbol |
| `src/services/exchange/bitunixAdapter.ts` | onTrade, marketData.subscribeTrades, marketData.normalizeSymbol, requirement, marketData.channelsForRequirement, ... |
| `src/services/frameSupportService.ts` | supported, v, domain, k, constructor, ... |
| `src/services/hotkeyService.ts` | cycleTakeProfitFocus, activeElement, count, state, currentIndex, ... |
| `src/services/markdownLoader.ts` | slugify, renderer.heading, text, id |
| `src/services/marketWatcher.ts` | refreshActiveHistory |
| `src/services/marketWatcher/subscriptionRegistry.ts` | symbol, register, unregister, count, channel, ... |
| `src/services/marketWatcher_resync.test.ts` | requirement, marketData.channelsForRequirement |
| `src/services/rmsService_riskLimits.test.ts` | journalState.entries |
| `src/services/syncService.parallel.test.ts` | _.subscribe, run |
| `src/services/wasmCalculator.ts` | key, raw, lastPrice, action, mult, ... |
| `src/stores/ai.svelte.ts` | confirmNeeded, idx, mult, executeAction, currentTargets, ... |
| `src/stores/chat.svelte.ts` | destroy, unsubscribe |
| `src/stores/quiz.svelte.ts` | loadQuestions, e, cat, text, lang, ... |
| `src/stores/quiz.test.ts` | text |
| `src/stores/tpsl.svelte.ts` | planTypeOf, order, raw |
| `src/stores/trade.svelte.ts` | symbol, setSymbol, provider, normalized |
| `src/stores/ui.svelte.ts` | bgColor, expectedClass, themeName, html, themeName, ... |
| `src/tests/architecture/order_gate_bypass.test.ts` | Bypass, file, action, lines, findBypasses, ... |
| `src/tests/flash-close.confirmation.test.ts` | orderCalls, cancelCalls |
| `src/types/ai.ts` | AiModelInfo |
| `src/types/bitgetValidation.ts` | isAllowedBitgetChannel, ch, AllowedBitgetChannel |
| `src/utils/colors.ts` | c, hexToRgba, alpha, n, hex |
| `src/utils/errorUtils.ts` | getBitunixErrorKey, msg, mapApiErrorToLabel, codeStr, code, ... |
| `src/utils/heatmapUtils.ts` | getCoinankHeatmapSymbol, symbol |
| `src/utils/redact.ts` | out, redactString, input |
| `src/utils/server/fetchWithTimeout.ts` | e, status, upstreamErrorStatus |
| `src/utils/server/venues/bitunix.ts` | data, bitunixIsSymbolNotFoundBody, body |
| `src/utils/symbolUtils.ts` | formatSymbolForDisplay, normalizeSymbol, symbol, s, provider, ... |
| `src/utils/technicalsPresenter.ts` | action, a, getActionColor |
| `src/utils/utils.ts` | multiplier, match, unsafe, d, value, ... |
| `tests/benchmarks/safeJson.bench.ts` | protectedJson, safeJsonParseLegacy, jsonString |
| `tests/gpu/webGpuParity.spec.ts` | b, rawText.setup |
| `vite.config.ts` | id, output.manualChunks |

## Connected Communities

- **utils +15 dirs** (35 cross-edges)
- **components/shared +13 dirs** (25 cross-edges)
- **services +15 dirs** (24 cross-edges)
- **services +10 dirs · slice** (22 cross-edges)
- **services +29 dirs** (18 cross-edges)
- **services +5 dirs · calculateIndicatorsFromArrays** (13 cross-edges)
- **services +2 dirs · set** (12 cross-edges)
- **services +6 dirs · processNext** (10 cross-edges)
- **server/venues +16 dirs** (9 cross-edges)
- **utils +10 dirs** (9 cross-edges)
- **services +6 dirs · ensureHistory** (9 cross-edges)
- **services +6 dirs · BitunixWebSocketService** (8 cross-edges)
- **services +3 dirs · delete** (6 cross-edges)
- **rules +9 dirs** (5 cross-edges)
- **api/account +7 dirs** (4 cross-edges)
- **services +10 dirs · appFetch** (4 cross-edges)
- **components/shared +6 dirs · querySelectorAll** (4 cross-edges)
- **services +5 dirs · encrypt** (4 cross-edges)
- **scripts +6 dirs** (4 cross-edges)
- **services +2 dirs · newsService.fetchNews** (4 cross-edges)
- **stores +3 dirs · ResultsManager** (3 cross-edges)
- **services +4 dirs · queueSubscription** (3 cross-edges)
- **services · RateLimiter** (2 cross-edges)
- **. +9 dirs** (2 cross-edges)
- **api/orders +3 dirs** (2 cross-edges)
- **external/news +2 dirs** (2 cross-edges)
- **services +6 dirs · dispatchMessage** (2 cross-edges)
- **services +3 dirs · handleHeatmapClick** (1 cross-edges)
- **services · getAll** (1 cross-edges)
- **services +2 dirs · restoreFromBackup** (1 cross-edges)
- **services · MarketWatcher** (1 cross-edges)
- **services +1 dirs · calculate** (1 cross-edges)
- **src/lib +1 dirs · updateThemeColor** (1 cross-edges)
- **services · checkOpfsSnapshotOnStartup** (1 cross-edges)
- **services · manualReset** (1 cross-edges)
- **services · resetIfNeeded** (1 cross-edges)
- **server · ServerLogger** (1 cross-edges)
- **server · evictExpired** (1 cross-edges)
- **backgrounds/engines +11 dirs** (1 cross-edges)
- **services · connect** (1 cross-edges)
- **. +2 dirs · GET** (1 cross-edges)
- **benchmarks +11 dirs** (1 cross-edges)
- **auth/token +2 dirs** (1 cross-edges)
- **server · sanitize** (1 cross-edges)
- **stores +3 dirs · MarketManager** (1 cross-edges)
- **stores +1 dirs · find** (1 cross-edges)
- **services +4 dirs · toNumFast** (1 cross-edges)
- **components/shared +11 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-633")
explore(operation:"context", task:"understand services +46 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
