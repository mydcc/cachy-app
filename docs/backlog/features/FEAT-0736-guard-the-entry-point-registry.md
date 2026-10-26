---
id: FEAT-0736
title: Guard the entry-point registry with a source scan
type: feature
status: in-progress
assignee: opencode
branch: feature/feat-0736-registry-scan
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0731, FEAT-0732, FEAT-0733, FEAT-0734, FEAT-0735]
---

# FEAT-0736 — Guard the entry-point registry with a source scan

## Problem

The four audited surfaces now render from the entry-point registry, but
nothing notices when a later edit reintroduces a local destination: a literal
label key, an inline icon, a hardcoded header id or a direct `uiState` /
`windowManager` open call. The registry tests only exercise the registry
itself, so a surface could quietly stop reading it while every existing test
stays green.

The four local lists themselves (rail, header, journal tab strip, settings
rail) were removed in FEAT-0732 through FEAT-0735. What is missing is the
proof that they stay removed.

This is step 6 and the conclusion of the FEAT-0618 migration.

## Proposal

Add `src/lib/navigation/surface-scan.test.ts`, a source scan over the migrated
surfaces:

- A table of guarded files, each with rules that describe a regression and the
  reason it matters.
- A `violations(source, rules)` helper, used by both the real scan and a
  per-rule self-test. Each rule carries a sample snippet that it must match, so
  a regex that can never fire fails the suite instead of guarding nothing.
- The real scan reads every guarded file and reports `file — reason` for each
  hit.
- Guarded files: `LeftControlPanel.svelte`, `+page.svelte` (journal header
  only), `JournalContent.svelte`, `SettingsContent.svelte`,
  `DashboardNav.svelte`, `TabBar.svelte`, `JournalTabStrip.svelte`,
  `SettingsTabBar.svelte` and `HeaderJournalButton.svelte`.
- The rules forbid: the migrated literal label keys, inline destination
  `<svg>` / `<path>` markup, the stable header ids and telemetry names, and
  direct `uiState` / `windowManager` opener calls where `openEntry` owns the
  action.

`JournalDeepDive.svelte` keeps its ten-preset strip and is deliberately not
scanned: that strip is a host-local view switch, not one of the four audited
surfaces.

## Acceptance criteria

- [ ] The four original local lists are confirmed gone; no production
      behaviour changes are needed for the deletion.
- [ ] `surface-scan.test.ts` guards the rail, header, journal tab strip and
      settings rail, plus the two registry views and the two dumb primitives.
- [ ] Every rule has a sample self-test that fails when the regex stops
      matching.
- [ ] The guarded files pass; a reintroduced local label, icon, id or opener
      fails with the file and the reason.
- [ ] The scan's guarded-file list is asserted, so deleting a row is a test
      failure rather than silent coverage loss.
- [ ] `JournalDeepDive`'s ten presets, settings sub-tabs and the journal main
      Table/Overview/Deep Dive switch are not scanned.
- [ ] Targeted unit test and `npm run check` pass; no new warnings.

## Out of scope

- Migrating the ten-preset journal deep-dive strip or the settings sub-tabs.
- Changing any UI behaviour or visual design.
- A new lint rule or CI job beyond the unit test.

## Links

- Spec: [`assets/FEAT-0618/entry-point-registry.md`](../assets/FEAT-0618/entry-point-registry.md)
- Previous step: [`FEAT-0735`](FEAT-0735-migrate-settings-rail-to-entry-point-registry.md)
- `src/lib/navigation/entry-points.ts`
- `src/lib/navigation/surface-scan.test.ts`
- `src/components/buttonAdoption.test.ts` (source-scan pattern)
