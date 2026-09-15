---
name: gortex-components-shared-5-dirs-formatapinum
description: "Work in the components/shared +5 dirs · formatApiNum area — 230 symbols across 11 files (76% cohesion)"
---

# components/shared +5 dirs · formatApiNum

230 symbols | 11 files | 76% cohesion

## When to Use

Use this skill when working on files in:
- `src/components/shared/OpenOrdersList.svelte`
- `src/components/shared/OrderHistoryList.svelte`
- `src/components/shared/TpSlCreateModal.svelte`
- `src/services/exchange/bitgetAdapter.ts`
- `src/services/exchange/bitunixAdapter.ts`
- `src/services/tradeService.ts`
- `src/types/exchange.ts`
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
| `src/services/exchange/bitgetAdapter.ts` | trading.addToPosition, symbol, params, trading.cancelAllOrders, throwOnError, ... |
| `src/services/exchange/bitunixAdapter.ts` | params, trading.placePositionTpSl, params, params, trading.addToPosition, ... |
| `src/services/tradeService.ts` | result, rand, positionSide, onBehalfOf, params, ... |
| `src/types/exchange.ts` | NormalizedOrder |
| `src/utils/server/venues/bitget.ts` | symbol, signature, passphrase, timestamp, apiKey, ... |
| `src/utils/server/venues/bitunix.ts` | symbol, response, data, baseUrl, timestamp, ... |
| `src/utils/server/venues/types.ts` | ExchangeAccountData |
| `src/utils/utils.ts` | formatApiNum, val, d |

## Connected Communities

- **server/venues +22 dirs** (21 cross-edges)
- **. +9 dirs** (7 cross-edges)
- **services +14 dirs** (6 cross-edges)
- **services +6 dirs · dispatchMessage** (5 cross-edges)
- **utils +10 dirs** (5 cross-edges)
- **services +42 dirs** (4 cross-edges)
- **services +10 dirs · appFetch** (2 cross-edges)
- **services +6 dirs · processNext** (2 cross-edges)
- **services +10 dirs · slice** (2 cross-edges)
- **utils +15 dirs** (1 cross-edges)
- **calculators** (1 cross-edges)
- **services +3 dirs · verify** (1 cross-edges)
- **services +6 dirs · BitunixWebSocketService** (1 cross-edges)
- **benchmarks +13 dirs** (1 cross-edges)
- **services · ensurePositionFreshness** (1 cross-edges)
- **services +2 dirs · capabilitiesOf** (1 cross-edges)
- **services · handle** (1 cross-edges)
- **calculators +12 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-783")
explore(operation:"context", task:"understand components/shared +5 dirs · formatApiNum", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
