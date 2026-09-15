---
name: gortex-services-5-dirs-encrypt
description: "Work in the services +5 dirs · encrypt area — 263 symbols across 17 files (75% cohesion)"
---

# services +5 dirs · encrypt

263 symbols | 17 files | 75% cohesion

## When to Use

Use this skill when working on files in:
- ``
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
| `` | finally, some, all |
| `src/lib/three/quality.ts` | normalizeQuality, VisualQuality, value |
| `src/lib/windows/WindowManager.svelte.ts` | id, isOpen |
| `src/services/cryptoService.test.ts` | buffer, getRandomValues |
| `src/services/cryptoService.ts` | saltKey, password, decrypt, hash, password, ... |
| `src/services/discordService.ts` | now, config, discordChannels, discordService.fetchDiscordNews, discordBotToken, ... |
| `src/services/marketAnalyst_storm.test.ts` | marketAnalyst, freshAnalyst, analysisState |
| `src/services/newsService.ts` | NewsItem |
| `src/services/rssParserService.ts` | urls, rssParserService.parseMultipleFeeds, items, index, worker, ... |
| `src/stores/externalDeliveryLog.svelte.ts` | entries |
| `src/stores/favorites_consolidation.test.ts` | favoritesState, settingsState, MAX_FAVORITE_SYMBOLS, loadStores |
| `src/stores/news.test.ts` | newsService.analyzeSentiment, mockAnalyzeSentiment, news |
| `src/stores/settings.svelte.ts` | setMasterPassword, applyCoreFields, accountId, backgroundTasks, hasPlaintextCredentials, ... |
| `src/stores/settings/migrations.ts` | finalProvider, migrationDone, rawProvider, loadedProvider, resolveApiProvider, ... |
| `src/stores/settings/secretsLoader.ts` | _deviceKey, accountIds, entry, setSensitiveField, account, ... |
| `src/stores/tpsl.svelte.ts` | hasPlansFor, symbol |
| `src/stores/tradeStore.test.ts` | filterLogic, targets |

## Connected Communities

- **services +29 dirs** (18 cross-edges)
- **services +46 dirs** (11 cross-edges)
- **services +15 dirs** (9 cross-edges)
- **services +5 dirs · calculateIndicatorsFromArrays** (9 cross-edges)
- **services/alertEngine +4 dirs** (8 cross-edges)
- **scripts +6 dirs** (5 cross-edges)
- **stores/settings · sanitizeUserProviders** (4 cross-edges)
- **services +6 dirs · BitunixWebSocketService** (4 cross-edges)
- **stores/settings +2 dirs** (4 cross-edges)
- **utils +10 dirs** (2 cross-edges)
- **stores +1 dirs · find** (2 cross-edges)
- **services +2 dirs · detect** (2 cross-edges)
- **utils +15 dirs** (2 cross-edges)
- **services · MarketWatcher** (2 cross-edges)
- **utils +3 dirs · fill** (1 cross-edges)
- **services +10 dirs · slice** (1 cross-edges)
- **stores/settings · ensureProviderRegistryState** (1 cross-edges)
- **stores · resolveActiveProvider** (1 cross-edges)
- **stores +1 dirs · SettingsManager** (1 cross-edges)
- **server/venues +16 dirs** (1 cross-edges)
- **services · getAll** (1 cross-edges)
- **services +2 dirs · syncService.syncBitunixPositions** (1 cross-edges)
- **. +9 dirs** (1 cross-edges)
- **services · manualReset** (1 cross-edges)
- **services +2 dirs · set** (1 cross-edges)
- **services · checkOpfsSnapshotOnStartup** (1 cross-edges)
- **services +10 dirs · appFetch** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-701")
explore(operation:"context", task:"understand services +5 dirs · encrypt", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
