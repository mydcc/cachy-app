---
name: gortex-src-services-26-dirs
description: "Work in the src/services +26 dirs area — 593 symbols across 65 files (68% cohesion)"
---

# src/services +26 dirs

593 symbols | 65 files | 68% cohesion

## When to Use

Use this skill when working on files in:
- ``
- `.worktrees/backlog-jcodemunch/src/hooks.server.ts`
- `.worktrees/backlog-jcodemunch/src/lib/actions/tooltip.ts`
- `.worktrees/backlog-jcodemunch/src/lib/physics/StressLogic.ts`
- `.worktrees/backlog-jcodemunch/src/lib/server/logger.ts`
- `.worktrees/backlog-jcodemunch/src/lib/server/urlValidator.ts`
- `.worktrees/backlog-jcodemunch/src/locales/i18n.ts`
- `.worktrees/backlog-jcodemunch/src/services/activeTechnicals/visibilityController.ts`
- `.worktrees/backlog-jcodemunch/src/services/apiService.ts`
- `.worktrees/backlog-jcodemunch/src/services/app.ts`
- `.worktrees/backlog-jcodemunch/src/services/bitunixWs.ts`
- `.worktrees/backlog-jcodemunch/src/services/cloudService.ts`
- `.worktrees/backlog-jcodemunch/src/services/csvService.ts`
- `.worktrees/backlog-jcodemunch/src/services/dataRepairService.ts`
- `.worktrees/backlog-jcodemunch/src/services/frameSupportService.ts`
- `.worktrees/backlog-jcodemunch/src/services/hotkeyService.ts`
- `.worktrees/backlog-jcodemunch/src/services/rmsService_riskLimits.test.ts`
- `.worktrees/backlog-jcodemunch/src/services/technicalsWorker.ts`
- `.worktrees/backlog-jcodemunch/src/services/toastService.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/services/wasmCalculator.ts`
- `.worktrees/backlog-jcodemunch/src/stores/ai.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/stores/quiz.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/stores/quiz.test.ts`
- `.worktrees/backlog-jcodemunch/src/stores/tpsl.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/stores/tradeStore.test.ts`
- `.worktrees/backlog-jcodemunch/src/stores/ui.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/tests/architecture/exchange_boundary.test.ts`
- `.worktrees/backlog-jcodemunch/src/types/bitunixValidation.ts`
- `.worktrees/backlog-jcodemunch/src/types/dataRequirements.ts`
- `.worktrees/backlog-jcodemunch/src/utils/colors.ts`
- `.worktrees/backlog-jcodemunch/src/utils/inputUtils.ts`
- `.worktrees/backlog-jcodemunch/src/utils/redact.ts`
- `.worktrees/backlog-jcodemunch/src/utils/symbolUtils.ts`
- `.worktrees/backlog-jcodemunch/src/utils/utils.ts`
- `.worktrees/backlog-jcodemunch/tests/benchmarks/safeJson.bench.ts`
- `src/components/results/PlaceOrderPanel.metadata.component.test.ts`
- `src/hooks.server.ts`
- `src/lib/actions/tooltip.ts`
- `src/lib/physics/StressLogic.ts`
- `src/lib/server/logger.ts`
- `src/lib/server/urlValidator.ts`
- `src/locales/i18n.ts`
- `src/services/activeTechnicals/visibilityController.ts`
- `src/services/bitunixWs.ts`
- `src/services/cloudService.ts`
- `src/services/csvService.ts`
- `src/services/frameSupportService.ts`
- `src/services/hotkeyService.ts`
- `src/services/marketWatcher/subscriptionRegistry.ts`
- `src/services/rmsService_riskLimits.test.ts`
- `src/services/wasmCalculator.ts`
- `src/stores/ai.svelte.ts`
- `src/stores/quiz.svelte.ts`
- `src/stores/quiz.test.ts`
- `src/stores/tradeStore.test.ts`
- `src/stores/ui.svelte.ts`
- `src/tests/architecture/exchange_boundary.test.ts`
- `src/types/bitunixValidation.ts`
- `src/types/dataRequirements.ts`
- `src/utils/colors.ts`
- `src/utils/inputUtils.ts`
- `src/utils/redact.ts`
- `src/utils/symbolUtils.ts`
- `src/utils/utils.ts`
- `tests/benchmarks/safeJson.bench.ts`

## Key Files

| File | Symbols |
|------|---------|
| `` | substring, endsWith, startsWith, replace, entries, ... |
| `.worktrees/backlog-jcodemunch/src/hooks.server.ts` | response.transformPageChunk, bodyClass |
| `.worktrees/backlog-jcodemunch/src/lib/actions/tooltip.ts` | updatePosition |
| `.worktrees/backlog-jcodemunch/src/lib/physics/StressLogic.ts` | path, ammoInstance.locateFile |
| `.worktrees/backlog-jcodemunch/src/lib/server/logger.ts` | sanitizeString, kvRegex, key, s, lowerKey, ... |
| `.worktrees/backlog-jcodemunch/src/lib/server/urlValidator.ts` | hostname, match, lower, octets, b, ... |
| `.worktrees/backlog-jcodemunch/src/locales/i18n.ts` | setNestedValue, value, keys, obj, current, ... |
| `.worktrees/backlog-jcodemunch/src/services/activeTechnicals/visibilityController.ts` | symbol, timerId, activeSymbol, pauseNonCriticalCalculations, key |
| `.worktrees/backlog-jcodemunch/src/services/apiService.ts` | priority, rawSymbol, timeout, apiService.fetchBitunixFundingRateHistory, key, ... |
| `.worktrees/backlog-jcodemunch/src/services/app.ts` | index, currentTargets, currentSize, app.togglePositionSizeLock, isLocked, ... |
| `.worktrees/backlog-jcodemunch/src/services/bitunixWs.ts` | subExists, queueSubscription, symbol, op, unsubExists, ... |
| `.worktrees/backlog-jcodemunch/src/services/cloudService.ts` | senderIdOf, identity |
| `.worktrees/backlog-jcodemunch/src/services/csvService.ts` | str, csvService.cleanCSVValue, regex, csvService.splitCSV, val |
| `.worktrees/backlog-jcodemunch/src/services/dataRepairService.ts` | dataRepairService.scanForMissingMfeMae, trades, t, count, dataRepairService.scanForMissingAtr, ... |
| `.worktrees/backlog-jcodemunch/src/services/frameSupportService.ts` | constructor, loadCache, urlStr, v, pendingChecks, ... |
| `.worktrees/backlog-jcodemunch/src/services/hotkeyService.ts` | nextIndex, HOTKEY_ACTIONS.action, count, HOTKEY_ACTIONS.action, activeElement, ... |
| `.worktrees/backlog-jcodemunch/src/services/rmsService_riskLimits.test.ts` | journalState.entries |
| `.worktrees/backlog-jcodemunch/src/services/technicalsWorker.ts` | key, oldestTime, state, oldestKey, enforceLimit |
| `.worktrees/backlog-jcodemunch/src/services/toastService.svelte.ts` | id, remove |
| `.worktrees/backlog-jcodemunch/src/services/wasmCalculator.ts` | upper, len, parts, stochGroups, macdGroups, ... |
| `.worktrees/backlog-jcodemunch/src/stores/ai.svelte.ts` | newIdx, confirmNeeded, idx, currentTargets, e, ... |
| `.worktrees/backlog-jcodemunch/src/stores/quiz.svelte.ts` | e, text, cards, regex, cat, ... |
| `.worktrees/backlog-jcodemunch/src/stores/quiz.test.ts` | text |
| `.worktrees/backlog-jcodemunch/src/stores/tpsl.svelte.ts` | hasPlansFor, symbol |
| `.worktrees/backlog-jcodemunch/src/stores/tradeStore.test.ts` | targets, filterLogic |
| `.worktrees/backlog-jcodemunch/src/stores/ui.svelte.ts` | expires, expectedClass, e, applyThemeToDom, bgColor, ... |
| `.worktrees/backlog-jcodemunch/src/tests/architecture/exchange_boundary.test.ts` | specifier, found, tail, Breach, findBreaches, ... |
| `.worktrees/backlog-jcodemunch/src/types/bitunixValidation.ts` | sanitizeSymbol, symbol |
| `.worktrees/backlog-jcodemunch/src/types/dataRequirements.ts` | requirement, getChannelsForRequirement |
| `.worktrees/backlog-jcodemunch/src/utils/colors.ts` | hex, n, hexToRgba, alpha, c |
| `.worktrees/backlog-jcodemunch/src/utils/inputUtils.ts` | sanitizedValue, value, event, newCursorPosition, getDecimalPlaces, ... |
| `.worktrees/backlog-jcodemunch/src/utils/redact.ts` | redactString, out, input |
| `.worktrees/backlog-jcodemunch/src/utils/symbolUtils.ts` | symbol, formatSymbolForDisplay |
| `.worktrees/backlog-jcodemunch/src/utils/utils.ts` | hasComma, suffix, unit, val, lastDot, ... |
| `.worktrees/backlog-jcodemunch/tests/benchmarks/safeJson.bench.ts` | safeJsonParseLegacy, jsonString, protectedJson |
| `src/components/results/PlaceOrderPanel.metadata.component.test.ts` | key, lookup |
| `src/hooks.server.ts` | response.transformPageChunk, bodyClass |
| `src/lib/actions/tooltip.ts` | updatePosition |
| `src/lib/physics/StressLogic.ts` | path, ammoInstance.locateFile |
| `src/lib/server/logger.ts` | key, sanitizeString, s, isSensitiveKey, str, ... |
| `src/lib/server/urlValidator.ts` | lower, b, ipv4Regex, cleanHost, hostname, ... |
| `src/locales/i18n.ts` | obj, getNestedValue, path, i, keys, ... |
| `src/services/activeTechnicals/visibilityController.ts` | pauseNonCriticalCalculations, activeSymbol, key, timerId, symbol |
| `src/services/bitunixWs.ts` | channel, newCount, symbol, count, queueSubscription, ... |
| `src/services/cloudService.ts` | identity, senderIdOf |
| `src/services/csvService.ts` | regex, csvService.splitCSV, str, csvService.cleanCSVValue, val |
| `src/services/frameSupportService.ts` | pendingChecks, raw, v, cache, domain, ... |
| `src/services/hotkeyService.ts` | activeElement, HOTKEY_ACTIONS.action, count, currentIndex, targets, ... |
| `src/services/marketWatcher/subscriptionRegistry.ts` | syncSubscriptions, normSymbol, count, register, channel, ... |
| `src/services/rmsService_riskLimits.test.ts` | journalState.entries |
| `src/services/wasmCalculator.ts` | action, vals, len, params, base, ... |
| `src/stores/ai.svelte.ts` | mult, action, newIdx, executeAction, e, ... |
| `src/stores/quiz.svelte.ts` | e, cards, response, lines, FlashCard, ... |
| `src/stores/quiz.test.ts` | text |
| `src/stores/tradeStore.test.ts` | targets, filterLogic |
| `src/stores/ui.svelte.ts` | isLightTheme, themeName, expectedClass, themeName, e, ... |
| `src/tests/architecture/exchange_boundary.test.ts` | found, specifier, tail, file, lines, ... |
| `src/types/bitunixValidation.ts` | symbol, sanitizeSymbol |
| `src/types/dataRequirements.ts` | requirement, getChannelsForRequirement |
| `src/utils/colors.ts` | alpha, hex, hexToRgba, c, n |
| `src/utils/inputUtils.ts` | value, updateStickyPrecision, newCursorPosition, value, char, ... |
| `src/utils/redact.ts` | redactString, input, out |
| `src/utils/symbolUtils.ts` | formatSymbolForDisplay, symbol |
| `src/utils/utils.ts` | hasDot, value, parts, unsafe, lastDot, ... |
| `tests/benchmarks/safeJson.bench.ts` | safeJsonParseLegacy, jsonString, protectedJson |

## Connected Communities

- **services +30 dirs** (29 cross-edges)
- **src/utils +14 dirs** (22 cross-edges)
- **services +8 dirs** (18 cross-edges)
- **lib/calculators +24 dirs** (18 cross-edges)
- **calculators +6 dirs** (13 cross-edges)
- **src/services +21 dirs** (13 cross-edges)
- **src/services +11 dirs** (10 cross-edges)
- **src/services +33 dirs** (9 cross-edges)
- **backlog-jcodemunch/src · calculateIndicatorsFromArrays** (9 cross-edges)
- **src/stores +4 dirs · ResultsManager** (6 cross-edges)
- **services +3 dirs · set** (4 cross-edges)
- **services +1 dirs · delete** (4 cross-edges)
- **stores +1 dirs · RiskManager** (4 cross-edges)
- **. +3 dirs · syncProjectKanbanStatus** (4 cross-edges)
- **services +9 dirs** (3 cross-edges)
- **services · processPublicMessageQueue** (3 cross-edges)
- **backlog-jcodemunch/src · syncService.syncBitunixPositions** (3 cross-edges)
- **calculators +2 dirs** (3 cross-edges)
- **lib/server +38 dirs** (2 cross-edges)
- **. +2 dirs · focusElement** (2 cross-edges)
- **services +4 dirs · ensureHistory** (2 cross-edges)
- **services +3 dirs · processNext** (2 cross-edges)
- **services · get** (2 cross-edges)
- **utils/server +16 dirs** (2 cross-edges)
- **src/services +2 dirs** (2 cross-edges)
- **lib/windows +10 dirs** (2 cross-edges)
- **src/stores +4 dirs · error** (2 cross-edges)
- **services +4 dirs · syncService.syncBitunixPositions** (1 cross-edges)
- **src/services · calculate** (1 cross-edges)
- **services +2 dirs · warn** (1 cross-edges)
- **backlog-jcodemunch/src · map** (1 cross-edges)
- **services · calculate** (1 cross-edges)
- **services +1 dirs · attemptDecrypt** (1 cross-edges)
- **utils +1 dirs · toNumFast** (1 cross-edges)
- **services · runBenchmark** (1 cross-edges)
- **backlog-jcodemunch/src · runBenchmark** (1 cross-edges)
- **backlog-jcodemunch/src · toNumFast** (1 cross-edges)
- **backlog-jcodemunch/src · parseDecimal** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-414")
explore(operation:"context", task:"understand src/services +26 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
