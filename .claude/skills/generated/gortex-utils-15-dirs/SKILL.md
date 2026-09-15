---
name: gortex-utils-15-dirs
description: "Work in the utils +15 dirs area — 266 symbols across 29 files (66% cohesion)"
---

# utils +15 dirs

266 symbols | 29 files | 66% cohesion

## When to Use

Use this skill when working on files in:
- ``
- `scripts/lib/backlog-flip.ts`
- `scripts/lib/markdown-text.ts`
- `scripts/lib/pr-issue-match.ts`
- `scripts/sync-github-issues.ts`
- `scripts/worktree-cleanup.squash.test.ts`
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
| `` | race, parseInt, trim, match |
| `scripts/lib/backlog-flip.ts` | match, match, readStatus, content, num, ... |
| `scripts/lib/markdown-text.ts` | fence, lines, line, kept, stripCodeBlocks, ... |
| `scripts/lib/pr-issue-match.ts` | body, closingReferences, scanned, parsed, found, ... |
| `scripts/sync-github-issues.ts` | start_date, editionsMatch, assigneesMatch, target_date, depends_on, ... |
| `scripts/worktree-cleanup.squash.test.ts` | tip, ref |
| `src/components/alerts/tabs/ManageTab.component.test.ts` | el, listTabs |
| `src/components/settings/AiModelPicker.svelte` | Props |
| `src/components/settings/AiProviderManager.svelte` | activate, id, AiProviderManager |
| `src/components/settings/EngineDebugPanel.component.test.ts` | text |
| `src/components/shared/ActiveAccountChip.component.test.ts` | text |
| `src/components/shared/JournalContent.svelte` | updateThemeColors |
| `src/lib/ai/directRequest.ts` | DirectModelsRequest, DirectModelsParams, url, buildDirectModelsRequest, headers, ... |
| `src/lib/ai/streamAdapters.ts` | buffer, flavor, fragment, appendToolCallFragment, StreamUsage |
| `src/lib/alerts/indicatorConditionForm.ts` | committedWindowLookback, previous, raw, value |
| `src/lib/notifications/externalChannels.ts` | config, value, validateEmail, parsed, config, ... |
| `src/lib/server/ollamaBaseUrl.ts` | raw, usesConfiguredDefault |
| `src/lib/windows/zLayers.test.ts` | match, readCssVar, name |
| `src/services/backupService.ts` | cleaned, raw, validateTheme |
| `src/services/chartPatterns.locales.test.ts` | nonEmpty, value |
| `src/stores/ai.svelte.ts` | trimmed, price, userProvider, err, parseActions, ... |
| `src/stores/externalChannels.svelte.ts` | problem, channel |
| `src/stores/settings/accounts.ts` | existing, taken, newAccountId, id |
| `src/stores/settings/aiProviders.ts` | flavor, isLoopbackBaseUrl, AiApiFlavor, baseUrl, BuiltinDef, ... |
| `src/tests/architecture/exchange_boundary.test.ts` | lines, findDirectChannelCalls, source, tail, segments, ... |
| `src/utils/colors.ts` | element, getComputedColor, value, variableName, target |
| `src/utils/inputUtils.ts` | rawValue, val, event, inputElement, handleBlur |
| `src/utils/utils.test.ts` | randomUUID |
| `src/utils/utils.ts` | generateId |

## Entry Points

- `src/stores/ai.svelte.ts::AiManager.sendMessage`

## Connected Communities

- **services +46 dirs** (27 cross-edges)
- **components/shared +13 dirs** (11 cross-edges)
- **services +15 dirs** (8 cross-edges)
- **services +29 dirs** (8 cross-edges)
- **services +6 dirs · dispatchMessage** (4 cross-edges)
- **utils +10 dirs** (3 cross-edges)
- **services +4 dirs · queueSubscription** (3 cross-edges)
- **stores +1 dirs · find** (3 cross-edges)
- **components/settings +1 dirs · removeProvider** (2 cross-edges)
- **benchmarks +11 dirs** (2 cross-edges)
- **services +6 dirs · ensureHistory** (2 cross-edges)
- **services +10 dirs · slice** (2 cross-edges)
- **stores +3 dirs · MarketManager** (2 cross-edges)
- **stores · AiManager** (2 cross-edges)
- **services +5 dirs · encrypt** (2 cross-edges)
- **server/venues +16 dirs** (1 cross-edges)
- **ai · parseStreamChunk** (1 cross-edges)
- **services +10 dirs · appFetch** (1 cross-edges)
- **ai · buildAnthropic** (1 cross-edges)
- **rules +9 dirs** (1 cross-edges)
- **components/shared +6 dirs · querySelectorAll** (1 cross-edges)
- **stores · resolveActiveProvider** (1 cross-edges)
- **ai/prompts +1 dirs** (1 cross-edges)
- **services +3 dirs · verify** (1 cross-edges)
- **. +2 dirs · envVarsIn** (1 cross-edges)
- **services · getModels** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-38")
explore(operation:"context", task:"understand utils +15 dirs", format:"gcx")
relations(operation:"usages", target:{symbol:"src/stores/ai.svelte.ts::AiManager.sendMessage"}, format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
