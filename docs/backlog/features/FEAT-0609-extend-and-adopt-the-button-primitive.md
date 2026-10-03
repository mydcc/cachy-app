---
id: FEAT-0609
title: Extend the button primitive and adopt it in the app shell header
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
depends_on: [FEAT-0604, FEAT-0605, FEAT-0608]
---

# FEAT-0609 — Extend the button primitive and adopt it in the shell header

A shared button component already exists, is already tested, and is used by
nothing. This item gives it what it lacks and proves it on one surface.

## Problem

`src/components/shared/Button.svelte` exists with `Button.component.test.ts`.
Zero components import it. There are 364 raw `<button>` elements across 167
files and only sixteen uses of the `btn-accent-bg` / `btn-default-bg` /
`btn-danger-bg` utilities. Vertical padding across `<button>` openings
distributes as `py-1.5` ×49, `py-2` ×44, `py-1` ×37, `py-2.5` ×11, `py-0.5` ×5,
`py-3` ×4 — six heights for one conceptual control.

The existing primitive cannot be adopted as it stands. Its props are `title`,
`ariaLabel`, `onClick`, `children`, `extraClasses`, `disabled` — no variant, no
size, no icon, no full-width, no loading state. `.btn-base` sets
`transition: all .2s ease`, which animates layout-affecting properties on every
interaction.

## Proposal

Extend `Button.svelte` into a component worth adopting, then migrate one surface
as the proof: the `+page.svelte` header cluster (`#save-preset-btn`,
`#delete-preset-btn`, `#reset-btn`, `#theme-switcher`,
`#view-journal-btn-desktop`). That cluster is the right pilot — it holds
variants (default, danger), states (disabled, selection) and a group, in about
twenty lines.

Rollout beyond the pilot is three separate items, one per area:
[FEAT-0610](FEAT-0610-adopt-the-button-primitive-in-the-settings-tabs.md),
[FEAT-0611](FEAT-0611-adopt-the-button-primitive-in-the-calculator-and-trade-panel.md),
[FEAT-0612](FEAT-0612-adopt-the-button-primitive-in-journal-and-window-frames.md).
This item does not do them.

## Acceptance criteria

- [ ] `Button.svelte` exposes variants covering every colour role the app
      already uses, mapped to the existing `btn-*` / paired CSS classes rather
      than to new colours
- [ ] `Button.svelte` exposes exactly three sizes, and their heights come from
      the [FEAT-0608](FEAT-0608-introduce-control-and-density-tokens.md)
      tokens rather than from literals
- [ ] `.btn-base` no longer uses `transition: all`; transitions are named
      properties only
- [ ] `Button.component.test.ts` covers each variant and size, and asserts the
      disabled state blocks the handler
- [ ] The five `+page.svelte` header controls render through `Button.svelte`
      with no behavioural change: same handlers, same `disabled` condition on
      `#delete-preset-btn`, same right-click behaviour on `#theme-switcher`
- [ ] `#preset-loader` is either migrated or explicitly left as a `<select>`,
      with the reason recorded
- [ ] The migrated controls render identically to `develop` at default settings
- [ ] `docs/backlog/assets/FEAT-0604/ui-zustandsaufnahme.md` §5 is updated with
      the post-pilot counts

## Out of scope

- Migrating the other 359 buttons. That is FEAT-0610 through FEAT-0612.
- Deciding *which* buttons exist or where they sit — that is
      [FEAT-0605](FEAT-0605-button-placement-visibility-and-dependency-audit.md).
- Changing button colours, contrast, or any theme value.
- Introducing a new colour for a new variant.
- `DashboardNav.svelte`, which is journal-local and belongs to FEAT-0612.

## Open questions

- Should the primitive handle an icon slot, or do icons stay as children? A
  slot is more expressive; children keep the component smaller and let the
  caller control the icon's colour.
- Should a button group exist as its own primitive, or stay a `div` with a gap?
  The header cluster argues for the former.

## Links

- Evidence: [`assets/FEAT-0604/ui-zustandsaufnahme.md`](../assets/FEAT-0604/ui-zustandsaufnahme.md) §5 and §6 (C7, C9)
- `src/components/shared/Button.svelte`
- [FEAT-0605](FEAT-0605-button-placement-visibility-and-dependency-audit.md)
- [FEAT-0608](FEAT-0608-introduce-control-and-density-tokens.md)
- [FEAT-0610](FEAT-0610-adopt-the-button-primitive-in-the-settings-tabs.md) — next
