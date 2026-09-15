---
name: gortex-server-venues-16-dirs
description: "Work in the server/venues +16 dirs area — 499 symbols across 29 files (81% cohesion)"
---

# server/venues +16 dirs

499 symbols | 29 files | 81% cohesion

## When to Use

Use this skill when working on files in:
- ``
- `src/lib/server/cache.ts`
- `src/routes/api/funding-rate/+server.ts`
- `src/routes/api/klines/+server.ts`
- `src/routes/api/leverage-margin-mode/+server.ts`
- `src/routes/api/position-tiers/+server.ts`
- `src/routes/api/sync/+server.ts`
- `src/routes/api/sync/order-detail/+server.ts`
- `src/routes/api/sync/positions-history/+server.ts`
- `src/routes/api/sync/positions-history/positions_history_security.test.ts`
- `src/routes/api/sync/positions-pending/+server.ts`
- `src/routes/api/sync/sync_security.test.ts`
- `src/routes/api/tickers/+server.ts`
- `src/routes/api/tickers/tickers.test.ts`
- `src/routes/api/trading-pairs/+server.ts`
- `src/stores/settings/aiProviders.ts`
- `src/types/accountSettingsSchemas.ts`
- `src/types/bitunix.ts`
- `src/utils/circularBuffer.ts`
- `src/utils/safeJson.ts`
- `src/utils/server/bitunix.ts`
- `src/utils/server/exchangeResponse.test.ts`
- `src/utils/server/exchangeResponse.ts`
- `src/utils/server/fetchWithTimeout.ts`
- `src/utils/server/venues/bitget.ts`
- `src/utils/server/venues/bitunix.ts`
- `src/utils/server/venues/orderErrors.ts`
- `src/utils/server/venues/types.ts`
- `src/utils/server/venues/upstreamRetry.ts`

## Key Files

| File | Symbols |
|------|---------|
| `` | charCodeAt |
| `src/lib/server/cache.ts` | entry, fetchFn, now, ttlMs, T, ... |
| `src/routes/api/funding-rate/+server.ts` | isStatusError, error, cacheKey, message, error, ... |
| `src/routes/api/klines/+server.ts` | ApiError |
| `src/routes/api/leverage-margin-mode/+server.ts` | baseUrl, data, queryString, signature, timestamp, ... |
| `src/routes/api/position-tiers/+server.ts` | error, symbol, data, cacheKey, error, ... |
| `src/routes/api/sync/+server.ts` | nonce, path, apiSecret, startTime, message, ... |
| `src/routes/api/sync/order-detail/+server.ts` | fetchBitunixOrderDetail, nonce, text, params, path, ... |
| `src/routes/api/sync/positions-history/+server.ts` | apiKey, path, baseUrl, rawMsg, apiSecret, ... |
| `src/routes/api/sync/positions-history/positions_history_security.test.ts` | text, json, getClientAddress |
| `src/routes/api/sync/positions-pending/+server.ts` | signature, nonce, apiSecret, params, data, ... |
| `src/routes/api/sync/sync_security.test.ts` | text, json, getClientAddress |
| `src/routes/api/tickers/+server.ts` | error, data, symbols, message, type, ... |
| `src/routes/api/tickers/tickers.test.ts` | text |
| `src/routes/api/trading-pairs/+server.ts` | error, data, isStatusError, GET, message, ... |
| `src/stores/settings/aiProviders.ts` | id, BuiltinProviderPreset, id, flavorOf, builtinPreset |
| `src/types/accountSettingsSchemas.ts` | AccountSettingsPayload, AccountSettingsAction |
| `src/types/bitunix.ts` | BitunixOrderListWrapper, BitunixResponse, BitunixOrder, BitunixOrderPayload |
| `src/utils/circularBuffer.ts` | index, get |
| `src/utils/safeJson.ts` | jsonString, lastIndex, i, j, closeQuote, ... |
| `src/utils/server/bitunix.ts` | bodyStr, nonce, signInput, body, apiKey, ... |
| `src/utils/server/exchangeResponse.test.ts` | text |
| `src/utils/server/exchangeResponse.ts` | response, readExchangeJson, T |
| `src/utils/server/fetchWithTimeout.ts` | UpstreamApiError, url, timer, fetchImpl, init, ... |
| `src/utils/server/venues/bitget.ts` | signature, text, res, timestamp, body, ... |
| `src/utils/server/venues/bitunix.ts` | apiSecret, cancelAllBitunixOrders, closeOrder, apiSecret, text, ... |
| `src/utils/server/venues/orderErrors.ts` | cleaned, payload, cleanPayload, T |
| `src/utils/server/venues/types.ts` | KlineQuery, VenueKline, KlinePriceSource |
| `src/utils/server/venues/upstreamRetry.ts` | ms, upstreamRetryDelayMs, status, attempt, sleep, ... |

## Connected Communities

- **services +46 dirs** (19 cross-edges)
- **components/shared +5 dirs · formatApiNum** (18 cross-edges)
- **services +6 dirs · dispatchMessage** (7 cross-edges)
- **services +10 dirs · slice** (7 cross-edges)
- **services +15 dirs** (7 cross-edges)
- **services +29 dirs** (6 cross-edges)
- **. +9 dirs** (5 cross-edges)
- **utils +10 dirs** (3 cross-edges)
- **api/account +7 dirs** (3 cross-edges)
- **api/orders +3 dirs** (2 cross-edges)
- **utils/server · validateBitunixKeys** (1 cross-edges)
- **services +5 dirs · encrypt** (1 cross-edges)
- **scripts +6 dirs** (1 cross-edges)
- **. +2 dirs · calculateStep** (1 cross-edges)
- **api/sentiment +3 dirs** (1 cross-edges)
- **backgrounds/engines +11 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-761")
explore(operation:"context", task:"understand server/venues +16 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
