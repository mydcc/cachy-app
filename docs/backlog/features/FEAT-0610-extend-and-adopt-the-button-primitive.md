---
id: FEAT-0610
title: Extend the button primitive and adopt it in the app shell header
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
depends_on: [FEAT-0605, FEAT-0606, FEAT-0609]
assignee: opencode
branch: feature/feat-0610-button-primitive-header
---

# FEAT-0610 — Extend the button primitive and adopt it in the shell header

A shared button component already exists, is already tested, and is used by
nothing. This item gives it what it lacks and proves it on one surface.

## Problem

`src/components/shared/Button.svelte` exists with `Button.component.test.ts`.
Zero components import it. There are 368 raw `<button>` elements across 106
files (re-measured 2026-10-21, §5 of the audit) and only sixteen uses of the
`btn-accent-bg` / `btn-default-bg` / `btn-danger-bg` utilities. Vertical padding
across `<button>` openings distributes as `py-1.5` ×49, `py-2` ×44, `py-1` ×37,
`py-2.5` ×11, `py-0.5` ×5, `py-3` ×4 — six heights for one conceptual control.

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
[FEAT-0611](FEAT-0611-adopt-the-button-primitive-in-the-settings-tabs.md),
[FEAT-0612](FEAT-0612-adopt-the-button-primitive-in-the-calculator-and-trade-panel.md),
[FEAT-0613](FEAT-0613-adopt-the-button-primitive-in-journal-and-window-frames.md).
This item does not do them.

## Acceptance criteria

- [x] `Button.svelte` exposes variants covering every colour role the app
      already uses, mapped to the existing `btn-*` / paired CSS classes rather
      than to new colours
- [x] `Button.svelte` exposes exactly three sizes, and their heights come from
      the [FEAT-0609](FEAT-0609-introduce-control-and-density-tokens.md)
      tokens rather than from literals
- [x] `.btn-base` no longer uses `transition: all`; transitions are named
      properties only
- [x] `Button.component.test.ts` covers each variant and size, and asserts the
      disabled state blocks the handler
- [x] The five `+page.svelte` header controls render through `Button.svelte`
      with no behavioural change: same handlers, same `disabled` condition on
      `#delete-preset-btn`, same right-click behaviour on `#theme-switcher`
- [x] `#preset-loader` is either migrated or explicitly left as a `<select>`,
      with the reason recorded
- [x] The migrated controls render identically to `develop` at default settings — deliberately deviated: the cluster unifies on the 42 px control height and the token padding (see Progress)
- [x] `docs/backlog/assets/FEAT-0605/ui-zustandsaufnahme.md` §5 is updated with
      the post-pilot counts

## Out of scope

- Migrating the other 363 buttons. That is FEAT-0611 through FEAT-0613.
- Deciding *which* buttons exist or where they sit — that is
      [FEAT-0606](FEAT-0606-button-placement-visibility-and-dependency-audit.md).
- Changing button colours, contrast, or any theme value.
- Introducing a new colour for a new variant.
- `DashboardNav.svelte`, which is journal-local and belongs to FEAT-0613.

## Open questions

- Should the primitive handle an icon slot, or do icons stay as children? A
  slot is more expressive; children keep the component smaller and let the
  caller control the icon's colour.
- Should a button group exist as its own primitive, or stay a `div` with a gap?
  The header cluster argues for the former.

## Links

- Evidence: [`assets/FEAT-0605/ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §5 and §6 (C7, C9)
- `src/components/shared/Button.svelte`
- [FEAT-0606](FEAT-0606-button-placement-visibility-and-dependency-audit.md)
- [FEAT-0609](FEAT-0609-introduce-control-and-density-tokens.md)
- [FEAT-0611](FEAT-0611-adopt-the-button-primitive-in-the-settings-tabs.md) — next

## Progress — 2026-10-21

Branch `feature/feat-0610-button-primitive-header`, based on `189045285`
(FEAT-0609 merged).

### Primitive

`Button.svelte` now takes `variant` (`default`, `accent`, `danger`, `success`),
`size` (`sm`, `md`, `lg`), `id`, `type` (defaults to `button`), `oncontextmenu`
and an optional `track` action. The colour roles map onto the existing
`--btn-*` pairs; no new colour was introduced. The three heights come from the
FEAT-0609 tokens (`--control-height-sm` / `--control-height` /
`--control-height-lg`); `--control-height-lg: 48px` was added to the token block
for the third step.

The styles moved from the component's scoped `<style>` into `themes.css` under
a `Button primitive (FEAT-0610)` section. Reason: the audit's complaint is that
six ad-hoc heights exist *and* that the primitive is invisible to theming; a
global `btn-*` section is what the existing `btn-switcher` /
`btn-primary-action` classes already are, and it makes the computed-height
assertions possible without a browser.

`transition: all` is gone; the rule names `background-color`, `color` and
`opacity`.

`trackClick` now accepts `undefined`, because the primitive applies the action
unconditionally and only tracks when a caller passes `track`.

### Decisions on the open questions

- **Icons stay children.** The caller controls the icon's colour and size; a
  slot would add API surface without a second consumer.
- **No button-group primitive.** The header group stays a `div` with `gap-2`.
  A group earns its own component when a second surface needs the same
  behaviour, not before.
- **`#preset-loader` stays a `<select>`.** A button primitive cannot express a
  native select's options, keyboard behaviour or form semantics. It already
  gets the control treatment from FEAT-0609 (token height and padding), so the
  row is consistent without pretending it is a button.

### Header pilot

The five controls (`#save-preset-btn`, `#delete-preset-btn`, `#reset-btn`,
`#theme-switcher`, `#view-journal-btn-desktop`) render through `Button` with the
same handlers, the same `disabled` condition, the same `title`/`aria-label` and
the same analytics actions. `#theme-switcher` keeps its right-click handler via
the new `oncontextmenu` prop. The journal button keeps its responsive hide by
wrapping it in a `hidden md:block` span — `.btn-base` sets `display`, and an
unlayered rule would beat Tailwind's `hidden` utility, so the hide belongs on a
wrapper rather than on the primitive.

**AC7, stated plainly:** the cluster is *not* pixel-identical. It was 40 px
(save/delete/reset) and 36 px (theme/journal) next to a 42 px select; it is now
42 px throughout, which is the point of having one control height. Labels,
states, handlers and layout order are unchanged. AC2 (three token sizes) and a
pixel-identical cluster are mutually exclusive, because neither 40 nor 36 is a
token.

### Tests

`Button.component.test.ts` grew to 13 cases: each size's computed height
(34/42/48), each variant's class plus four distinct computed fills, the named
transition (and that `all` is absent), `type=button` by default, the
contextmenu handler with `preventDefault`, the analytics action firing with
`onClick`, and no tracking without a `track` prop. The existing label/disabled
cases stay.

`npm run check`: 0 errors (6 pre-existing warnings). `backlog:check`: valid.

### Review fixes

- The variant selectors are `.btn-base.btn-*`. Bare `.btn-accent` / `.btn-danger`
  / `.btn-success` are carried by three raw journal buttons in
  `JournalContent.svelte` as inert tokens; without the extra class the new
  section would have restyled them, which belongs to FEAT-0613.
- The `extraClasses` prop documents the constraint that the primitive's rules
  are unlayered and a Tailwind utility there cannot override its geometry.
- `#view-journal-btn-desktop` keeps its accessible name: it passes the visible
  journal label as `ariaLabel`, so the name stays "Journal" rather than
  switching to the tooltip text.
- The variant test resolves each expected fill through a probe element, so a
  swapped mapping fails instead of passing on distinctness; `clearAllMocks`
  replaced the manual `mockClear`; `tracking.test.ts` covers the
  `undefined` → defined update path.
- AC7's note now names the padding change too, and §5's padding histogram is
  re-counted at the merge base.

### Audit

§5 now records 363 raw buttons (was 368), the primitive as adopted by the header,
and the unified cluster height.
