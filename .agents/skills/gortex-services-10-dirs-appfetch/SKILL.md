---
name: gortex-services-10-dirs-appfetch
description: "Work in the services +10 dirs · appFetch area — 342 symbols across 41 files (76% cohesion)"
---

# services +10 dirs · appFetch

342 symbols | 41 files | 76% cohesion

## When to Use

Use this skill when working on files in:
- `src/components/inputs/ExchangeAccountControls.svelte`
- `src/components/inputs/PortfolioInputs.component.test.ts`
- `src/components/inputs/PortfolioInputs.svelte`
- `src/components/results/PlaceOrderPanel.svelte`
- `src/components/settings/AccountList.svelte`
- `src/components/settings/ExternalChannelSettings.svelte`
- `src/components/shared/AddToPositionModal.svelte`
- `src/components/shared/PositionsSidebar.dedup.component.test.ts`
- `src/components/shared/PositionsSidebar.svelte`
- `src/components/shared/Tooltip.svelte`
- `src/components/shared/TpSlCreateModal.svelte`
- `src/components/shared/TpSlEditModal.svelte`
- `src/lib/appAuth.ts`
- `src/lib/windows/implementations/CandleChartView.component.test.ts`
- `src/lib/windows/implementations/CandleChartView.svelte`
- `src/services/accountEpoch.svelte.ts`
- `src/services/accountFetchSingleflight.ts`
- `src/services/accountReadOrder.ts`
- `src/services/aiModelsService.ts`
- `src/services/apiService_syntheticTimeframes.test.ts`
- `src/services/app_realtimeUpdates.test.ts`
- `src/services/exchange/bitgetAdapter.ts`
- `src/services/exchange/bitunixAdapter.ts`
- `src/services/exchange/registry.ts`
- `src/services/externalDelivery.ts`
- `src/services/feeRateService.ts`
- `src/services/frameSupportService.ts`
- `src/services/imgbbService.ts`
- `src/services/paperAccountFeed.ts`
- `src/services/paperTradingService.ts`
- `src/services/rssParserService.ts`
- `src/services/syncService.parallel.test.ts`
- `src/services/technicalsTypes.test.ts`
- `src/services/toastService.svelte.ts`
- `src/services/tradeService.ts`
- `src/stores/entitlement.svelte.ts`
- `src/stores/settings.svelte.ts`
- `src/stores/settings/accounts.ts`
- `src/utils/errorUtils.ts`
- `src/utils/marginMode.ts`
- `src/utils/utils.ts`

## Key Files

| File | Symbols |
|------|---------|
| `src/components/inputs/ExchangeAccountControls.svelte` | forSymbol, now, failed, confirmModes, report, ... |
| `src/components/inputs/PortfolioInputs.component.test.ts` | paperAccountFeed |
| `src/components/inputs/PortfolioInputs.svelte` | mappedKey, provider, PortfolioInputs, e, keys, ... |
| `src/components/results/PlaceOrderPanel.svelte` | isPaper, typeLabel, isAccountStateStale, submit, e, ... |
| `src/components/settings/AccountList.svelte` | confirmed, account, handleRemove |
| `src/components/settings/ExternalChannelSettings.svelte` | lookupChats, chats |
| `src/components/shared/AddToPositionModal.svelte` | handleAdd, e |
| `src/components/shared/PositionsSidebar.dedup.component.test.ts` | paperAccountFeed |
| `src/components/shared/PositionsSidebar.svelte` | response, orderId, keys, endTime, handleCancelOrder, ... |
| `src/components/shared/Tooltip.svelte` | show |
| `src/components/shared/TpSlCreateModal.svelte` | e, handleCreatePositionWide |
| `src/components/shared/TpSlEditModal.svelte` | handleSave, e |
| `src/lib/appAuth.ts` | issueAccessToken, appAuthHeaders, extra, token, appFetch, ... |
| `src/lib/windows/implementations/CandleChartView.component.test.ts` | json |
| `src/lib/windows/implementations/CandleChartView.svelte` | e, keys, json, hydratePositionsIfEmpty, provider, ... |
| `src/services/accountEpoch.svelte.ts` | AccountEpochStore, AccountSession, session, seq, isCurrent, ... |
| `src/services/accountFetchSingleflight.ts` | existing, flight, accountId, fn, accountFetchKey, ... |
| `src/services/accountReadOrder.ts` | issued, mayApply, AccountReadTicket, AccountReadOrder, begin, ... |
| `src/services/aiModelsService.ts` | res, fetchFromServer, err, headers, provider, ... |
| `src/services/apiService_syntheticTimeframes.test.ts` | json |
| `src/services/app_realtimeUpdates.test.ts` | withOnePosition |
| `src/services/exchange/bitgetAdapter.ts` | symbol, account.fetchLeverageMarginMode, account.fetchPositionMode, account.fetchTradingPairInfo, symbol |
| `src/services/exchange/bitunixAdapter.ts` | symbol, account.changePositionMode, account.fetchTradingPairInfo, account.changeLeverage, symbol, ... |
| `src/services/exchange/registry.ts` | activeExchange |
| `src/services/externalDelivery.ts` | botToken, e, controller, token, fetchTelegramChats, ... |
| `src/services/feeRateService.ts` | clearDerivedRates, rates, payload, refreshDerivedFeeRates, applyDerivedRates, ... |
| `src/services/frameSupportService.ts` | checkDomainSupport, data, urlStr, res, domain |
| `src/services/imgbbService.ts` | config, errorData, file, apiKey, formData, ... |
| `src/services/paperAccountFeed.ts` | PaperAccountFeed, positions, paperAccountFeed, PaperAccountInfo, unrealizedTotal, ... |
| `src/services/paperTradingService.ts` | resetBook, syncToStores, feed, account |
| `src/services/rssParserService.ts` | timeoutId, controller, data, response, rssParserService.parseRssFeed, ... |
| `src/services/syncService.parallel.test.ts` | journalState.entries |
| `src/services/technicalsTypes.test.ts` | read, relPath |
| `src/services/toastService.svelte.ts` | success, message, message, duration, warning, ... |
| `src/services/tradeService.ts` | validation, keys, ticket, changeMarginMode, response, ... |
| `src/stores/entitlement.svelte.ts` | keys, hasApiKeys, provider, capabilities |
| `src/stores/settings.svelte.ts` | hasApiKeys, hasBitunixKeys, hasBitgetKeys, bitget, bitunix, ... |
| `src/stores/settings/accounts.ts` | activeAccountId, accounts, exchange, keysForActiveAccount |
| `src/utils/errorUtils.ts` | e, e, venue, getDisplayMessage, t, ... |
| `src/utils/marginMode.ts` | value, text, normalizeMarginMode |
| `src/utils/utils.ts` | unwrapApiEnvelope, body, T, ApiEnvelope |

## Connected Communities

- **services +42 dirs** (14 cross-edges)
- **services +2 dirs · set** (6 cross-edges)
- **utils +10 dirs** (5 cross-edges)
- **services +30 dirs** (5 cross-edges)
- **services +6 dirs · processNext** (5 cross-edges)
- **. +9 dirs** (3 cross-edges)
- **services +5 dirs · ensureHistory** (3 cross-edges)
- **services/alertEngine +4 dirs** (3 cross-edges)
- **services +10 dirs · slice** (2 cross-edges)
- **server/venues +22 dirs** (2 cross-edges)
- **services +3 dirs · delete** (2 cross-edges)
- **services · markPrice** (2 cross-edges)
- **components/shared +24 dirs** (2 cross-edges)
- **services +6 dirs · dispatchMessage** (2 cross-edges)
- **services +14 dirs** (2 cross-edges)
- **services +1 dirs · t** (2 cross-edges)
- **stores/settings +2 dirs** (2 cross-edges)
- **utils +15 dirs** (2 cross-edges)
- **services +5 dirs · calculateIndicatorsFromArrays** (2 cross-edges)
- **calculators +12 dirs** (2 cross-edges)
- **services +2 dirs · newsService.fetchNews** (1 cross-edges)
- **services/exchange · getExchangeAdapter** (1 cross-edges)
- **services +6 dirs · BitunixWebSocketService** (1 cross-edges)
- **services +3 dirs · verify** (1 cross-edges)
- **components/shared +13 dirs** (1 cross-edges)
- **windows/implementations +1 dirs** (1 cross-edges)
- **fees** (1 cross-edges)
- **services +2 dirs · syncService.syncBitunixPositions** (1 cross-edges)
- **services · confirmProtection** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-419")
explore(operation:"context", task:"understand services +10 dirs · appFetch", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
