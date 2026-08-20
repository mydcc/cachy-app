---
name: gortex-services-30-dirs
description: "Work in the services +30 dirs area — 303 symbols across 48 files (61% cohesion)"
---

# services +30 dirs

303 symbols | 48 files | 61% cohesion

## When to Use

Use this skill when working on files in:
- ``
- `.worktrees/backlog-jcodemunch/scripts/sync-github-issues.ts`
- `.worktrees/backlog-jcodemunch/src/config/rssPresets.ts`
- `.worktrees/backlog-jcodemunch/src/lib/server/urlValidator.ts`
- `.worktrees/backlog-jcodemunch/src/params/lang.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/external/article-content/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/external/article-content/article_content.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/external/check-frame-support/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/rss-fetch/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/tickers/+server.ts`
- `.worktrees/backlog-jcodemunch/src/service-worker.ts`
- `.worktrees/backlog-jcodemunch/src/services/app.ts`
- `.worktrees/backlog-jcodemunch/src/services/capabilityDetection.ts`
- `.worktrees/backlog-jcodemunch/src/services/frameSupportService.ts`
- `.worktrees/backlog-jcodemunch/src/stores/tpsl.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/tests/architecture/order_gate_bypass.test.ts`
- `.worktrees/backlog-jcodemunch/src/types/bitgetValidation.ts`
- `.worktrees/backlog-jcodemunch/src/utils/errorUtils.ts`
- `.worktrees/backlog-jcodemunch/src/utils/technicalsPresenter.ts`
- `.worktrees/backlog-jcodemunch/vite.config.ts`
- `scripts/sync-github-issues.ts`
- `src/config/rssPresets.ts`
- `src/lib/server/rateLimit.ts`
- `src/lib/server/urlValidator.ts`
- `src/lib/windows/implementations/IframeWindow.svelte.ts`
- `src/routes/api/ai/ollama/+server.ts`
- `src/routes/api/external/article-content/+server.ts`
- `src/routes/api/external/article-content/article_content.test.ts`
- `src/routes/api/external/check-frame-support/+server.ts`
- `src/routes/api/rss-fetch/+server.ts`
- `src/routes/api/tickers/+server.ts`
- `src/service-worker.ts`
- `src/services/apiQuotaTracker.svelte.ts`
- `src/services/apiService.ts`
- `src/services/app.ts`
- `src/services/bitunixWs.ts`
- `src/services/capabilityDetection.ts`
- `src/services/frameSupportService.ts`
- `src/stores/market.svelte.ts`
- `src/stores/tpsl.svelte.ts`
- `src/tests/architecture/order_gate_bypass.test.ts`
- `src/types/bitgetValidation.ts`
- `src/utils/WasmTechnicalsCalculator.ts`
- `src/utils/circularBuffer.ts`
- `src/utils/errorUtils.ts`
- `src/utils/technicalsPresenter.ts`
- `src/utils/utils.ts`
- `vite.config.ts`

## Key Files

| File | Symbols |
|------|---------|
| `` | includes, toLowerCase, querySelectorAll, querySelector |
| `.worktrees/backlog-jcodemunch/scripts/sync-github-issues.ts` | mapStatusToOptionName, hasOpenPR, status |
| `.worktrees/backlog-jcodemunch/src/config/rssPresets.ts` | getRSSUrlsByIds, urls, ids, p |
| `.worktrees/backlog-jcodemunch/src/lib/server/urlValidator.ts` | urlStr, u, isUrlAllowed |
| `.worktrees/backlog-jcodemunch/src/params/lang.ts` | param, match |
| `.worktrees/backlog-jcodemunch/src/routes/api/external/article-content/+server.ts` | maxValidParagraphs, bestTarget, paragraphs, message, body, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/external/article-content/article_content.test.ts` | getClientAddress |
| `.worktrees/backlog-jcodemunch/src/routes/api/external/check-frame-support/+server.ts` | isBlocked, authError, xfo, timeoutId, GET, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/rss-fetch/+server.ts` | ua, tryFetch, controller, targetUrl, e, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/tickers/+server.ts` | data, cacheKey, provider, GET, error, ... |
| `.worktrees/backlog-jcodemunch/src/service-worker.ts` | cache, response, isCacheable, err, respond, ... |
| `.worktrees/backlog-jcodemunch/src/services/app.ts` | app.updateSymbolSuggestions, input, suggestions |
| `.worktrees/backlog-jcodemunch/src/services/capabilityDetection.ts` | isMobileDevice, userAgent, mobileKeywords |
| `.worktrees/backlog-jcodemunch/src/services/frameSupportService.ts` | getDomain, urlStr |
| `.worktrees/backlog-jcodemunch/src/stores/tpsl.svelte.ts` | raw, planTypeOf, order |
| `.worktrees/backlog-jcodemunch/src/tests/architecture/order_gate_bypass.test.ts` | source, action, lines, window, findBypasses, ... |
| `.worktrees/backlog-jcodemunch/src/types/bitgetValidation.ts` | AllowedBitgetChannel, ch, isAllowedBitgetChannel |
| `.worktrees/backlog-jcodemunch/src/utils/errorUtils.ts` | lowerMsg, mapApiErrorToLabel, msg, error |
| `.worktrees/backlog-jcodemunch/src/utils/technicalsPresenter.ts` | a, action, getActionColor |
| `.worktrees/backlog-jcodemunch/vite.config.ts` | output.manualChunks, id |
| `scripts/sync-github-issues.ts` | hasOpenPR, mapStatusToOptionName, status |
| `src/config/rssPresets.ts` | ids, getRSSUrlsByIds, urls, p |
| `src/lib/server/rateLimit.ts` | consume, key, entry, now |
| `src/lib/server/urlValidator.ts` | isUrlAllowed, urlStr, u |
| `src/lib/windows/implementations/IframeWindow.svelte.ts` | options, constructor, title, url |
| `src/routes/api/ai/ollama/+server.ts` | rawBody, isLocalhost, parseResult, response, hint, ... |
| `src/routes/api/external/article-content/+server.ts` | maxValidParagraphs, validCount, doc, extractArticleContent, timeoutId, ... |
| `src/routes/api/external/article-content/article_content.test.ts` | text, getClientAddress |
| `src/routes/api/external/check-frame-support/+server.ts` | isBlocked, response, csp, hostname, targetUrl, ... |
| `src/routes/api/rss-fetch/+server.ts` | id, message, xml, tryFetch, authError, ... |
| `src/routes/api/tickers/+server.ts` | provider, isStatusError, error, cacheKey, type, ... |
| `src/service-worker.ts` | respond, response, response, isCacheable, response, ... |
| `src/services/apiQuotaTracker.svelte.ts` | entry, provider, errorMsg, recordError |
| `src/services/apiService.ts` | waitForToken, e, is404, nextTask, result, ... |
| `src/services/app.ts` | app.updateSymbolSuggestions, suggestions, input |
| `src/services/bitunixWs.ts` | n, targetMs, resolveTimeframe, sorted, tf, ... |
| `src/services/capabilityDetection.ts` | isMobileDevice, userAgent, mobileKeywords |
| `src/services/frameSupportService.ts` | urlStr, getDomain |
| `src/stores/market.svelte.ts` | recordApiCall |
| `src/stores/tpsl.svelte.ts` | raw, order, type, order, planTypeOf, ... |
| `src/tests/architecture/order_gate_bypass.test.ts` | source, window, action, found, file, ... |
| `src/types/bitgetValidation.ts` | AllowedBitgetChannel, isAllowedBitgetChannel, ch |
| `src/utils/WasmTechnicalsCalculator.ts` | shift |
| `src/utils/circularBuffer.ts` | index, get |
| `src/utils/errorUtils.ts` | lowerMsg, mapApiErrorToLabel, msg, error |
| `src/utils/technicalsPresenter.ts` | getActionColor, action, a |
| `src/utils/utils.ts` | num, timeframe, match, multiplier, getIntervalMs, ... |
| `vite.config.ts` | id, output.manualChunks |

## Connected Communities

- **lib/calculators +24 dirs** (14 cross-edges)
- **src/services +26 dirs** (12 cross-edges)
- **lib/server +38 dirs** (12 cross-edges)
- **src/utils +14 dirs** (10 cross-edges)
- **utils/server +16 dirs** (6 cross-edges)
- **services +2 dirs · warn** (4 cross-edges)
- **backlog-jcodemunch/src · GET** (3 cross-edges)
- **services +3 dirs · processNext** (3 cross-edges)
- **src/services +33 dirs** (2 cross-edges)
- **lib/windows +10 dirs** (2 cross-edges)
- **services · RateLimiter** (2 cross-edges)
- **utils/server +13 dirs** (2 cross-edges)
- **services +8 dirs** (2 cross-edges)
- **calculators +2 dirs** (1 cross-edges)
- **calculators +6 dirs** (1 cross-edges)
- **services +4 dirs · ensureHistory** (1 cross-edges)
- **services +4 dirs · error** (1 cross-edges)
- **external/article-content +2 dirs** (1 cross-edges)
- **services · get** (1 cross-edges)
- **services +1 dirs · BitunixWebSocketService** (1 cross-edges)
- **services +1 dirs · delete** (1 cross-edges)
- **src/utils · getDisplayMessage** (1 cross-edges)
- **server · sanitize** (1 cross-edges)
- **services +3 dirs · set** (1 cross-edges)
- **. +1 dirs · getDisplayMessage** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-396")
explore(operation:"context", task:"understand services +30 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
