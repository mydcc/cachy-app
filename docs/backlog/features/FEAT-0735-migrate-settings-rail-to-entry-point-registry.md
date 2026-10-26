---
id: FEAT-0735
title: Migrate the settings rail to the entry-point registry
type: feature
status: in-progress
assignee: opencode
branch: feature/feat-0735-settings-rail
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0731, FEAT-0732, FEAT-0733, FEAT-0734]
---

# FEAT-0735 — Migrate the settings rail to the entry-point registry

## Problem

`SettingsContent.svelte` still owns the settings window's eight-tab rail:
id, translated label, inner SVG paths and content component in one local
array. The registry already carries the same eight destinations as
`settings-rail` placements with `settings-*` icon keys, but nothing reads
them: the labels, ids and icons can drift, and the icon keys resolve to
nothing.

This is step 5 of the FEAT-0618 migration and the last surface.

## Proposal

- Lift the eight inline SVG path sets out of `SettingsContent` into the
  central icon map as full `settings-*` SVGs. `TabBar` renders the resolved
  `<svg>` directly instead of wrapping caller markup in its own `<svg>`.
- Add `SettingsTabBar.svelte`: it reads
  `getSurfaceEntries("settings-rail", STATIC_ENTRY_CONTEXT)`, maps labels and
  icons, and executes selection through `openEntry(entry, { selectTab })`.
- Keep the content components in `SettingsContent` as a local id → component
  map. The registry models destinations, not tab bodies; the map is validated
  against the registry ids at init.
- Extend the static-context contract to `settings-rail` and pin it in the
  registry tests.
- Update `settingsTabs.test.ts`: the settings sub-tabs keep their source
  checks; the main rail now verifies the registry ids, the content map and the
  `SettingsTabBar` wiring instead of a local `tabs` array.

## Acceptance criteria

- [ ] The rail renders exactly the registry's eight `settings-rail`
      placements, in registry order.
- [ ] Labels and icons come from the entries; `SettingsContent` has no tab
      label keys, icon paths or destination ids left.
- [ ] Every `settings-*` icon key resolves to the same SVG the old inline
      paths drew.
- [ ] Clicking a tab selects it; selection goes through
      `openEntry(entry, { selectTab })`, and a tab opener without the handler
      throws.
- [ ] The content map covers every registry id; a missing component fails at
      init instead of rendering an empty panel.
- [ ] The settings sub-tab pills (Trading, Visuals, AI, Connections, System,
      Indicators) are untouched.
- [ ] Component tests cover order, labels, icons, active state and selection;
      the settings wiring test verifies the content map against the registry.
- [ ] No header, rail or journal-tab behavior changes.

## Out of scope

- Migrating the settings sub-tab pills.
- Changing any settings panel or its layout.
- Arrow-key roving in any tab strip (FEAT-0605 N8).
- The final source scan / local-list deletion (step 6).

## Open questions

None blocking. The registry ids, labels and icon keys already match the
current rail.

## Links

- Spec: [`assets/FEAT-0618/entry-point-registry.md`](../assets/FEAT-0618/entry-point-registry.md)
- Previous steps: [`FEAT-0731`](FEAT-0731-entry-point-registry-data-and-resolver.md),
  [`FEAT-0732`](FEAT-0732-migrate-left-rail-to-entry-point-registry.md),
  [`FEAT-0733`](FEAT-0733-migrate-header-journal-to-entry-point-registry.md),
  [`FEAT-0734`](FEAT-0734-migrate-journal-tab-strip-to-entry-point-registry.md)
- `src/components/settings/SettingsContent.svelte`
- `src/components/settings/TabBar.svelte`
- `src/components/settings/SettingsTabBar.svelte`
- `src/lib/navigation/entry-points.ts`
- `src/lib/navigation/settings-tabs.ts`
- `src/lib/navigation/icons.ts`
