---
name: gortex-server-venues-22-dirs
description: "Work in the server/venues +22 dirs area — 717 symbols across 45 files (83% cohesion)"
---

# server/venues +22 dirs

717 symbols | 45 files | 83% cohesion

## When to Use

Use this skill when working on files in:
- ``
- `src/components/settings/tabs/IndicatorAlertAction.component.test.ts`
- `src/lib/server/cache.ts`
- `src/lib/server/logger.ts`
- `src/routes/api/account-settings/+server.ts`
- `src/routes/api/account-settings/account_settings.test.ts`
- `src/routes/api/ai/gemini/+server.ts`
- `src/routes/api/ai/gemini/gemini.test.ts`
- `src/routes/api/balance/+server.ts`
- `src/routes/api/funding-rate/+server.ts`
- `src/routes/api/klines/+server.ts`
- `src/routes/api/leverage-margin-mode/+server.ts`
- `src/routes/api/orders/+server.ts`
- `src/routes/api/orders/orders_bitget_history.test.ts`
- `src/routes/api/position-tiers/+server.ts`
- `src/routes/api/sync/+server.ts`
- `src/routes/api/sync/order-detail/+server.ts`
- `src/routes/api/sync/orders/+server.ts`
- `src/routes/api/sync/orders/security.test.ts`
- `src/routes/api/sync/positions-history/+server.ts`
- `src/routes/api/sync/positions-history/positions_history_security.test.ts`
- `src/routes/api/sync/positions-pending/+server.ts`
- `src/routes/api/sync/sync_security.test.ts`
- `src/routes/api/tickers/+server.ts`
- `src/routes/api/tickers/tickers.test.ts`
- `src/routes/api/trading-pairs/+server.ts`
- `src/stores/settings/aiProviders.ts`
- `src/types/accountSettingsSchemas.ts`
- `src/types/bitget.ts`
- `src/types/bitunix.ts`
- `src/types/exchange.ts`
- `src/types/orderSchemas.ts`
- `src/utils/circularBuffer.ts`
- `src/utils/safeJson.ts`
- `src/utils/server/bitunix.ts`
- `src/utils/server/exchangeResponse.test.ts`
- `src/utils/server/exchangeResponse.ts`
- `src/utils/server/fetchWithTimeout.ts`
- `src/utils/server/requestUtils.ts`
- `src/utils/server/venues/bitget.ts`
- `src/utils/server/venues/bitunix.ts`
- `src/utils/server/venues/index.ts`
- `src/utils/server/venues/orderErrors.ts`
- `src/utils/server/venues/types.ts`
- `src/utils/server/venues/upstreamRetry.ts`

## Key Files

| File | Symbols |
|------|---------|
| `` | charCodeAt, replaceAll, concat |
| `src/components/settings/tabs/IndicatorAlertAction.component.test.ts` | source, reason |
| `src/lib/server/cache.ts` | promise, entry, getOrFetch, ttlMs, fetchFn, ... |
| `src/lib/server/logger.ts` | data, error, message |
| `src/routes/api/account-settings/+server.ts` | secret, payload, errorCode, apiKey, sanitizedMsg, ... |
| `src/routes/api/account-settings/account_settings.test.ts` | text, getClientAddress |
| `src/routes/api/ai/gemini/+server.ts` | url, apiKey, msg, baseUrl, contents, ... |
| `src/routes/api/ai/gemini/gemini.test.ts` | getClientAddress |
| `src/routes/api/balance/+server.ts` | exchange, body, text, apiSecret, passphrase, ... |
| `src/routes/api/funding-rate/+server.ts` | data, isStatusError, GET, cacheKey, message, ... |
| `src/routes/api/klines/+server.ts` | message, symbol, limit, ApiError, GET, ... |
| `src/routes/api/leverage-margin-mode/+server.ts` | apiKey, baseUrl, queryString, apiSecret, data, ... |
| `src/routes/api/orders/+server.ts` | sanitizedDetails, apiKey, text, exchange, payload, ... |
| `src/routes/api/orders/orders_bitget_history.test.ts` | text, getClientAddress |
| `src/routes/api/position-tiers/+server.ts` | message, isStatusError, GET, cacheKey, data, ... |
| `src/routes/api/sync/+server.ts` | fetchBitunixHistory, startTime, creds, apiSecret, startTime, ... |
| `src/routes/api/sync/order-detail/+server.ts` | text, body, authError, result, rawMsg, ... |
| `src/routes/api/sync/orders/+server.ts` | planResult, regularResult, accumulated, apiKey, allOrders, ... |
| `src/routes/api/sync/orders/security.test.ts` | getClientAddress |
| `src/routes/api/sync/positions-history/+server.ts` | apiSecret, signature, rawMsg, body, data, ... |
| `src/routes/api/sync/positions-history/positions_history_security.test.ts` | text, getClientAddress, json |
| `src/routes/api/sync/positions-pending/+server.ts` | baseUrl, positions, timestamp, params, text, ... |
| `src/routes/api/sync/sync_security.test.ts` | text, json, getClientAddress |
| `src/routes/api/tickers/+server.ts` | type, provider, message, data, isStatusError, ... |
| `src/routes/api/tickers/tickers.test.ts` | text |
| `src/routes/api/trading-pairs/+server.ts` | message, error, cacheKey, error, symbols, ... |
| `src/stores/settings/aiProviders.ts` | id, BuiltinProviderPreset, builtinPreset, flavorOf, id |
| `src/types/accountSettingsSchemas.ts` | AccountSettingsAction, AccountSettingsPayload |
| `src/types/bitget.ts` | BitgetOrderPayload |
| `src/types/bitunix.ts` | BitunixOrderPayload, BitunixResponse, BitunixOrder, BitunixOrderListWrapper |
| `src/types/exchange.ts` | NormalizedPosition |
| `src/types/orderSchemas.ts` | OrderRequestPayload |
| `src/utils/circularBuffer.ts` | get, index |
| `src/utils/safeJson.ts` | result, char, jsonString, backslashCount, i, ... |
| `src/utils/server/bitunix.ts` | bodyStr, apiSecret, queryString, sortedKeys, body, ... |
| `src/utils/server/exchangeResponse.test.ts` | text |
| `src/utils/server/exchangeResponse.ts` | response, T, readExchangeJson |
| `src/utils/server/fetchWithTimeout.ts` | error, timer, upstreamErrorStatus, timeoutMs, e, ... |
| `src/utils/server/requestUtils.ts` | b, request, extractApiCredentials, apiSecret, apiKey, ... |
| `src/utils/server/venues/bitget.ts` | cleanedBody, creds, body, baseUrl, params, ... |
| `src/utils/server/venues/bitunix.ts` | payload, postBitunixAccount, timestamp, baseUrl, apiKey, ... |
| `src/utils/server/venues/index.ts` | id, resolveVenue |
| `src/utils/server/venues/orderErrors.ts` | payload, cleaned, cleanPayload, T, ExchangeError |
| `src/utils/server/venues/types.ts` | VenueCredentials, VenueId, KlinePriceSource, VenueModule, VenueKline, ... |
| `src/utils/server/venues/upstreamRetry.ts` | sleep, upstreamRetryDelayMs, isRetryableUpstreamStatus, attempt, status, ... |

## Connected Communities

- **services +42 dirs** (34 cross-edges)
- **components/shared +5 dirs · formatApiNum** (23 cross-edges)
- **services +30 dirs** (11 cross-edges)
- **services +10 dirs · slice** (8 cross-edges)
- **services +6 dirs · dispatchMessage** (8 cross-edges)
- **services +14 dirs** (6 cross-edges)
- **utils +10 dirs** (6 cross-edges)
- **. +9 dirs** (5 cross-edges)
- **external/news +2 dirs** (4 cross-edges)
- **api/sentiment +3 dirs** (3 cross-edges)
- **utils +15 dirs** (2 cross-edges)
- **services +5 dirs · encrypt** (1 cross-edges)
- **services +1 dirs · app.init** (1 cross-edges)
- **calculators +12 dirs** (1 cross-edges)
- **scripts +6 dirs** (1 cross-edges)
- **. +2 dirs · calculateStep** (1 cross-edges)
- **utils/server · validateBitunixKeys** (1 cross-edges)
- **server · ServerLogger** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-767")
explore(operation:"context", task:"understand server/venues +22 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
