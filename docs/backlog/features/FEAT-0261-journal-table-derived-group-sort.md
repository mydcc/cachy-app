---
id: FEAT-0261
title: Hoist JournalTable group sorting out of the each expression into derived state
type: feature
status: ready
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# FEAT-0261 — Hoist JournalTable group sorting out of the each expression into derived state

## Problem

`src/components/shared/journal/JournalTable.svelte` (~L757) calls
`sortTradesList(group.trades, internalSortField, internalSortDirection)`
directly inside a `{#each}` expression — expanded groups re-sort on every
render pass. This contradicts the project's own performance rule (AGENTS.md:
no heavy sort/filter/map in templates; prepare with `$derived`). The file is
otherwise correct (`paginatedTrades` is already `$derived.by`, ~L147).

Evidence basis: read directly in code; cost scales with expanded groups ×
trades per group. Not runtime-profiled (Architect review, 2026-08-23).

## Proposal

Hoist the sort into `$derived` state keyed by group + sort field + direction
(e.g., a `Map` keyed by group id), or sort once while building the grouped
rows.

## Acceptance criteria

- [ ] No function call that sorts inside any `{#each}` expression in the file.
- [ ] Visible ordering behavior unchanged (component test evidence).
- [ ] `npm run check` and `JournalTable.component.test.ts` pass.

## Out of scope

- Table virtualization or pagination changes.
- Any decimal.js/amount handling in the table.

## Open questions

None.

## Links

- `src/components/shared/journal/JournalTable.svelte`
- Source: Autonomous Optimization Architect review, 2026-08-23.
