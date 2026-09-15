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
| `` | parseInt, trim, match, race |
| `scripts/lib/backlog-flip.ts` | match, findClosingTrailer, content, body, match, ... |
| `scripts/lib/markdown-text.ts` | stripCodeBlocks, line, text, open, core, ... |
| `scripts/lib/pr-issue-match.ts` | closingReferences, body, scanned, parsed, pattern, ... |
| `scripts/sync-github-issues.ts` | size, title, status, area, editionsMatch, ... |
| `src/components/alerts/tabs/ManageTab.component.test.ts` | listTabs, el |
| `src/components/settings/AiModelPicker.svelte` | Props |
| `src/components/settings/AiProviderManager.svelte` | activate, AiProviderManager, id |
| `src/components/settings/EngineDebugPanel.component.test.ts` | text |
| `src/components/shared/ActiveAccountChip.component.test.ts` | text |
| `src/components/shared/JournalContent.svelte` | updateThemeColors |
| `src/lib/ai/directRequest.ts` | buildDirectModelsRequest, DirectModelsRequest, flavor, params, headers, ... |
| `src/lib/ai/streamAdapters.ts` | appendToolCallFragment, fragment, flavor, StreamUsage, buffer |
| `src/lib/alerts/indicatorConditionForm.ts` | previous, committedWindowLookback, value, raw |
| `src/lib/notifications/externalChannels.ts` | url, ConfigProblem, domain, validateEmail, config, ... |
| `src/lib/server/ollamaBaseUrl.ts` | raw, usesConfiguredDefault |
| `src/lib/windows/zLayers.test.ts` | name, match, readCssVar |
| `src/services/backupService.ts` | raw, cleaned, validateTheme |
| `src/services/chartPatterns.locales.test.ts` | nonEmpty, value |
| `src/stores/ai.svelte.ts` | safeContent, parsed, chunk, context, singleMatch, ... |
| `src/stores/externalChannels.svelte.ts` | channel, problem |
| `src/stores/settings/accounts.ts` | existing, id, newAccountId, taken |
| `src/stores/settings/aiProviders.ts` | modelProviderForFlavor, baseUrl, existing, AiApiFlavor, id, ... |
| `src/tests/architecture/exchange_boundary.test.ts` | findSocketImports, specifier, i, file, findDirectChannelCalls, ... |
| `src/utils/colors.ts` | value, variableName, element, target, getComputedColor |
| `src/utils/inputUtils.ts` | val, rawValue, handleBlur, event, inputElement |
| `src/utils/utils.test.ts` | randomUUID |
| `src/utils/utils.ts` | generateId |

## Entry Points

- `src/stores/ai.svelte.ts::AiManager.sendMessage`

## Connected Communities

- **services +42 dirs** (27 cross-edges)
- **components/shared +13 dirs** (11 cross-edges)
- **services +14 dirs** (8 cross-edges)
- **services +30 dirs** (8 cross-edges)
- **services +6 dirs · dispatchMessage** (4 cross-edges)
- **stores +1 dirs · find** (3 cross-edges)
- **utils +10 dirs** (3 cross-edges)
- **services +4 dirs · queueSubscription** (3 cross-edges)
- **benchmarks +13 dirs** (2 cross-edges)
- **stores · AiManager** (2 cross-edges)
- **services +5 dirs · ensureHistory** (2 cross-edges)
- **stores +3 dirs** (2 cross-edges)
- **services +6 dirs · encrypt** (2 cross-edges)
- **services +10 dirs · slice** (2 cross-edges)
- **components/settings +1 dirs · removeProvider** (2 cross-edges)
- **server/venues +22 dirs** (1 cross-edges)
- **ai · parseStreamChunk** (1 cross-edges)
- **ai · buildAnthropic** (1 cross-edges)
- **services +3 dirs · verify** (1 cross-edges)
- **services +10 dirs · appFetch** (1 cross-edges)
- **stores · resolveActiveProvider** (1 cross-edges)
- **components/shared +6 dirs · querySelectorAll** (1 cross-edges)
- **. +2 dirs · envVarsIn** (1 cross-edges)
- **services · getModels** (1 cross-edges)
- **ai/prompts +1 dirs** (1 cross-edges)
- **rules +10 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-45")
explore(operation:"context", task:"understand utils +15 dirs", format:"gcx")
relations(operation:"usages", target:{symbol:"src/stores/ai.svelte.ts::AiManager.sendMessage"}, format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
