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
| `` | all, some, finally |
| `src/lib/three/quality.ts` | normalizeQuality, value, VisualQuality |
| `src/lib/windows/WindowManager.svelte.ts` | id, isOpen |
| `src/services/cryptoService.test.ts` | getRandomValues, buffer |
| `src/services/cryptoService.ts` | key, encoded, password, password, hash, ... |
| `src/services/discordService.ts` | DiscordNewsConfig, thisPromise, now, discordBotToken, discordService.fetchDiscordNews, ... |
| `src/services/marketAnalyst_storm.test.ts` | freshAnalyst, marketAnalyst, analysisState |
| `src/services/newsService.ts` | NewsItem |
| `src/services/rssParserService.ts` | allItems, index, e, rssParserService.parseMultipleFeeds, items, ... |
| `src/stores/externalDeliveryLog.svelte.ts` | entries |
| `src/stores/favorites_consolidation.test.ts` | MAX_FAVORITE_SYMBOLS, settingsState, loadStores, favoritesState |
| `src/stores/news.test.ts` | news, mockAnalyzeSentiment, newsService.analyzeSentiment |
| `src/stores/settings.svelte.ts` | tasks, rawParsed, BrokenAlertReport, unlock, password, ... |
| `src/stores/settings/migrations.ts` | stored, rawProvider, resolveGeminiModel, finalProvider, loadedProvider, ... |
| `src/stores/settings/secretsLoader.ts` | failures, encryptionPassword, json, applyAccountKeyEncryption, data, ... |
| `src/stores/tpsl.svelte.ts` | symbol, hasPlansFor |
| `src/stores/tradeStore.test.ts` | targets, filterLogic |

## Connected Communities

- **services +30 dirs** (18 cross-edges)
- **services +42 dirs** (11 cross-edges)
- **services +14 dirs** (9 cross-edges)
- **services +5 dirs · calculateIndicatorsFromArrays** (9 cross-edges)
- **services/alertEngine +4 dirs** (8 cross-edges)
- **scripts +6 dirs** (5 cross-edges)
- **stores/settings · sanitizeUserProviders** (4 cross-edges)
- **services +6 dirs · BitunixWebSocketService** (4 cross-edges)
- **stores/settings +2 dirs** (4 cross-edges)
- **stores +1 dirs · find** (2 cross-edges)
- **utils +15 dirs** (2 cross-edges)
- **services · MarketWatcher** (2 cross-edges)
- **utils +10 dirs** (2 cross-edges)
- **services +2 dirs · detect** (2 cross-edges)
- **services · manualReset** (1 cross-edges)
- **services · getAll** (1 cross-edges)
- **server/venues +22 dirs** (1 cross-edges)
- **services · checkOpfsSnapshotOnStartup** (1 cross-edges)
- **services +2 dirs · set** (1 cross-edges)
- **utils +3 dirs · fill** (1 cross-edges)
- **services +10 dirs · slice** (1 cross-edges)
- **services +10 dirs · appFetch** (1 cross-edges)
- **stores +1 dirs · SettingsManager** (1 cross-edges)
- **stores/settings · ensureProviderRegistryState** (1 cross-edges)
- **. +9 dirs** (1 cross-edges)
- **stores · resolveActiveProvider** (1 cross-edges)
- **services +2 dirs · syncService.syncBitunixPositions** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-707")
explore(operation:"context", task:"understand services +5 dirs · encrypt", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
