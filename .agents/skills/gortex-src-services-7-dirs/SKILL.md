---
name: gortex-src-services-7-dirs
description: "Work in the src/services +7 dirs area — 465 symbols across 11 files (89% cohesion)"
---

# src/services +7 dirs

465 symbols | 11 files | 89% cohesion

## When to Use

Use this skill when working on files in:
- `.worktrees/backlog-jcodemunch/src/services/backupService.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/cryptoService.ts`
- `.worktrees/backlog-jcodemunch/src/stores/settings.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/stores/settings/migrations.ts`
- `.worktrees/backlog-jcodemunch/src/stores/settings/secretsLoader.ts`
- `.worktrees/backlog-jcodemunch/src/tests/security/storage_hardening.test.ts`
- `src/services/cryptoService.ts`
- `src/stores/settings.svelte.ts`
- `src/stores/settings/migrations.ts`
- `src/stores/settings/secretsLoader.ts`
- `src/tests/security/storage_hardening.test.ts`

## Key Files

| File | Symbols |
|------|---------|
| `.worktrees/backlog-jcodemunch/src/services/backupService.test.ts` | key, removeItem |
| `.worktrees/backlog-jcodemunch/src/services/cryptoService.ts` | isUnlocked |
| `.worktrees/backlog-jcodemunch/src/stores/settings.svelte.ts` | imgbbApiKey, chatFontSize, syncFavorites, borderEffect, saveLock, ... |
| `.worktrees/backlog-jcodemunch/src/stores/settings/migrations.ts` | resolveGeminiModel, resolveAnthropicModel, stored, loadedProvider, finalProvider, ... |
| `.worktrees/backlog-jcodemunch/src/stores/settings/secretsLoader.ts` | _deviceKey, setSensitiveField, getDeviceKey, applyFieldEncryption, data, ... |
| `.worktrees/backlog-jcodemunch/src/tests/security/storage_hardening.test.ts` | asInternals, SettingsManagerInternals, s |
| `src/services/cryptoService.ts` | isUnlocked |
| `src/stores/settings.svelte.ts` | newConfig, BackgroundAnimationPreset, applyMarketMode, showTvLink, HeatmapMode, ... |
| `src/stores/settings/migrations.ts` | stored, finalProvider, resolveAnthropicModel, stored, resolveGeminiModel, ... |
| `src/stores/settings/secretsLoader.ts` | applyApiKeys, currentApiKeys, merged |
| `src/tests/security/storage_hardening.test.ts` | asInternals, SettingsManagerInternals, s |

## Connected Communities

- **src/services +21 dirs** (6 cross-edges)
- **src/services +33 dirs** (6 cross-edges)
- **lib/calculators +24 dirs** (5 cross-edges)
- **src/stores +4 dirs · error** (5 cross-edges)
- **src/utils +5 dirs** (5 cross-edges)
- **backlog-jcodemunch/src · attemptDecrypt** (4 cross-edges)
- **services +2 dirs · warn** (3 cross-edges)
- **src/services +11 dirs** (3 cross-edges)
- **services +5 dirs** (3 cross-edges)
- **. +3 dirs · syncProjectKanbanStatus** (2 cross-edges)
- **services +8 dirs** (2 cross-edges)
- **services +1 dirs · decryptSecrets** (2 cross-edges)
- **lib/server +38 dirs** (2 cross-edges)
- **lib/actions +10 dirs · addEventListener** (2 cross-edges)
- **src/stores +4 dirs · ResultsManager** (2 cross-edges)
- **services +30 dirs** (1 cross-edges)
- **src/services +26 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-316")
explore(operation:"context", task:"understand src/services +7 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
