---
id: FEAT-0611
title: Adopt the button primitive across the settings tabs
type: feature
status: ready
priority: P2
milestone: none
created: "2026-10-03"
editions: [community, pro, private]
area: ui
parent: FEAT-0605
data_class: none
adr: none
depends_on: [FEAT-0608, FEAT-0610]
branch: feature/feat-0611-settings-buttons
---

# FEAT-0611 — Adopt the button primitive across the settings tabs

> **State note.** Stage 1 (button primitive in the settings tabs) landed in
> #4181. The remaining acceptance criteria are open, so the item is back to
> `ready` and the stale `in-progress` claim is dropped — it was blocking the
> item for every other agent.

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
from [FEAT-0610](FEAT-0610-extend-and-adopt-the-button-primitive.md), and add a
check that keeps new buttons on it.

Where a "button" is actually a tab, a toggle row, or a segmented control, it
stays what it is and the reason is recorded — those are different components,
not unadopted buttons.

## Acceptance criteria

- [ ] Every `<button>` in `src/components/settings/` renders through
      `Button.svelte`, or carries a comment naming the component it belongs to
      instead (tab rail, toggle row, segmented control)
- [ ] The `VisualsTab` sub-tab pills render through the tab-bar component
      decided in [FEAT-0607](FEAT-0607-harmonize-settings-vocabulary-placement-and-tabs.md),
      not through hand-written classes
- [ ] Every migrated button's height comes from the control-geometry tokens
- [x] No `!important` is added by this item
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
  not have, the variant is added in FEAT-0610 rather than worked around here.

## Links

- Evidence: [`assets/FEAT-0605/ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §5
- [FEAT-0608](FEAT-0608-make-settingsgrid-the-only-grid-pattern-in-settings.md)
- [FEAT-0610](FEAT-0610-extend-and-adopt-the-button-primitive.md)
- [FEAT-0614](FEAT-0614-introduce-compact-default-and-wide-density-modes.md) — needs this

## Progress — 2026-10-21, Stage 1 (settings/tabs/)

Branch `feature/feat-0611-settings-buttons`, based on `500197e61`. The item is
split into two stages so the PRs stay reviewable: this one covers
`src/components/settings/tabs/` (13 files, 66 sites), Stage 2 the 20 card
components (40 sites) and the final flip.

### Migrated (28 sites)

`AiTab` (2), `AutomationTab` (5), `ChartTab` (1), `CloudTab` (3),
`ConnectionsTab` (4), `SystemTab` (10), `TradingTab` (1),
`VisualsBackground` (2).

### Escaped with a comment (38 sites)

Sub-tab rails (6: AiTab, ConnectionsTab, SystemTab, TradingTab, VisualsTab,
IndicatorSettings), segmented controls (19), selection-card groups (8), the
inline alert chip (1), the inline field toggles (3), the multi-line backup
action card (1) — 38 in total. Each comment names what the control is;
`settingsButtons.test.ts` enforces the pattern.

### Primitive extensions

Two additions, because the tabs needed them and the item's open question says
to extend the primitive instead of working around it:

- `ghost` and `ghost-danger` for inline text actions (edit, delete, reset,
  "manage performance"), transparent with accent/danger text.
- `outline` for the neutral bordered secondary buttons (`btn-secondary` in
  `SystemTab` was component-scoped styling that the migration retired). Six
  further sites that were neutral at rest moved to it as well: the two
  add-channel/add-feed buttons and the two reset buttons, plus the two
  create-token buttons in `ConnectionsTab`.

### Normalization, stated

As in FEAT-0610, "renders identically" cannot hold together with "every height
comes from the tokens". What actually changed:

- **Height** — `py-1`/`py-1.5`/`py-2` with `text-xs`/`text-sm` (28–36 px) become
  the `sm` token (34 px). The file-target buttons in `SystemTab` grow from
  ~24 px to 34 px.
- **Font** — `.btn-base` sets 14 px / weight 700, so `text-[10px]`/`text-xs`
  labels grow to 14 px and light weights become bold. This is the largest
  visible delta and is not a token decision yet; FEAT-0614 can give the
  primitive a size-aware font.
- **Colour** — the paired classes (`bg-*-paired`) give way to the `--btn-*`
  roles where a role exists (`CloudTab`'s connect/erase/send, the factory
  reset); neutral buttons become `outline` instead of the filled `default`.
- **Geometry** — `CloudTab`'s padding drops from `space-2 space-4` to
  `0 space-2` and its radius grows to `--radius-lg`; the icon-only buttons
  lose their 40 px square and render 40×34.

AC6's wording is the aspirational half; the migration's point is one control
language across the window.

### Retired dead CSS

`SystemTab`'s scoped `.btn-secondary` rules and `CloudTab`'s `.cloud-button`
rules lost their consumers and were removed (`svelte-check` reported them as
unused selectors).

### Checks

- `settingsButtons.test.ts` — fails on any raw `<button>` under
  `settings/tabs/` without an `FEAT-0611 escape:` comment. Stage 2 widens its
  `ROOTS` to the whole settings directory.
- `src/components/settings` — 18 files, 121 tests, all green.
- `npm run check` — 0 errors, 6 pre-existing warnings.

### Still open for Stage 2

The card components, the `VisualsTab` pills (AC2 — FEAT-0607 owns the tab-bar
component), the width check below 560 px / above 960 px, and the item flip.
