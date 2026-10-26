---
id: FEAT-0734
title: Migrate the journal tab strip to the entry-point registry
type: feature
status: in-progress
assignee: opencode
branch: feature/feat-0734-journal-tabs
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0731, FEAT-0732, FEAT-0733]
---

# FEAT-0734 — Migrate the journal tab strip to the entry-point registry

## Problem

`DashboardNav.svelte` still owns a default five-tab list with literal label
keys and icon constants:

- `performance`, `quality`, `direction`, `discipline`, `costs`.

`JournalContent` renders that default strip above `JournalCharts`, so the
journal's chart-preset navigation is declared in the component while the
registry already carries the same five entries as `journal-tabs` placements.
Either copy can drift from the other.

This is step 4 of the FEAT-0618 migration. The journal's main
Table/Overview/Deep Dive switch and `JournalDeepDive`'s ten-preset strip are
different surfaces and stay untouched.

## Proposal

- Make `DashboardNav` a dumb tab bar: `presets` becomes required, the default
  list and its label/icon imports leave the component.
- Add `JournalTabStrip.svelte` next to the journal components. It reads
  `getSurfaceEntries("journal-tabs", staticContext)`, maps each entry to
  `{ id: tabId, label, icon }` and renders `DashboardNav`.
- Execute selection through `openEntry(entry, { selectTab })` so the tab
  opener stays in the one adapter; the host supplies the setter because the
  selected tab is host-local state.
- Share the condition-free `EntryContext` between the header and this strip
  (`STATIC_ENTRY_CONTEXT`) and pin both surfaces as context-free in the
  registry tests.
- Keep `JournalDeepDive`'s custom ten-preset list, its ids and its labels.

## Acceptance criteria

- [ ] The strip renders exactly the registry's five `journal-tabs`
      placements, in registry order.
- [ ] Labels, icons and tab ids come from the entries; `DashboardNav` has no
      default preset list and no journal label keys left.
- [ ] The ids `performance`, `quality`, `direction`, `discipline`, `costs` and
      the existing active styling are unchanged.
- [ ] Clicking a tab selects it; selection goes through
      `openEntry(entry, { selectTab })`.
- [ ] A tab opener without a `selectTab` handler throws instead of silently
      doing nothing.
- [ ] The journal's main tab switch and `JournalDeepDive`'s ten-preset strip
      are untouched.
- [ ] Component tests cover order, labels, icons, active state and selection;
      adapter tests cover the tab handler and the missing-handler error.
- [ ] No header, rail or settings-rail behavior changes.

## Out of scope

- Migrating the settings rail.
- Migrating the journal's main Table/Overview/Deep Dive switch.
- Migrating `JournalDeepDive`'s ten presets.
- Arrow-key roving in any tab strip (FEAT-0605 N8).
- Changing what any journal tab renders.

## Open questions

None blocking. The registry already matches the five default ids and labels.

## Links

- Spec: [`assets/FEAT-0618/entry-point-registry.md`](../assets/FEAT-0618/entry-point-registry.md)
- Previous steps: [`FEAT-0731`](FEAT-0731-entry-point-registry-data-and-resolver.md),
  [`FEAT-0732`](FEAT-0732-migrate-left-rail-to-entry-point-registry.md),
  [`FEAT-0733`](FEAT-0733-migrate-header-journal-to-entry-point-registry.md)
- `src/components/shared/DashboardNav.svelte`
- `src/components/shared/JournalContent.svelte`
- `src/components/shared/journal/JournalTabStrip.svelte`
- `src/lib/navigation/entry-points.ts`
- `src/lib/navigation/open-entry.ts`
