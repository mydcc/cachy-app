---
id: FEAT-0732
title: Migrate the left rail to the entry-point registry
type: feature
status: done
assignee: opencode
branch: feature/feat-0732-left-rail-registry
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0731]
---

# FEAT-0732 — Migrate the left rail to the entry-point registry

## Problem

`LeftControlPanel.svelte` still owns its destination list: ten hardcoded
buttons with local labels, local inline SVGs, local open calls and local active
classes. The registry from FEAT-0731 exists but nothing reads it, so the rail
and the registry can drift immediately.

This is step 2 of the FEAT-0618 migration. It changes one surface only.

## Proposal

Render the rail from `getSurfaceEntries("rail", context)`:

- add a small `activeWhen` condition to the registry placement so the active
  state stays data-driven;
- add a rail icon map for the registry icon keys (the existing `icons.*`
  constants plus the inline SVGs lifted from `LeftControlPanel`);
- add one `openEntry` adapter that maps `Opener` descriptors to the existing
  `uiState` / `windowManager` / settings calls;
- keep the current grouping and separator: destinations first, panel toggles
  after;
- keep the Academy quiz-progress decoration and the journal restore behavior;
- preserve the existing telemetry names.

The rail must behave exactly as before. This is a migration, not a redesign;
BUG-0715's hidden panel preconditions stay open.

## Acceptance criteria

- [x] The rail renders exactly the registry's `rail` placements: 9 entries
      normally and 10 while the journal is minimized.
- [x] Labels, titles, `aria-label`s and icons come from the entry/icon map;
      `LeftControlPanel.svelte` has no destination list, literal label or
      inline destination SVG left.
- [x] Clicking each entry performs the previous action: opens the dashboard,
      settings, alerts, academy or assistant; restores a minimized journal;
      toggles technicals, market overview, activity or sentiment.
- [x] The active classes for assistant, technicals, market overview, activity
      and sentiment match the previous behavior.
- [x] The Academy quiz-progress decoration still renders around the academy
      button.
- [x] Telemetry event names are unchanged.
- [x] Every rendered control is a native button with an accessible name and
      stays in DOM order; no pointer-only entry is introduced.
- [x] New component tests cover the surface inventory, one representative
      open/toggle per opener kind, the minimized-journal restore, the active
      classes and the accessible names.
- [x] No header, journal-strip, settings-rail or registry-surface behavior is
      changed.

## Progress

The rail is now a registry view. `LeftControlPanel` builds the `EntryContext`
from the settings, entitlement, account, window and UI stores, then renders
`getSurfaceEntries("rail", context)` in two groups (destinations, panels). The
open calls moved into `src/lib/navigation/open-entry.ts`; the rail no longer
imports `uiState` for opening, and the destination SVGs moved to
`src/lib/navigation/icons.ts`.

The registry gained `Placement.activeWhen` and `SurfaceEntry.active` so the
existing selected classes remain data-driven. Active conditions cover
assistant, technicals, market overview, activity, sentiment and the
minimized-journal shortcut. `LeftControlPanel` deliberately does not bind
`disabled` from `enabled`: the old rail had no disabled state, and disabling a
toggle when its underlying flag is off would make it impossible to turn on.
BUG-0715 stays open.

Tests: 14 registry cases (including the active states) and 8 rail component
cases (inventory, dashboard/toggle wiring, active classes, journal restore,
accessible names, plus the existing FEAT-0389 bell cases). Targeted tests and
`npm run check` pass; the header, journal strip and settings rail are untouched.

## Out of scope

- Migrating the header, journal tab strip or settings rail.
- Arrow-key roving in any tab strip.
- Centralising the settings-tab icons; this step only needs rail icons.
- Fixing BUG-0715 (hidden rail preconditions).
- Changing what any rail entry does, its order, or its visual design.

## Open questions

None blocking. The registry contract is fixed; `activeWhen` is the only
addition needed for the existing visual state.

## Links

- Spec: [`assets/FEAT-0618/entry-point-registry.md`](../assets/FEAT-0618/entry-point-registry.md)
- Parent data item: [`FEAT-0731`](FEAT-0731-entry-point-registry-data-and-resolver.md)
- `src/components/shared/LeftControlPanel.svelte`
- `src/components/shared/LeftControlPanel.component.test.ts`
- `src/lib/navigation/entry-points.ts`
