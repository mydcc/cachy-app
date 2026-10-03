---
id: FEAT-0610
title: Adopt the button primitive across the settings tabs
type: feature
status: ready
priority: P2
milestone: none
created: "2026-10-03"
editions: [community, pro, private]
area: ui
parent: FEAT-0604
data_class: none
adr: none
depends_on: [FEAT-0607, FEAT-0609]
---

# FEAT-0610 — Adopt the button primitive across the settings tabs

The settings window holds the largest number of hand-styled buttons after the
app shell. It is also the window the density control will appear in, so its
control heights need to be uniform before a density mode can claim they are.

## Problem

The settings tree renders buttons by hand in every one of its 29 components
and 16 tab modules. They use the six vertical paddings counted in the audit, in
whatever combination each author needed.

Two things follow. The settings window has no single button appearance, and it
will not accept a density mode: a mode that sets control height reaches
components that do not use a control height.

## Proposal

Migrate every `<button>` under `src/components/settings/` to the primitive
from [FEAT-0609](FEAT-0609-extend-and-adopt-the-button-primitive.md), and add a
check that keeps new buttons on it.

Where a "button" is actually a tab, a toggle row, or a segmented control, it
stays what it is and the reason is recorded — those are different components,
not unadopted buttons.

## Acceptance criteria

- [ ] Every `<button>` in `src/components/settings/` renders through
      `Button.svelte`, or carries a comment naming the component it belongs to
      instead (tab rail, toggle row, segmented control)
- [ ] The `VisualsTab` sub-tab pills render through the tab-bar component
      decided in [FEAT-0606](FEAT-0606-harmonize-settings-hierarchy-and-tab-naming.md),
      not through hand-written classes
- [ ] Every migrated button's height comes from the control-geometry tokens
- [ ] No `!important` is added by this item
- [ ] A check fails on a raw `<button>` under `src/components/settings/` that
      does not go through the primitive, with an escape comment recognised
- [ ] All settings component tests still pass, and the settings window renders
      identically to `develop` at default settings
- [ ] The settings window is checked at a width below 560 px and above 960 px,
      because the migration touches the same components the grid work did

## Out of scope

- Changing which settings exist, what they are called, or where they sit.
- The `Toggle.svelte` component and `label.toggle-card` rows, which are a
  distinct control and stay as they are.
- Migrating buttons outside `src/components/settings/`.
- Density. This item makes the settings window *ready* for it.

## Open questions

- `AiProviderManager` and `ConnectionsTab` carry provider management controls
  that are close to primary actions. If they need a variant the primitive does
  not have, the variant is added in FEAT-0609 rather than worked around here.

## Links

- Evidence: [`assets/FEAT-0604/ui-zustandsaufnahme.md`](../assets/FEAT-0604/ui-zustandsaufnahme.md) §5
- [FEAT-0607](FEAT-0607-make-settingsgrid-the-only-grid-pattern-in-settings.md)
- [FEAT-0609](FEAT-0609-extend-and-adopt-the-button-primitive.md)
- [FEAT-0613](FEAT-0613-introduce-compact-default-and-wide-density-modes.md) — needs this
