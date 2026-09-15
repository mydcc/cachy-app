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
| `src/components/inputs/ExchangeAccountControls.svelte` | e, base, raw, refreshModes, lines, ... |
| `src/components/inputs/PortfolioInputs.component.test.ts` | paperAccountFeed |
| `src/components/inputs/PortfolioInputs.svelte` | handleLockClick, silent, handleFetchBalance, keys, provider, ... |
| `src/components/results/PlaceOrderPanel.svelte` | typeLabel, submit, isAccountStateStale, confirmed, at, ... |
| `src/components/settings/AccountList.svelte` | confirmed, handleRemove, account |
| `src/components/settings/ExternalChannelSettings.svelte` | chats, lookupChats |
| `src/components/shared/AddToPositionModal.svelte` | e, handleAdd |
| `src/components/shared/PositionsSidebar.dedup.component.test.ts` | paperAccountFeed |
| `src/components/shared/PositionsSidebar.svelte` | handleLoadMoreHistory, orderId, info, translateError, endTime, ... |
| `src/components/shared/Tooltip.svelte` | show |
| `src/components/shared/TpSlCreateModal.svelte` | e, handleCreatePositionWide |
| `src/components/shared/TpSlEditModal.svelte` | handleSave, e |
| `src/lib/appAuth.ts` | appAuthHeaders, body, isClientTokenError, issueAccessToken, response, ... |
| `src/lib/windows/implementations/CandleChartView.component.test.ts` | json |
| `src/lib/windows/implementations/CandleChartView.svelte` | keys, response, keys, e, e, ... |
| `src/services/accountEpoch.svelte.ts` | seq, AccountEpochStore, AccountSession, isCurrent, current, ... |
| `src/services/accountFetchSingleflight.ts` | existing, runAccountFetchOnce, accountFetchKey, flight, key, ... |
| `src/services/accountReadOrder.ts` | ticket, issued, begin, AccountReadOrder, applied, ... |
| `src/services/aiModelsService.ts` | params, err, fetchFromServer, headers, opts, ... |
| `src/services/apiService_syntheticTimeframes.test.ts` | json |
| `src/services/app_realtimeUpdates.test.ts` | withOnePosition |
| `src/services/exchange/bitgetAdapter.ts` | account.fetchPositionMode, symbol, account.fetchTradingPairInfo, symbol, account.fetchLeverageMarginMode |
| `src/services/exchange/bitunixAdapter.ts` | account.changeLeverage, leverage, account.fetchLeverageMarginMode, symbol, positionMode, ... |
| `src/services/exchange/registry.ts` | activeExchange |
| `src/services/externalDelivery.ts` | token, body, response, fetchTelegramChats, botToken, ... |
| `src/services/feeRateService.ts` | clearDerivedRates, payload, refreshDerivedFeeRates, rates, rates, ... |
| `src/services/frameSupportService.ts` | checkDomainSupport, domain, res, data, urlStr |
| `src/services/imgbbService.ts` | expiration, config, formData, apiKey, errorData, ... |
| `src/services/paperAccountFeed.ts` | accountInfo, PaperAccountFeed, balance, PaperAccountInfo, unrealizedTotal, ... |
| `src/services/paperTradingService.ts` | resetBook, account, feed, syncToStores |
| `src/services/rssParserService.ts` | error, data, body, rssParserService.parseRssFeed, timeoutId, ... |
| `src/services/syncService.parallel.test.ts` | journalState.entries |
| `src/services/technicalsTypes.test.ts` | relPath, read |
| `src/services/toastService.svelte.ts` | duration, success, message, warning, message, ... |
| `src/services/tradeService.ts` | e, symbol, e, data, validation, ... |
| `src/stores/entitlement.svelte.ts` | keys, hasApiKeys, capabilities, provider |
| `src/stores/settings.svelte.ts` | effectiveShowSidebarActivity, bitunix, hasBitunixKeys, hasApiKeys, bitget, ... |
| `src/stores/settings/accounts.ts` | accounts, activeAccountId, exchange, keysForActiveAccount |
| `src/utils/errorUtils.ts` | venue, t, getDisplayMessage, e, e, ... |
| `src/utils/marginMode.ts` | normalizeMarginMode, value, text |
| `src/utils/utils.ts` | ApiEnvelope, T, body, unwrapApiEnvelope |

## Connected Communities

- **services +42 dirs** (14 cross-edges)
- **utils +10 dirs** (5 cross-edges)
- **services +30 dirs** (5 cross-edges)
- **services +3 dirs · calculate** (5 cross-edges)
- **services +6 dirs · processNext** (5 cross-edges)
- **services/alertEngine +4 dirs** (4 cross-edges)
- **services +5 dirs · ensureHistory** (3 cross-edges)
- **. +9 dirs** (3 cross-edges)
- **utils +15 dirs** (2 cross-edges)
- **services +10 dirs · slice** (2 cross-edges)
- **server/venues +22 dirs** (2 cross-edges)
- **services +1 dirs · t** (2 cross-edges)
- **services +14 dirs** (2 cross-edges)
- **stores/settings +2 dirs** (2 cross-edges)
- **services +6 dirs · dispatchMessage** (2 cross-edges)
- **services +3 dirs · delete** (2 cross-edges)
- **components/shared +24 dirs** (2 cross-edges)
- **services · markPrice** (2 cross-edges)
- **calculators +12 dirs** (2 cross-edges)
- **services +5 dirs · calculateIndicatorsFromArrays** (2 cross-edges)
- **services +1 dirs · newsService.fetchNews** (1 cross-edges)
- **components/shared +13 dirs** (1 cross-edges)
- **services +2 dirs · syncService.syncBitunixPositions** (1 cross-edges)
- **services/exchange · getExchangeAdapter** (1 cross-edges)
- **services +3 dirs · verify** (1 cross-edges)
- **fees** (1 cross-edges)
- **windows/implementations +1 dirs** (1 cross-edges)
- **services · confirmProtection** (1 cross-edges)
- **services +6 dirs · BitunixWebSocketService** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-419")
explore(operation:"context", task:"understand services +10 dirs · appFetch", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
