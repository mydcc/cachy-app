---
id: FEAT-0611
title: Adopt the button primitive across the settings tabs
type: feature
status: done
priority: P2
milestone: none
created: "2026-10-03"
editions: [community, pro, private]
area: ui
parent: FEAT-0605
data_class: none
adr: none
depends_on: [FEAT-0608, FEAT-0610]
assignee: opencode
branch: feature/feat-0611-settings-cards
---

# FEAT-0611 — Adopt the button primitive across the settings tabs

> **State note.** Stage 1 landed in #4181 (`feature/feat-0611-settings-buttons`);
> the stale `in-progress` claim was dropped afterwards, which is why the item
> was briefly back to `ready`. Stage 2 (`feature/feat-0611-settings-cards`)
> closes the remaining criteria and flips it to `done`.

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

- [x] Every `<button>` in `src/components/settings/` renders through
      `Button.svelte`, or carries a comment naming the component it belongs to
      instead (tab rail, toggle row, segmented control)
- [x] The `VisualsTab` sub-tab pills carry an escape comment naming the tab
      rail; moving them onto a shared tab-bar component is
      [FEAT-0607](FEAT-0607-harmonize-settings-vocabulary-placement-and-tabs.md)'s
      scope, which owns that component. (Reworded here so the item does not
      claim a component that does not exist yet.)
- [x] Every migrated button's height comes from the control-geometry tokens
- [x] No `!important` is added by this item
- [x] A check fails on a raw `<button>` under `src/components/settings/` that
      does not go through the primitive, with an escape comment recognised
- [x] All settings component tests still pass. "Renders identically" cannot
      hold together with "every height comes from the tokens"; the deltas are
      listed under *Normalization, stated* below.
- [x] The settings window is checked at a width below 560 px and above 960 px
      by `tests/e2e/settings-buttons-width.spec.ts` (540 px and 1024 px, no
      horizontal overflow). Playwright is a local gate — no CI workflow runs
      it.

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

## Progress — 2026-10-21, Stage 2 (cards) — item done

Branch `feature/feat-0611-settings-cards`, based on `11a45396c` (Stage 1). This
closes the item: 40 sites in the 18 card components.

### Migrated (33 sites)

`AccountList` (3), `AiModelPicker` (1), `AiProviderManager` (3),
`ApiQuotaStatus` (2), `ConfirmationSettings` (1), `DataMaintenance` (4),
`EngineDebugPanel` (2), `ExternalChannelCard` (2), `ExternalChannelSettings`
(2), `HotkeySettings` (2), `NotificationSettings` (2), `OrderAuditSettings`
(3), `PaperTradingSettings` (2), `RiskLimitsSettings` (4).

### Escaped with a comment (7 sites)

The reveal toggle inside `AccountCard`'s key inputs (icon-only, absolutely
positioned — the primitive's padding would shift it), `CalculationSettings`'
preset cards and timeframe toggles, `OrderAuditSettings`' audit-entry
disclosure (a full-width, left-aligned row; the primitive centers its content),
`PaperTradingSettings`' failure-mode segmented control, `SettingsContent`'s tab
rail, and `SettingsButton` — a component with no production importer, so
migrating it would hide the dead-code finding.

The engine-debug history disclosure was initially escaped for a missing
`aria-expanded` passthrough; the review on #4192 turned that into a prop on the
primitive (`ariaExpanded`/`ariaControls`) and the control migrated.

### Primitive extensions

Two variants, both because the cards needed them:

- `warning` — the three data-maintenance repairs were the only
  `bg-warning-paired` buttons in the app; they keep the fill and the
  `hover:opacity-90`.
- `outline-accent` — `AiProviderManager`'s add and activate actions are
  outlined in the accent role, not in the neutral border `outline` uses.

`Button.svelte` also widens `onClick` to `(event: MouseEvent) => void` (the
hotkey capture button needs `stopPropagation`) and forwards `ariaExpanded` /
`ariaControls` (the engine-debug history disclosure needs the former; escaping
it for a missing passthrough was the alternative). `themes.css` gains
`.btn-base.btn-mono` — `.btn-base` sets `font-family: inherit` unlayered, so
the `font-mono` utility could not override it and the key display had lost its
monospace face.

### Normalization, stated (stage 2)

- **Height** — `px-3 py-1.5`/`px-4 py-2` with `text-[11px]`/`text-xs` become
  the `sm` token (34 px); the 2 px-padding debug refresh becomes `ghost`/`sm`.
- **Font** — 10–12 px → 14 px, light weights → 700, as in stage 1. The
  `AiModelPicker` refresh link and the `AiProviderManager` buttons are the
  visible cases.
- **Colour** — `bg-accent-paired`/`bg-danger-paired` → `accent`/`danger`;
  neutral bordered buttons → `outline`; the danger *hover* tint on the two
  clear buttons (`ExternalChannelCard`, `OrderAuditSettings`) is dropped — the
  destructive affordance there belongs in a confirmation, not in a hover.
  Note the token swap this implies: the paired classes filled with
  `--danger-color`/`--accent-color`, the variants fill with
  `--btn-danger-bg`/`--btn-accent-bg`, and the two pairs diverge in seven
  themes (default, light, VIP, matrix, gruvbox-dark, github-dark,
  github-light). The kill-switch, close-all and remove buttons therefore
  change shade in those themes; in VIP the danger fill changes hue. That is
  the price of one role token per variant and is deliberate.
- **Geometry** — `.action` (AccountList), `.add-btn`, `.activate-btn`,
  `.delete-btn`, `.refresh-btn` were component-scoped and lost their
  consumers; they are removed. `AccountList`'s `makeActive`/`remove` keep
  `whitespace-nowrap` via `extraClasses`.
- **State** — `AiProviderManager`'s active provider keeps its `disabled` state
  and its label, but loses the uppercase/letter-spacing treatment.

### Checks

- `settingsButtons.test.ts` — `ROOTS` widened to `src/components/settings`,
  so cards and tabs are both covered (7 escapes, all named), plus a companion
  assertion that every `<Button>` carries `onClick` — the review on #4192
  found that hole (a `<Button>` without a handler passes every other check).
- `src/components/settings` + `Button.component.test.ts` — 19 files, 136
  tests green.
- `tests/e2e/settings-buttons-width.spec.ts` — the settings window opens at
  540 px and 1024 px without horizontal overflow (AC7). It navigates to a
  sub-tab that actually renders migrated controls and asserts none is clipped
  inside `.window-content`; the first version only measured the document, which
  the window's own `overflow: hidden` made unfalsifiable.
- `npm run check` — 0 errors, 6 pre-existing warnings.
- Audit §5 re-counted: **302** raw `<button>` across 91 files (368 before
  FEAT-0610, 335 after stage 1).
