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
| `src/lib/staleDeploymentRecovery.test.ts` | listener, type, addEventListener |
| `src/services/alertEngine/reconcileOrphanedRules.test.ts` | ids, present, store |
| `src/services/alertEngine/reconcileOrphanedRules.ts` | AlertStoreSnapshot, entry, empty, parsed, id, ... |
| `src/services/apiService.ts` | startTime, limit, errData, fetchPage, lowerErr, ... |
| `src/services/bitgetWs.ts` | sign, timestamp, apiKey, e, signInput, ... |
| `src/services/bitunixWs.ts` | lastWatchdogResetPrivate, isReconnectingPublic, payload, now, activeInstance, ... |
| `src/services/bitunixWs/messageParser.ts` | channel, criticalFields, isCritical, normalized, e, ... |
| `src/services/dbService.ts` | close |
| `src/services/logger.ts` | prefix, message, data, warn, force, ... |
| `src/services/newsService.ts` | newsHash, news, SentimentAnalysis, newsService.analyzeSentiment |
| `src/services/trackingService.ts` | data, e, eventData, pushToDataLayer |
| `src/stores/settings.svelte.ts` | constructor |
| `src/utils/retryPolicy.ts` | name, execute, fn, RetryConfig, config, ... |

## Entry Points

- `src/services/newsService.ts::newsService.analyzeSentiment@433`

## Connected Communities

- **services +46 dirs** (18 cross-edges)
- **services +6 dirs · processNext** (13 cross-edges)
- **services +29 dirs** (10 cross-edges)
- **services +5 dirs · encrypt** (7 cross-edges)
- **services +15 dirs** (6 cross-edges)
- **services +6 dirs · dispatchMessage** (6 cross-edges)
- **services +2 dirs · newsService.fetchNews** (5 cross-edges)
- **services +10 dirs · slice** (5 cross-edges)
- **server/venues +16 dirs** (3 cross-edges)
- **utils +10 dirs** (3 cross-edges)
- **stores +1 dirs · safeDecimal** (3 cross-edges)
- **services +10 dirs · appFetch** (3 cross-edges)
- **backgrounds/engines +11 dirs** (2 cross-edges)
- **utils +15 dirs** (2 cross-edges)
- **services/alertEngine +4 dirs** (2 cross-edges)
- **services +2 dirs · destroy** (2 cross-edges)
- **services · MarketWatcher** (2 cross-edges)
- **services +5 dirs · calculateIndicatorsFromArrays** (2 cross-edges)
- **rules +9 dirs** (2 cross-edges)
- **services +6 dirs · ensureHistory** (2 cross-edges)
- **services +3 dirs · performCalculation** (1 cross-edges)
- **. +9 dirs** (1 cross-edges)
- **components/shared +13 dirs** (1 cross-edges)
- **services · checkOpfsSnapshotOnStartup** (1 cross-edges)
- **services +3 dirs · delete** (1 cross-edges)
- **services · isTelemetryEnabled** (1 cross-edges)
- **stores +3 dirs · ResultsManager** (1 cross-edges)
- **services · getAll** (1 cross-edges)
- **stores +1 dirs · SettingsManager** (1 cross-edges)
- **. +2 dirs · parseDateString** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-478")
explore(operation:"context", task:"understand services +6 dirs · BitunixWebSocketService", format:"gcx")
relations(operation:"usages", target:{symbol:"src/services/newsService.ts::newsService.analyzeSentiment@433"}, format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
