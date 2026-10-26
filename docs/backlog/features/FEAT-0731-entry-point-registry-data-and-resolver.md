---
id: FEAT-0731
title: Add the entry-point registry data and surface resolver
type: feature
status: in-progress
assignee: opencode
branch: feature/feat-0731-registry-data
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0618]
---

# FEAT-0731 — Add the entry-point registry data and surface resolver

## Problem

FEAT-0618 specified one registry for the four navigation surfaces, but no code
exists yet. The surfaces still carry their own lists, labels and open logic.
Before any surface can be migrated, the registry needs a single source of data,
a typed contract, a pure condition evaluator and a surface resolver that can be
tested without mounting UI.

This is step 1 of the five-step migration in
[`assets/FEAT-0618/entry-point-registry.md`](../assets/FEAT-0618/entry-point-registry.md).
No surface is migrated here.

## Proposal

Add `src/lib/navigation/entry-points.ts` with:

- the contract types from the FEAT-0618 spec (`Entry`, `Placement`, `Opener`,
  `Condition`, `KeyboardRoute`, `SurfaceId`);
- the 23 entries (10 global, 5 journal tabs, 8 settings tabs) with the labels,
  icon keys, openers and placements recorded in the spec;
- `evaluateCondition(condition, context)` — a pure evaluator for every
  condition token, with no store imports;
- `getSurfaceEntries(surface, context)` — returns only visible placements,
  sorted by `order`, with their enabled state.

The module is data and pure functions only. It does not import `uiState`,
`windowManager`, the router or any Svelte component. The side-effectful
`openEntry` adapter and the surface migrations are follow-ups.

The test suite validates the data (unique IDs, labels in both locales, parent
links, surface/order uniqueness, keyboard routes) and the evaluator/resolver
(conditions, journal-rail visibility, surface counts). The existing locale
files are the source for the label check.

## Acceptance criteria

- [x] `entry-points.ts` exports the contract types and the 23 entries; no entry
      contains a literal label or an inline SVG.
- [x] Every label/title/description key exists in both `en.json` and `de.json`.
- [x] Every entry has a unique ID, an icon key, an opener, at least one
      placement and a keyboard route per placement; no route is `none`.
- [x] Tab entries have an existing `parent` and a `tab` opener; surface and
      order are unique per `(surface, group)`.
- [x] `evaluateCondition` covers `always`, `all`, `any`, `not`, `setting`,
      `entitlement`, `account`, `window`, `viewport`, `state`, `derived` and
      `data`, with tests for each family.
- [x] `getSurfaceEntries` returns 9 rail entries normally and 10 when the
      journal is minimized, 1 header entry, 5 journal tabs and 8 settings tabs.
- [x] Tests are pure (no component mount, no store import) and run in the
      `unit` Vitest project.
- [x] No component, route or store file is changed by this item.

## Progress

`src/lib/navigation/entry-points.ts` contains the contract types, the 23
entries and the pure `evaluateCondition` / `getSurfaceEntries` functions.
There is no store, router or component import; the `Settings` and
`TranslationKey` imports are type-only.

`src/lib/navigation/entry-points.test.ts` has 13 cases: the 23-entry inventory,
both locale dictionaries, unique IDs and parent links, placement order and
keyboard routes, all four surface counts (including the minimized-journal rail
case), and every condition family. Targeted run passes; ESLint is clean and
`npm run check` reported 0 errors.

No component, route or store file changed. Remaining FEAT-0618 steps are
surface migrations and the `openEntry` adapter; they are not part of this item.

## Out of scope

- Migrating the left rail, header, journal strip or settings rail.
- The `openEntry` adapter and any calls into `uiState`/`windowManager`.
- Lifting the local rail/settings SVGs into the central icon map; the registry
  stores icon keys only.
- Arrow-key roving in the tab strips.
- Creating the remaining four migration items.

## Open questions

None blocking. The contract is fixed by FEAT-0618; implementation details that
surface during the first migration belong there, not in this data-only step.

## Links

- Spec: [`assets/FEAT-0618/entry-point-registry.md`](../assets/FEAT-0618/entry-point-registry.md)
- Parent: [`FEAT-0618`](FEAT-0618-entry-point-registry-and-window-manager-scope.md)
- `src/components/shared/LeftControlPanel.svelte`
- `src/components/shared/DashboardNav.svelte`
- `src/components/settings/SettingsContent.svelte`
- `src/routes/+page.svelte`
