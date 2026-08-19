---
name: gortex-utils-server-16-dirs
description: "Work in the utils/server +16 dirs area — 559 symbols across 27 files (82% cohesion)"
---

# utils/server +16 dirs

559 symbols | 27 files | 82% cohesion

## When to Use

Use this skill when working on files in:
- ``
- `.worktrees/backlog-jcodemunch/src/routes/api/account/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/balance/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/leverage-margin-mode/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/orders/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/orders/orders_cancel_path.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/positions/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/sync/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/sync/order-detail/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/sync/positions-history/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/sync/positions-history/positions_history_security.test.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/sync/positions-pending/+server.ts`
- `.worktrees/backlog-jcodemunch/src/routes/api/sync/sync_security.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/tradeService.ts`
- `.worktrees/backlog-jcodemunch/src/stores/ai.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/types/bitget.ts`
- `.worktrees/backlog-jcodemunch/src/types/bitunix.ts`
- `.worktrees/backlog-jcodemunch/src/types/exchange.ts`
- `.worktrees/backlog-jcodemunch/src/utils/heatmapUtils.ts`
- `.worktrees/backlog-jcodemunch/src/utils/safeJson.ts`
- `.worktrees/backlog-jcodemunch/src/utils/server/bitget.ts`
- `.worktrees/backlog-jcodemunch/src/utils/server/bitunix.ts`
- `.worktrees/backlog-jcodemunch/src/utils/server/exchangeResponse.test.ts`
- `.worktrees/backlog-jcodemunch/src/utils/server/exchangeResponse.ts`
- `.worktrees/backlog-jcodemunch/src/utils/utils.ts`
- `src/stores/ai.svelte.ts`
- `src/utils/heatmapUtils.ts`

## Key Files

| File | Symbols |
|------|---------|
| `` | toUpperCase |
| `.worktrees/backlog-jcodemunch/src/routes/api/account/+server.ts` | params, baseUrl, signature, response, text, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/balance/+server.ts` | passphrase, apiSecret, path, margin, apiSecret, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/leverage-margin-mode/+server.ts` | apiKey, fetchLeverageMarginMode, timestamp, text, symbol, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/orders/+server.ts` | res, payload, safeAmount, response, placeBitunixOrder, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/orders/orders_cancel_path.test.ts` | getClientAddress, text |
| `.worktrees/backlog-jcodemunch/src/routes/api/positions/+server.ts` | apiSecret, apiKey, signature, baseUrl, path, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/sync/+server.ts` | apiKey, signature, timestamp, limit, queryString, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/sync/order-detail/+server.ts` | text, digest, orderId, digestInput, queryParamsStr, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/sync/positions-history/+server.ts` | fetchBitunixHistoryPositions, queryString, path, limit, apiSecret, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/sync/positions-history/positions_history_security.test.ts` | text |
| `.worktrees/backlog-jcodemunch/src/routes/api/sync/positions-pending/+server.ts` | queryString, baseUrl, signature, apiSecret, apiKey, ... |
| `.worktrees/backlog-jcodemunch/src/routes/api/sync/sync_security.test.ts` | text |
| `.worktrees/backlog-jcodemunch/src/services/tradeService.ts` | getOrderDetail, clientId, stepSize, result, orderId, ... |
| `.worktrees/backlog-jcodemunch/src/stores/ai.svelte.ts` | mult, describeAction, action |
| `.worktrees/backlog-jcodemunch/src/types/bitget.ts` | BitgetOrderPayload |
| `.worktrees/backlog-jcodemunch/src/types/bitunix.ts` | BitunixOrderListWrapper, BitunixOrder, BitunixOrderPayload |
| `.worktrees/backlog-jcodemunch/src/types/exchange.ts` | NormalizedOrder |
| `.worktrees/backlog-jcodemunch/src/utils/heatmapUtils.ts` | symbol, baseAsset, getCoinglassUrl |
| `.worktrees/backlog-jcodemunch/src/utils/safeJson.ts` | j, i, c, start, len, ... |
| `.worktrees/backlog-jcodemunch/src/utils/server/bitget.ts` | params, preHash, timestamp, body, validateBitgetKeys, ... |
| `.worktrees/backlog-jcodemunch/src/utils/server/bitunix.ts` | queryParamsStr, params, timestamp, apiKey, bodyStr, ... |
| `.worktrees/backlog-jcodemunch/src/utils/server/exchangeResponse.test.ts` | text |
| `.worktrees/backlog-jcodemunch/src/utils/server/exchangeResponse.ts` | readExchangeJson, response, T |
| `.worktrees/backlog-jcodemunch/src/utils/utils.ts` | d, formatApiNum, val |
| `src/stores/ai.svelte.ts` | describeAction, mult, action |
| `src/utils/heatmapUtils.ts` | baseAsset, getCoinglassUrl, symbol |

## Connected Communities

- **lib/calculators +24 dirs** (20 cross-edges)
- **src/services +11 dirs** (13 cross-edges)
- **utils/server +13 dirs** (10 cross-edges)
- **services +8 dirs** (7 cross-edges)
- **services +30 dirs** (6 cross-edges)
- **src/services +26 dirs** (5 cross-edges)
- **lib/server +38 dirs** (4 cross-edges)
- **src/services +33 dirs** (4 cross-edges)
- **src/services +21 dirs** (3 cross-edges)
- **backlog-jcodemunch/src · POST** (3 cross-edges)
- **tests/benchmarks +12 dirs** (1 cross-edges)
- **lib/windows +10 dirs** (1 cross-edges)
- **. +2 dirs · calculateStep** (1 cross-edges)
- **backlog-jcodemunch/src · map** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-367")
explore(operation:"context", task:"understand utils/server +16 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
