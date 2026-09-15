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
| `src/components/inputs/ExchangeAccountControls.svelte` | onReturn, lines, forSymbol, confirmed, message, ... |
| `src/components/inputs/PortfolioInputs.component.test.ts` | paperAccountFeed |
| `src/components/inputs/PortfolioInputs.svelte` | e, silent, PortfolioInputs, provider, text, ... |
| `src/components/results/PlaceOrderPanel.svelte` | isAccountStateStale, typeLabel, t, submit, confirmed, ... |
| `src/components/settings/AccountList.svelte` | handleRemove, confirmed, account |
| `src/components/settings/ExternalChannelSettings.svelte` | chats, lookupChats |
| `src/components/shared/AddToPositionModal.svelte` | handleAdd, e |
| `src/components/shared/PositionsSidebar.dedup.component.test.ts` | paperAccountFeed |
| `src/components/shared/PositionsSidebar.svelte` | paper, trigger, code, message, keys, ... |
| `src/components/shared/Tooltip.svelte` | show |
| `src/components/shared/TpSlCreateModal.svelte` | e, handleCreatePositionWide |
| `src/components/shared/TpSlEditModal.svelte` | handleSave, e |
| `src/lib/appAuth.ts` | issueAccessToken, response, body, isClientTokenError, appFetch, ... |
| `src/lib/windows/implementations/CandleChartView.component.test.ts` | json |
| `src/lib/windows/implementations/CandleChartView.svelte` | json, json, e, e, provider, ... |
| `src/services/accountEpoch.svelte.ts` | AccountEpochStore, seq, current, AccountSession, session, ... |
| `src/services/accountFetchSingleflight.ts` | accountFetchKey, key, provider, trigger, existing, ... |
| `src/services/accountReadOrder.ts` | issued, AccountReadTicket, begin, mayApply, ticket, ... |
| `src/services/aiModelsService.ts` | params, headers, res, data, qs, ... |
| `src/services/apiService_syntheticTimeframes.test.ts` | json |
| `src/services/app_realtimeUpdates.test.ts` | withOnePosition |
| `src/services/exchange/bitgetAdapter.ts` | account.fetchPositionMode, symbol, account.fetchLeverageMarginMode, symbol, account.fetchTradingPairInfo |
| `src/services/exchange/bitunixAdapter.ts` | account.fetchPositionMode, leverage, positionMode, account.changePositionMode, account.fetchLeverageMarginMode, ... |
| `src/services/exchange/registry.ts` | activeExchange |
| `src/services/externalDelivery.ts` | body, fetchTelegramChats, timer, e, response, ... |
| `src/services/feeRateService.ts` | response, applyDerivedRates, payload, keys, refreshDerivedFeeRates, ... |
| `src/services/frameSupportService.ts` | data, urlStr, domain, res, checkDomainSupport |
| `src/services/imgbbService.ts` | expiration, apiKey, response, ImgbbUploadConfig, formData, ... |
| `src/services/paperAccountFeed.ts` | pendingOrders, accountInfo, paperAccountFeed, PaperAccountFeed, PaperAccountInfo, ... |
| `src/services/paperTradingService.ts` | account, syncToStores, feed, resetBook |
| `src/services/rssParserService.ts` | body, input, timeoutId, rssParserService.parseRssFeed, data, ... |
| `src/services/syncService.parallel.test.ts` | journalState.entries |
| `src/services/technicalsTypes.test.ts` | read, relPath |
| `src/services/toastService.svelte.ts` | success, duration, message, warning, message, ... |
| `src/services/tradeService.ts` | entry, validation, json, accountSettingRequest, json, ... |
| `src/stores/entitlement.svelte.ts` | keys, capabilities, provider, hasApiKeys |
| `src/stores/settings.svelte.ts` | bitget, bitunix, effectiveShowSidebarActivity, hasBitgetKeys, hasBitunixKeys, ... |
| `src/stores/settings/accounts.ts` | activeAccountId, accounts, exchange, keysForActiveAccount |
| `src/utils/errorUtils.ts` | e, getDisplayMessage, t, raw, e, ... |
| `src/utils/marginMode.ts` | value, normalizeMarginMode, text |
| `src/utils/utils.ts` | T, unwrapApiEnvelope, body, ApiEnvelope |

## Connected Communities

- **services +46 dirs** (14 cross-edges)
- **services +2 dirs · set** (6 cross-edges)
- **utils +10 dirs** (5 cross-edges)
- **services +29 dirs** (5 cross-edges)
- **services +6 dirs · processNext** (5 cross-edges)
- **services +6 dirs · ensureHistory** (3 cross-edges)
- **services/alertEngine +4 dirs** (3 cross-edges)
- **. +9 dirs** (3 cross-edges)
- **stores/settings +2 dirs** (2 cross-edges)
- **services +3 dirs · delete** (2 cross-edges)
- **services +10 dirs · slice** (2 cross-edges)
- **server/venues +16 dirs** (2 cross-edges)
- **backgrounds/engines +11 dirs** (2 cross-edges)
- **services +6 dirs · dispatchMessage** (2 cross-edges)
- **services +5 dirs · calculateIndicatorsFromArrays** (2 cross-edges)
- **services · markPrice** (2 cross-edges)
- **services +15 dirs** (2 cross-edges)
- **services +1 dirs · t** (2 cross-edges)
- **utils +15 dirs** (2 cross-edges)
- **components/shared +24 dirs** (2 cross-edges)
- **services · confirmProtection** (1 cross-edges)
- **services +2 dirs · syncService.syncBitunixPositions** (1 cross-edges)
- **fees** (1 cross-edges)
- **windows/implementations +1 dirs** (1 cross-edges)
- **components/shared +13 dirs** (1 cross-edges)
- **services/exchange · getExchangeAdapter** (1 cross-edges)
- **services +6 dirs · BitunixWebSocketService** (1 cross-edges)
- **services +2 dirs · newsService.fetchNews** (1 cross-edges)
- **services +3 dirs · verify** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-410")
explore(operation:"context", task:"understand services +10 dirs · appFetch", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
