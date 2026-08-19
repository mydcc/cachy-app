---
name: gortex-lib-server-38-dirs
description: "Work in the lib/server +38 dirs area — 570 symbols across 56 files (80% cohesion)"
---

# lib/server +38 dirs

570 symbols | 56 files | 80% cohesion

## When to Use

Use this skill when working on files in:
- ``
- `.worktrees/backlog-jcodemunch/src/lib/server/clientToken.ts`
- `.worktrees/backlog-jcodemunch/src/lib/server/logger.ts`
- `.worktrees/backlog-jcodemunch/src/lib/server/rateLimit.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/account/account.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/ai/anthropic/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/ai/anthropic/models/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/ai/gemini/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/ai/gemini/gemini.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/ai/gemini/models/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/ai/ollama/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/ai/ollama/models/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/ai/ollama/models/ollama_models.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/ai/openai/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/ai/openai/models/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/ai/openrouter/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/ai/openrouter/models/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/external/cmc/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/external/cmc/cmc_auth.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/external/news/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/external/news/news_security.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/rss-fetch/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/sentiment/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/sentiment/sentiment.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/sync/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/sync/order-detail/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/sync/orders/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/sync/orders/security.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/sync/positions-history/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/sync/positions-history/positions_history_security.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/sync/positions-pending/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/sync/sync_security.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/aiModelsService.ts`
- `.worktrees/backlog-jcodemunch/src/types/ai.ts`
- `.worktrees/backlog-jcodemunch/src/types/apiSchemas.ts`
- `src/lib/server/clientToken.ts`
- `src/lib/server/logger.ts`
- `src/routes/api/ai/anthropic/+server.ts`
- `src/routes/api/ai/anthropic/models/+server.ts`
- `src/routes/api/ai/gemini/+server.ts`
- `src/routes/api/ai/gemini/gemini.test.ts`
- `src/routes/api/ai/gemini/models/+server.ts`
- `src/routes/api/ai/ollama/models/+server.ts`
- `src/routes/api/ai/ollama/models/ollama_models.test.ts`
- `src/routes/api/ai/openai/+server.ts`
- `src/routes/api/ai/openai/models/+server.ts`
- `src/routes/api/ai/openrouter/+server.ts`
- `src/routes/api/ai/openrouter/models/+server.ts`
- `src/routes/api/external/cmc/+server.ts`
- `src/routes/api/external/cmc/cmc_auth.test.ts`
- `src/routes/api/sync/+server.ts`
- `src/routes/api/sync/order-detail/+server.ts`
- `src/routes/api/sync/orders/+server.ts`
- `src/routes/api/sync/orders/security.test.ts`
- `src/routes/api/sync/positions-pending/+server.ts`
- `src/routes/api/sync/sync_security.test.ts`

## Key Files

| File | Symbols |
|------|---------|
| `` | allSettled, concat, unshift, catch |
| `.worktrees/backlog-jcodemunch/src/lib/server/clientToken.ts` | checkClientToken, unauthorized, record, hash, request, ... |
| `.worktrees/backlog-jcodemunch/src/lib/server/logger.ts` | message, data, error, data, message, ... |
| `.worktrees/backlog-jcodemunch/src/lib/server/rateLimit.ts` | entry, now, consume, key |
| `.worktrees/backlog-jcodemunch/src/routes/api/account/account.test.ts` | json |
| `.worktrees/backlog-jcodemunch/src/routes/api/ai/anthropic/+server.ts` | anthropicMessages, apiKey, e, err, response, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/ai/anthropic/models/+server.ts` | authError, apiKey, err, models, e, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/ai/gemini/+server.ts` | url, model, GeminiPart, POST, errMsg, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/ai/gemini/gemini.test.ts` | getClientAddress |
| `.worktrees/backlog-jcodemunch/src/routes/api/ai/gemini/models/+server.ts` | response, data, GeminiModel, err, GET, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/ai/ollama/+server.ts` | headers, response, apiKey, e, model, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/ai/ollama/models/+server.ts` | GET, e, isLocalhost, baseUrl, response, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/ai/ollama/models/ollama_models.test.ts` | getClientAddress |
| `.worktrees/backlog-jcodemunch/src/routes/api/ai/openai/+server.ts` | e, messages, response, apiKey, tools, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/ai/openai/models/+server.ts` | err, response, apiKey, OpenAiModel, e, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/ai/openrouter/+server.ts` | rawBody, POST, err, model, e, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/ai/openrouter/models/+server.ts` | e, models, GET, authError, err, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/external/cmc/+server.ts` | errorBody, data, GET, queryParams, endpoint, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/external/cmc/cmc_auth.test.ts` | getClientAddress |
| `.worktrees/backlog-jcodemunch/src/routes/api/external/news/+server.ts` | cacheKey, oldest, msg, body, cached, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/external/news/news_security.test.ts` | text, getClientAddress, json |
| `.worktrees/backlog-jcodemunch/src/routes/api/rss-fetch/+server.ts` | url, body, parsed, tryFetch, result, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/sentiment/+server.ts` | model, SentimentOutput, h, negativeWords, m, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/sentiment/sentiment.test.ts` | getClientAddress |
| `.worktrees/backlog-jcodemunch/src/routes/api/sync/+server.ts` | e, keyError, history, authError, validation, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/sync/order-detail/+server.ts` | e, apiKey, result, POST, authError, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/sync/orders/+server.ts` | accumulated, regularResult, msg, limit, msg, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/sync/orders/security.test.ts` | getClientAddress |
| `.worktrees/backlog-jcodemunch/src/routes/api/sync/positions-history/+server.ts` | result, limit, rawMsg, POST, positions, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/sync/positions-history/positions_history_security.test.ts` | json, getClientAddress |
| `.worktrees/backlog-jcodemunch/src/routes/api/sync/positions-pending/+server.ts` | creds, apiKey, authError, e, message, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/sync/sync_security.test.ts` | getClientAddress, json |
| `.worktrees/backlog-jcodemunch/src/services/aiModelsService.ts` | models |
| `.worktrees/backlog-jcodemunch/src/types/ai.ts` | AiModelInfo |
| `.worktrees/backlog-jcodemunch/src/types/apiSchemas.ts` | keys, regex, sanitized, message, sanitizeErrorMessage, ... |
| `src/lib/server/clientToken.ts` | rawToken, request, rateLimited, hash, record, ... |
| `src/lib/server/logger.ts` | data, message, error |
| `src/routes/api/ai/anthropic/+server.ts` | m, AnthropicMessageParam, parseResult, response, apiKey, ... |
| `src/routes/api/ai/anthropic/models/+server.ts` | AnthropicModel, GET, response, authError, data, ... |
| `src/routes/api/ai/gemini/+server.ts` | GeminiFunctionDeclaration, messages, msg, payload, systemInstruction, ... |
| `src/routes/api/ai/gemini/gemini.test.ts` | getClientAddress |
| `src/routes/api/ai/gemini/models/+server.ts` | e, GeminiModel, err, GET, apiKey, ... |
| `src/routes/api/ai/ollama/models/+server.ts` | authError, response, e, GET, baseUrl, ... |
| `src/routes/api/ai/ollama/models/ollama_models.test.ts` | getClientAddress |
| `src/routes/api/ai/openai/+server.ts` | model, err, messages, POST, response, ... |
| `src/routes/api/ai/openai/models/+server.ts` | apiKey, authError, OpenAiModel, response, e, ... |
| `src/routes/api/ai/openrouter/+server.ts` | messages, POST, e, tools, rawBody, ... |
| `src/routes/api/ai/openrouter/models/+server.ts` | response, data, GET, e, err, ... |
| `src/routes/api/external/cmc/+server.ts` | authError, response, errorBody, endpoint, GET, ... |
| `src/routes/api/external/cmc/cmc_auth.test.ts` | getClientAddress |
| `src/routes/api/sync/+server.ts` | message, validation, authError, apiKey, keyError, ... |
| `src/routes/api/sync/order-detail/+server.ts` | orderId, e, POST, order, result, ... |
| `src/routes/api/sync/orders/+server.ts` | safeMsg, POST, pageLimit, checkTimeout, msg, ... |
| `src/routes/api/sync/orders/security.test.ts` | getClientAddress |
| `src/routes/api/sync/positions-pending/+server.ts` | message, apiSecret, creds, result, body, ... |
| `src/routes/api/sync/sync_security.test.ts` | getClientAddress, json |

## Connected Communities

- **services +30 dirs** (28 cross-edges)
- **lib/calculators +24 dirs** (17 cross-edges)
- **utils/server +13 dirs** (13 cross-edges)
- **src/services +26 dirs** (12 cross-edges)
- **src/services +33 dirs** (10 cross-edges)
- **src/services +11 dirs** (8 cross-edges)
- **src/utils +14 dirs** (6 cross-edges)
- **services +8 dirs** (5 cross-edges)
- **utils/server +16 dirs** (4 cross-edges)
- **backlog-jcodemunch/src · POST** (3 cross-edges)
- **api/sentiment +4 dirs** (3 cross-edges)
- **external/news +1 dirs** (3 cross-edges)
- **lib/server · ServerLogger** (2 cross-edges)
- **api/account +4 dirs** (2 cross-edges)
- **lib/server · sanitize** (1 cross-edges)
- **server · ServerLogger** (1 cross-edges)
- **src/utils · getDisplayMessage** (1 cross-edges)
- **. +1 dirs · getDisplayMessage** (1 cross-edges)
- **auth/token +1 dirs** (1 cross-edges)
- **auth/token +2 dirs** (1 cross-edges)
- **src/utils +5 dirs** (1 cross-edges)
- **. +2 dirs · calculateStep** (1 cross-edges)
- **backlog-jcodemunch/src · GET** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-175")
explore(operation:"context", task:"understand lib/server +38 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
