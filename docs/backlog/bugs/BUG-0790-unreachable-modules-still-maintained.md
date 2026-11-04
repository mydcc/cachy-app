---
id: BUG-0790
title: Nine unreachable files and one dead analysis function still carry maintenance cost
type: bug
status: done
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
search — each row lists every file that mentioned the symbol:

- `src/services/aggregatorService.ts` + `src/workers/aggregator.worker.ts` —
  referenced only from each other. Nothing called the service; the journal UI
  builds its statistics from `calculator.getJournalContext(...)` in
  `src/stores/journal.svelte.ts:309,341`. ADR-0021 and FEAT-0345 described the
  worker as the live path; the code said otherwise.
- `src/services/uiManager.ts` — `updateVisualBar` and `VisualBarData` had no
  importer. `W2M-04`: the signature took `entryPrice`/`stopLossPrice`/`price`
  as native `number`, a money API that would need `.toNumber()` to be reused.
- `src/lib/actions/tooltip.ts` — `tooltip` action and `TooltipOptions` had no
  importer and no `use:tooltip` in any component.
- `src/actions/viewport.ts` — `viewport` action had no importer and no
  `use:viewport`.
- `src/lib/types/AppState.ts` — 16-line licence header, no export, no importer;
  `AppState` really lives in `src/stores/types.ts`.
- `src/lib/windows/implementations/ChatWindow.svelte.ts` — `WindowManager`
  imports its windows statically or by literal-name dynamic import;
  `ChatWindow` was not among them. Chat opens through `AssistantWindow`
  (`src/stores/ui.svelte.ts:376`). `ChatTestView.svelte` was imported only by
  this class, and its locale keys `chat.placeholder`/`chat.send` by nothing
  else.
- `src/lib/windows/implementations/NewsFrameWindow.svelte.ts` — news frames
  open through `IframeWindow` (`src/lib/windows/WindowManager.svelte.ts:287`).

`src/lib/calculators/aggregator.ts:76` (`getJournalAnalysis`) was reached only
from the two deleted files. `calculator.ts` imported and re-exported it, but
nothing called it — the journal builds each metric individually from
`getJournalContext`.

## Cause

Screens and helpers were replaced in place; the old module stayed because
nothing failed when it did. Tools that scan for *presence* (`i18n-lint` listed
`uiManager.ts` as an active file) and a bug report that hardened the dead path
(BUG-0725 reworked the aggregator worker lifecycle) kept the illusion alive.

## Fix

Delete the nine unreachable files, the aggregator branch of the worker message
guard, and the uncalled `getJournalAnalysis` (plus its import, object entry and
re-export in `src/lib/calculator.ts`). Correct the documents that still
describe the worker as the live analysis path or the deleted module as a live
caller.

## Acceptance criteria

- [x] All nine files removed, together with the aggregator branch of
      `src/workers/workerMessageGuard.ts` and its test block
- [x] `getJournalAnalysis` and its three references in `src/lib/calculator.ts`
      removed; the metric functions it called stay live through
      `src/stores/journal.svelte.ts`
- [x] `scripts/i18n-lint.config.json` no longer lists `src/services/uiManager.ts`
- [x] ADR-0021, FEAT-0345, ARCHITECTURE.md, ADR-0006 and TODO.md describe the
      tree as it is — no surviving claim names `aggregatorService`,
      `aggregator.worker`, `uiManager.showReadme()` or the removed windows
- [x] `chat.placeholder` / `chat.send` removed from both locales and
      `src/locales/schema.d.ts`
- [x] `npm run check`, `npm run backlog:check` and the touched test files stay
      green

## Out of scope

- `chatbox` is still a selectable window-rule target although nothing can
  produce that window type — moved to BUG-0793, because removing it from
  `WindowRuleType` also needs a decision about already-stored rules.
- The `news` entry in `WindowRegistry.svelte.ts` is likewise orphaned (news
  opens as `iframe`); same follow-up item.
- BUG-0725 keeps its wording: it is a closed report of what was true at the
  time, not a description of the current tree.

## Links

- `docs/adr/0021-decimal-money-boundary-display-stays-f64.md`
- `docs/adr/0006-one-window-stacking-authority.md`
- `docs/backlog/features/FEAT-0345-indicator-decimal-migration.md`
- `docs/backlog/bugs/BUG-0793-dead-window-rule-targets.md`
- `src/lib/windows/WindowManager.svelte.ts`
