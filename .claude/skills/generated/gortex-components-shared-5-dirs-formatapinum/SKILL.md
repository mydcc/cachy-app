---
name: gortex-components-shared-5-dirs-formatapinum
description: "Work in the components/shared +5 dirs · formatApiNum area — 252 symbols across 13 files (77% cohesion)"
---

# components/shared +5 dirs · formatApiNum

252 symbols | 13 files | 77% cohesion

## When to Use

Use this skill when working on files in:
- `src/components/shared/OpenOrdersList.svelte`
- `src/components/shared/OrderHistoryList.svelte`
- `src/components/shared/TpSlCreateModal.svelte`
- `src/services/exchange/bitgetAdapter.ts`
- `src/services/exchange/bitunixAdapter.ts`
- `src/services/tradeService.ts`
- `src/types/bitget.ts`
- `src/types/exchange.ts`
- `src/types/orderSchemas.ts`
- `src/utils/server/venues/bitget.ts`
- `src/utils/server/venues/bitunix.ts`
- `src/utils/server/venues/types.ts`
- `src/utils/utils.ts`

## Key Files

| File | Symbols |
|------|---------|
| `src/components/shared/OpenOrdersList.svelte` | Props |
| `src/components/shared/OrderHistoryList.svelte` | Props |
| `src/components/shared/TpSlCreateModal.svelte` | handleCreatePartial, qty, e |
| `src/services/exchange/bitgetAdapter.ts` | params, symbol, params, throwOnError, trading.placeOrder, ... |
| `src/services/exchange/bitunixAdapter.ts` | params, trading.placePositionTpSl, trading.placeOrder, trading.cancelAllOrders, trading.placeTpSlOrder, ... |
| `src/services/tradeService.ts` | params, orderType, fetchPositionsPromise, clientId, stepSize, ... |
| `src/types/bitget.ts` | BitgetOrderPayload |
| `src/types/exchange.ts` | NormalizedOrder, NormalizedPosition |
| `src/types/orderSchemas.ts` | OrderRequestPayload |
| `src/utils/server/venues/bitget.ts` | text, fetchBitgetAccount, passphrase, bitgetPayload, limit, ... |
| `src/utils/server/venues/bitunix.ts` | rawPositions, res, creds, accountInfo, isoPnL, ... |
| `src/utils/server/venues/types.ts` | VenueCredentials, VenueId, VenueModule, ExchangeAccountData |
| `src/utils/utils.ts` | val, d, formatApiNum |

## Connected Communities

- **server/venues +16 dirs** (24 cross-edges)
- **. +9 dirs** (7 cross-edges)
- **services +46 dirs** (7 cross-edges)
- **services +15 dirs** (6 cross-edges)
- **utils +10 dirs** (5 cross-edges)
- **services +6 dirs · dispatchMessage** (5 cross-edges)
- **services +6 dirs · processNext** (2 cross-edges)
- **services +10 dirs · appFetch** (2 cross-edges)
- **services +10 dirs · slice** (2 cross-edges)
- **benchmarks +11 dirs** (1 cross-edges)
- **services · ensurePositionFreshness** (1 cross-edges)
- **services +3 dirs · verify** (1 cross-edges)
- **services +6 dirs · BitunixWebSocketService** (1 cross-edges)
- **services +2 dirs · capabilitiesOf** (1 cross-edges)
- **utils +15 dirs** (1 cross-edges)
- **services · handle** (1 cross-edges)
- **backgrounds/engines +11 dirs** (1 cross-edges)
- **calculators** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-777")
explore(operation:"context", task:"understand components/shared +5 dirs · formatApiNum", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
