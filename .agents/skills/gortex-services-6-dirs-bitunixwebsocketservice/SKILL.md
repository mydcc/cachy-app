---
name: gortex-services-6-dirs-bitunixwebsocketservice
description: "Work in the services +6 dirs · BitunixWebSocketService area — 257 symbols across 14 files (71% cohesion)"
---

# services +6 dirs · BitunixWebSocketService

257 symbols | 14 files | 71% cohesion

## When to Use

Use this skill when working on files in:
- `external-call::stdlib:crypto-js`
- `src/lib/staleDeploymentRecovery.test.ts`
- `src/services/alertEngine/reconcileOrphanedRules.test.ts`
- `src/services/alertEngine/reconcileOrphanedRules.ts`
- `src/services/apiService.ts`
- `src/services/bitgetWs.ts`
- `src/services/bitunixWs.ts`
- `src/services/bitunixWs/messageParser.ts`
- `src/services/dbService.ts`
- `src/services/logger.ts`
- `src/services/newsService.ts`
- `src/services/trackingService.ts`
- `src/stores/settings.svelte.ts`
- `src/utils/retryPolicy.ts`

## Key Files

| File | Symbols |
|------|---------|
| `external-call::stdlib:crypto-js` | crypto-js |
| `src/lib/staleDeploymentRecovery.test.ts` | listener, addEventListener, type |
| `src/services/alertEngine/reconcileOrphanedRules.test.ts` | present, ids, store |
| `src/services/alertEngine/reconcileOrphanedRules.ts` | parsed, AlertStoreSnapshot, e, raw, ids, ... |
| `src/services/apiService.ts` | startTime, res, mapped, endTime, pageEndTime, ... |
| `src/services/bitgetWs.ts` | signInput, sign, passphrase, apiSecret, e, ... |
| `src/services/bitunixWs.ts` | connect, awaitingPongPublic, lastWatchdogResetPublic, message, isReconnectingPrivate, ... |
| `src/services/bitunixWs/messageParser.ts` | revMap, bitunixTf, priceRes, d, criticalFields, ... |
| `src/services/dbService.ts` | close |
| `src/services/logger.ts` | data, message, force, category, warn, ... |
| `src/services/newsService.ts` | SentimentAnalysis, newsHash, newsService.analyzeSentiment, news |
| `src/services/trackingService.ts` | data, e, pushToDataLayer, eventData |
| `src/stores/settings.svelte.ts` | constructor |
| `src/utils/retryPolicy.ts` | fn, name, jitterFactor, T, execute, ... |

## Entry Points

- `src/services/newsService.ts::newsService.analyzeSentiment@433`

## Connected Communities

- **services +42 dirs** (18 cross-edges)
- **services +6 dirs · processNext** (13 cross-edges)
- **services +30 dirs** (10 cross-edges)
- **services +6 dirs · encrypt** (7 cross-edges)
- **services +14 dirs** (6 cross-edges)
- **services +6 dirs · dispatchMessage** (6 cross-edges)
- **services +10 dirs · slice** (5 cross-edges)
- **services +1 dirs · newsService.fetchNews** (5 cross-edges)
- **services +10 dirs · appFetch** (3 cross-edges)
- **server/venues +22 dirs** (3 cross-edges)
- **stores +1 dirs · safeDecimal** (3 cross-edges)
- **utils +10 dirs** (3 cross-edges)
- **utils +15 dirs** (2 cross-edges)
- **services +5 dirs · ensureHistory** (2 cross-edges)
- **rules +10 dirs** (2 cross-edges)
- **services +5 dirs · calculateIndicatorsFromArrays** (2 cross-edges)
- **services · MarketWatcher** (2 cross-edges)
- **services/alertEngine +4 dirs** (2 cross-edges)
- **services +2 dirs · destroy** (2 cross-edges)
- **calculators +12 dirs** (2 cross-edges)
- **. +2 dirs · parseDateString** (1 cross-edges)
- **services · getAll** (1 cross-edges)
- **services +3 dirs · delete** (1 cross-edges)
- **services +3 dirs · performCalculation** (1 cross-edges)
- **stores +1 dirs · SettingsManager** (1 cross-edges)
- **services · checkOpfsSnapshotOnStartup** (1 cross-edges)
- **services · isTelemetryEnabled** (1 cross-edges)
- **. +9 dirs** (1 cross-edges)
- **stores +2 dirs · ResultsManager** (1 cross-edges)
- **components/shared +13 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-487")
explore(operation:"context", task:"understand services +6 dirs · BitunixWebSocketService", format:"gcx")
relations(operation:"usages", target:{symbol:"src/services/newsService.ts::newsService.analyzeSentiment@433"}, format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
