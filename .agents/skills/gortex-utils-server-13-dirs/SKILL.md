---
name: gortex-utils-server-13-dirs
description: "Work in the utils/server +13 dirs area — 552 symbols across 22 files (85% cohesion)"
---

# utils/server +13 dirs

552 symbols | 22 files | 85% cohesion

## When to Use

Use this skill when working on files in:
- ``
- `.worktrees/backlog-jcodemunch/src/types/bitunix.ts`
- `.worktrees/backlog-jcodemunch/src/types/exchange.ts`
- `src/routes/api/account/+server.ts`
- `src/routes/api/balance/+server.ts`
- `src/routes/api/leverage-margin-mode/+server.ts`
- `src/routes/api/orders/+server.ts`
- `src/routes/api/orders/orders_cancel_path.test.ts`
- `src/routes/api/positions/+server.ts`
- `src/routes/api/sync/+server.ts`
- `src/routes/api/sync/order-detail/+server.ts`
- `src/routes/api/sync/positions-history/+server.ts`
- `src/routes/api/sync/positions-history/positions_history_security.test.ts`
- `src/routes/api/sync/positions-pending/+server.ts`
- `src/routes/api/sync/sync_security.test.ts`
- `src/services/tradeService.ts`
- `src/utils/safeJson.ts`
- `src/utils/server/bitget.ts`
- `src/utils/server/bitunix.ts`
- `src/utils/server/exchangeResponse.test.ts`
- `src/utils/server/exchangeResponse.ts`
- `src/utils/utils.ts`

## Key Files

| File | Symbols |
|------|---------|
| `` | charCodeAt, replaceAll |
| `.worktrees/backlog-jcodemunch/src/types/bitunix.ts` | BitunixResponse |
| `.worktrees/backlog-jcodemunch/src/types/exchange.ts` | NormalizedPosition |
| `src/routes/api/account/+server.ts` | apiSecret, text, ExchangeAccountData, crossPnL, timestamp, ... |
| `src/routes/api/balance/+server.ts` | apiSecret, response, balance, baseUrl, apiKey, ... |
| `src/routes/api/leverage-margin-mode/+server.ts` | text, data, res, signature, params, ... |
| `src/routes/api/orders/+server.ts` | err, params, timestamp, response, signature, ... |
| `src/routes/api/orders/orders_cancel_path.test.ts` | getClientAddress, text |
| `src/routes/api/positions/+server.ts` | apiSecret, queryString, digestInput, passphrase, path, ... |
| `src/routes/api/sync/+server.ts` | params, signature, limit, timestamp, baseUrl, ... |
| `src/routes/api/sync/order-detail/+server.ts` | timestamp, apiSecret, params, signInput, digestInput, ... |
| `src/routes/api/sync/positions-history/+server.ts` | positions, apiKey, url, data, params, ... |
| `src/routes/api/sync/positions-history/positions_history_security.test.ts` | getClientAddress, json, text |
| `src/routes/api/sync/positions-pending/+server.ts` | digest, baseUrl, body, digestInput, fetchBitunixPendingPositions, ... |
| `src/routes/api/sync/sync_security.test.ts` | text |
| `src/services/tradeService.ts` | orderId, stepSize, result, params, payload, ... |
| `src/utils/safeJson.ts` | result, len, char, c, T, ... |
| `src/utils/server/bitget.ts` | timestamp, path, queryString, apiSecret, validateBitgetKeys, ... |
| `src/utils/server/bitunix.ts` | queryString, signature, nonce, digestInput, body, ... |
| `src/utils/server/exchangeResponse.test.ts` | text |
| `src/utils/server/exchangeResponse.ts` | response, readExchangeJson, T |
| `src/utils/utils.ts` | d, val, formatApiNum |

## Connected Communities

- **lib/calculators +24 dirs** (17 cross-edges)
- **src/services +11 dirs** (13 cross-edges)
- **calculators +2 dirs** (9 cross-edges)
- **services +8 dirs** (7 cross-edges)
- **lib/server +38 dirs** (6 cross-edges)
- **utils/server +16 dirs** (6 cross-edges)
- **services +30 dirs** (6 cross-edges)
- **components/shared +4 dirs · update** (4 cross-edges)
- **src/services +33 dirs** (4 cross-edges)
- **src/services +26 dirs** (3 cross-edges)
- **api/account +4 dirs** (3 cross-edges)
- **services · flashClosePosition** (2 cross-edges)
- **. +2 dirs · calculateStep** (1 cross-edges)
- **services +9 dirs** (1 cross-edges)
- **lib/windows +10 dirs** (1 cross-edges)
- **tests/benchmarks +12 dirs** (1 cross-edges)
- **api/sentiment +4 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-866")
explore(operation:"context", task:"understand utils/server +13 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
