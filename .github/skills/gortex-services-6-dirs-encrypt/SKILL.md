---
name: gortex-services-6-dirs-encrypt
description: "Work in the services +6 dirs · encrypt area — 268 symbols across 18 files (75% cohesion)"
---

# services +6 dirs · encrypt

268 symbols | 18 files | 75% cohesion

## When to Use

Use this skill when working on files in:
- ``
- `src/lib/rules/indicatorSeries.test.ts`
- `src/lib/three/quality.ts`
- `src/lib/windows/WindowManager.svelte.ts`
- `src/services/cryptoService.test.ts`
- `src/services/cryptoService.ts`
- `src/services/discordService.ts`
- `src/services/marketAnalyst_storm.test.ts`
- `src/services/newsService.ts`
- `src/services/rssParserService.ts`
- `src/stores/externalDeliveryLog.svelte.ts`
- `src/stores/favorites_consolidation.test.ts`
- `src/stores/news.test.ts`
- `src/stores/settings.svelte.ts`
- `src/stores/settings/migrations.ts`
- `src/stores/settings/secretsLoader.ts`
- `src/stores/tpsl.svelte.ts`
- `src/stores/tradeStore.test.ts`

## Key Files

| File | Symbols |
|------|---------|
| `` | all, finally, some |
| `src/lib/rules/indicatorSeries.test.ts` | end, span, n, mean, values |
| `src/lib/three/quality.ts` | normalizeQuality, value, VisualQuality |
| `src/lib/windows/WindowManager.svelte.ts` | isOpen, id |
| `src/services/cryptoService.test.ts` | buffer, getRandomValues |
| `src/services/cryptoService.ts` | binary, sessionBaseKey, key, ciphertext, salt, ... |
| `src/services/discordService.ts` | DiscordNewsConfig, discordBotToken, DiscordMessage, thisPromise, discordService.fetchDiscordNews, ... |
| `src/services/marketAnalyst_storm.test.ts` | freshAnalyst, marketAnalyst, analysisState |
| `src/services/newsService.ts` | NewsItem |
| `src/services/rssParserService.ts` | worker, current, concurrency, items, e, ... |
| `src/stores/externalDeliveryLog.svelte.ts` | entries |
| `src/stores/favorites_consolidation.test.ts` | favoritesState, settingsState, loadStores, MAX_FAVORITE_SYMBOLS |
| `src/stores/news.test.ts` | news, newsService.analyzeSentiment, mockAnalyzeSentiment |
| `src/stores/settings.svelte.ts` | d, BackgroundType, decryptTasks, genericEncryptionTasks, providerBlob, ... |
| `src/stores/settings/migrations.ts` | stored, finalProvider, migrationDone, resolveGeminiModel, resolveApiProvider, ... |
| `src/stores/settings/secretsLoader.ts` | creds, account, data, _deviceKey, restored, ... |
| `src/stores/tpsl.svelte.ts` | hasPlansFor, symbol |
| `src/stores/tradeStore.test.ts` | targets, filterLogic |

## Connected Communities

- **services +30 dirs** (18 cross-edges)
- **services +42 dirs** (11 cross-edges)
- **services +14 dirs** (9 cross-edges)
- **services +5 dirs · calculateIndicatorsFromArrays** (9 cross-edges)
- **services/alertEngine +4 dirs** (8 cross-edges)
- **scripts +6 dirs** (5 cross-edges)
- **stores/settings +2 dirs** (4 cross-edges)
- **stores/settings · sanitizeUserProviders** (4 cross-edges)
- **services +6 dirs · BitunixWebSocketService** (4 cross-edges)
- **utils +10 dirs** (2 cross-edges)
- **services +2 dirs · detect** (2 cross-edges)
- **services · MarketWatcher** (2 cross-edges)
- **services +10 dirs · slice** (2 cross-edges)
- **utils +15 dirs** (2 cross-edges)
- **stores +1 dirs · find** (2 cross-edges)
- **stores/settings · ensureProviderRegistryState** (1 cross-edges)
- **services · manualReset** (1 cross-edges)
- **utils +3 dirs · fill** (1 cross-edges)
- **server/venues +22 dirs** (1 cross-edges)
- **services +10 dirs · appFetch** (1 cross-edges)
- **services · checkOpfsSnapshotOnStartup** (1 cross-edges)
- **stores +1 dirs · SettingsManager** (1 cross-edges)
- **. +9 dirs** (1 cross-edges)
- **services · getAll** (1 cross-edges)
- **services +3 dirs · calculate** (1 cross-edges)
- **services +2 dirs · syncService.syncBitunixPositions** (1 cross-edges)
- **components/shared +13 dirs** (1 cross-edges)
- **stores · resolveActiveProvider** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-708")
explore(operation:"context", task:"understand services +6 dirs · encrypt", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
