---
name: gortex-utils-15-dirs
description: "Work in the utils +15 dirs area — 267 symbols across 28 files (66% cohesion)"
---

# utils +15 dirs

267 symbols | 28 files | 66% cohesion

## When to Use

Use this skill when working on files in:
- ``
- `scripts/lib/backlog-flip.ts`
- `scripts/lib/markdown-text.ts`
- `scripts/lib/pr-issue-match.ts`
- `scripts/sync-github-issues.ts`
- `src/components/alerts/tabs/ManageTab.component.test.ts`
- `src/components/settings/AiModelPicker.svelte`
- `src/components/settings/AiProviderManager.svelte`
- `src/components/settings/EngineDebugPanel.component.test.ts`
- `src/components/shared/ActiveAccountChip.component.test.ts`
- `src/components/shared/JournalContent.svelte`
- `src/lib/ai/directRequest.ts`
- `src/lib/ai/streamAdapters.ts`
- `src/lib/alerts/indicatorConditionForm.ts`
- `src/lib/notifications/externalChannels.ts`
- `src/lib/server/ollamaBaseUrl.ts`
- `src/lib/windows/zLayers.test.ts`
- `src/services/backupService.ts`
- `src/services/chartPatterns.locales.test.ts`
- `src/stores/ai.svelte.ts`
- `src/stores/externalChannels.svelte.ts`
- `src/stores/settings/accounts.ts`
- `src/stores/settings/aiProviders.ts`
- `src/tests/architecture/exchange_boundary.test.ts`
- `src/utils/colors.ts`
- `src/utils/inputUtils.ts`
- `src/utils/utils.test.ts`
- `src/utils/utils.ts`

## Key Files

| File | Symbols |
|------|---------|
| `` | trim, match, parseInt, race |
| `scripts/lib/backlog-flip.ts` | match, findClosingTrailer, num, content, readStatus, ... |
| `scripts/lib/markdown-text.ts` | core, kept, open, line, lines, ... |
| `scripts/lib/pr-issue-match.ts` | found, parsed, closingReferences, match, scanned, ... |
| `scripts/sync-github-issues.ts` | start_date, data_class, editionsMatch, estimateRaw, parent, ... |
| `src/components/alerts/tabs/ManageTab.component.test.ts` | el, listTabs |
| `src/components/settings/AiModelPicker.svelte` | Props |
| `src/components/settings/AiProviderManager.svelte` | activate, id, AiProviderManager |
| `src/components/settings/EngineDebugPanel.component.test.ts` | text |
| `src/components/shared/ActiveAccountChip.component.test.ts` | text |
| `src/components/shared/JournalContent.svelte` | updateThemeColors |
| `src/lib/ai/directRequest.ts` | DirectModelsParams, params, flavor, url, buildDirectModelsRequest, ... |
| `src/lib/ai/streamAdapters.ts` | buffer, StreamUsage, appendToolCallFragment, flavor, fragment |
| `src/lib/alerts/indicatorConditionForm.ts` | previous, raw, value, committedWindowLookback |
| `src/lib/notifications/externalChannels.ts` | chatId, config, config, config, domain, ... |
| `src/lib/server/ollamaBaseUrl.ts` | usesConfiguredDefault, raw |
| `src/lib/windows/zLayers.test.ts` | name, match, readCssVar |
| `src/services/backupService.ts` | cleaned, raw, validateTheme |
| `src/services/chartPatterns.locales.test.ts` | value, nonEmpty |
| `src/stores/ai.svelte.ts` | msg, model, aiMsgId, tp1D, message, ... |
| `src/stores/externalChannels.svelte.ts` | channel, problem |
| `src/stores/settings/accounts.ts` | existing, taken, id, newAccountId |
| `src/stores/settings/aiProviders.ts` | modelProviderForFlavor, existing, baseUrl, flavor, url, ... |
| `src/tests/architecture/exchange_boundary.test.ts` | i, lines, findDirectChannelCalls, source, file, ... |
| `src/utils/colors.ts` | element, getComputedColor, variableName, target, value |
| `src/utils/inputUtils.ts` | event, val, inputElement, handleBlur, rawValue |
| `src/utils/utils.test.ts` | randomUUID |
| `src/utils/utils.ts` | generateId |

## Entry Points

- `src/stores/ai.svelte.ts::AiManager.sendMessage`

## Connected Communities

- **services +42 dirs** (27 cross-edges)
- **components/shared +13 dirs** (11 cross-edges)
- **services +30 dirs** (8 cross-edges)
- **services +14 dirs** (8 cross-edges)
- **services +6 dirs · dispatchMessage** (4 cross-edges)
- **stores +1 dirs · find** (3 cross-edges)
- **services +5 dirs · safeDecimal** (3 cross-edges)
- **utils +10 dirs** (3 cross-edges)
- **services +5 dirs · ensureHistory** (2 cross-edges)
- **services +5 dirs · encrypt** (2 cross-edges)
- **stores · AiManager** (2 cross-edges)
- **stores +3 dirs** (2 cross-edges)
- **services +10 dirs · slice** (2 cross-edges)
- **components/settings +1 dirs · removeProvider** (2 cross-edges)
- **benchmarks +11 dirs** (2 cross-edges)
- **server/venues +22 dirs** (1 cross-edges)
- **ai/prompts +1 dirs** (1 cross-edges)
- **stores · resolveActiveProvider** (1 cross-edges)
- **ai · parseStreamChunk** (1 cross-edges)
- **rules +10 dirs** (1 cross-edges)
- **components/shared +6 dirs · querySelectorAll** (1 cross-edges)
- **services +3 dirs · verify** (1 cross-edges)
- **services · getModels** (1 cross-edges)
- **. +2 dirs · envVarsIn** (1 cross-edges)
- **services +10 dirs · appFetch** (1 cross-edges)
- **ai · buildAnthropic** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-45")
explore(operation:"context", task:"understand utils +15 dirs", format:"gcx")
relations(operation:"usages", target:{symbol:"src/stores/ai.svelte.ts::AiManager.sendMessage"}, format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
