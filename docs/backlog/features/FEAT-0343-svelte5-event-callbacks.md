---
id: FEAT-0343
title: "Migrate legacy Svelte 4 createEventDispatcher to Svelte 5 callbacks"
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
parent: FEAT-0341
---

## Problem
`AGENTS.md` strictly forbids legacy Svelte 4 syntax and mandates Svelte 5 Runes. Currently, 8 components still use the deprecated `createEventDispatcher`:
- `CalendarHeatmap.svelte`
- `TimeframeSelector.svelte`
- `TakeProfitTargets.svelte`
- `TakeProfitRow.svelte`
- `SummaryResults.svelte`
- `TradeSetupInputs.svelte`
- `PortfolioInputs.svelte`

## Fix
Replace all usages of `createEventDispatcher` with callback properties passed via `$props()` (e.g., `onclick`, `onchange`).

## Acceptance criteria
- [ ] `createEventDispatcher` is completely removed from all `.svelte` and `.ts` files in the `src` directory.
- [ ] The identified components successfully trigger events via callback props.
- [ ] `npm run check` passes with no warnings related to event dispatching.
- [ ] Component tests pass.

## Out of scope
- Refactoring other legacy syntax (like `<slot>` or `export let`), unless they are in the exact same files and trivial to fix.
- Changing component visual styling.
