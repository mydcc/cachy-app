---
id: BUG-0790
title: Seven modules and one worker are unreachable but still maintained
type: bug
status: in-progress
priority: P3
milestone: none
editions: [community, pro, private]
area: repo
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: chore/remove-dead-modules
---

# BUG-0790 — Unreachable modules still carry maintenance cost (W1-05, W1-06, W1-11, W1-12, W2M-04)

## Symptom

Dead code that no other file imports, but that every refactoring and every
type check still has to carry: two window classes with no registry entry, a
worker pipeline for a service nothing calls, a visual-bar helper with a
native-`number` money API, two Svelte actions nobody uses, and an empty type
file whose name suggests a second `AppState` definition.

## Evidence

Derived from the 2026-11-03 structure audit (`w1-structure` W1-05/06/11/12,
`w2-money` W2M-04). Verified against `develop` at `72f3d72ec` by importer
search — each row lists every file that mentions the symbol:

- `src/services/aggregatorService.ts` + `src/workers/aggregator.worker.ts` —
  only referenced from each other. The journal analysis runs synchronously
  through `src/lib/calculators/aggregator.ts`, imported by `src/lib/calculator.ts`.
  ADR-0021 and FEAT-0345 describe the worker as the live path; the code says
  otherwise.
- `src/services/uiManager.ts` — `updateVisualBar` and `VisualBarData` have no
  importer. `W2M-04`: the signature takes `entryPrice`/`stopLossPrice`/`price`
  as native `number`, a money API that would need `.toNumber()` to be reused.
- `src/lib/actions/tooltip.ts` — `tooltip` action and `TooltipOptions` have no
  importer and no `use:tooltip` in any component.
- `src/actions/viewport.ts` — `viewport` action has no importer and no
  `use:viewport`.
- `src/lib/types/AppState.ts` — 15-line licence header, no export, no importer;
  `AppState` really lives in `src/stores/types.ts`.
- `src/lib/windows/implementations/ChatWindow.svelte.ts` — `WindowManager`
  imports its windows statically/dynamically by name; `ChatWindow` is not among
  them. Chat opens through `AssistantWindow` (`src/stores/ui.svelte.ts:376`).
  `ChatTestView.svelte` is imported only by this class.
- `src/lib/windows/implementations/NewsFrameWindow.svelte.ts` — news frames
  open through `IframeWindow` (`src/lib/windows/WindowManager.svelte.ts:287`).

## Cause

Screens and helpers were replaced in place; the old module stayed because
nothing failed when it did. Tools that scan for *presence* (`i18n-lint` listed
`uiManager.ts` as an active file) and bug reports that hardened the dead path
(BUG-0725 reworked the aggregator worker lifecycle) kept the illusion alive.

## Fix

Delete the unreachable modules, the worker, and the now-unused aggregator
branch of the worker message guard. Correct the two documents that still
describe the worker as the live analysis path.

## Acceptance criteria

- [ ] All eight files removed together with the aggregator branch of
      `src/workers/workerMessageGuard.ts` and its test block
- [ ] `scripts/i18n-lint.config.json` no longer lists `src/services/uiManager.ts`
- [ ] ADR-0021 and FEAT-0345 name the real journal-analysis path
- [ ] `npm run check` and the touched test files stay green

## Out of scope

- The `chatbox` window *type* stays: it is registered metadata for the window
  rules UI (`WindowRegistry.svelte.ts:337`, `settings.windowRulesTypes.chatbox`),
  independent of the deleted class. Whether a chatbox window should still exist
  is a product question, not a cleanup.
- BUG-0725 keeps its wording: it is a closed report of what was true at the
  time, not a description of the current tree.
- `src/lib/calculators/aggregator.ts` stays; it is the live analysis module.

## Links

- `docs/adr/0021-decimal-money-boundary-display-stays-f64.md`
- `docs/backlog/features/FEAT-0345-indicator-decimal-migration.md`
- `src/lib/windows/WindowManager.svelte.ts`
