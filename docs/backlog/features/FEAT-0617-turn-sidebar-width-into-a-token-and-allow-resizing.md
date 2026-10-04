---
id: FEAT-0617
title: Turn the sidebar width into a token and allow resizing it
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
depends_on: [FEAT-0609]
---

# FEAT-0617 — Turn the sidebar width into a token and allow resizing it

The left sidebar is 384 pixels because a class attribute says so. It cannot be
changed by the user and no density mode can reach it.

## Problem

`+page.svelte` renders the left sidebar as
`sticky top-8 flex flex-col gap-3 w-96 shrink-0 z-40 h-fit`. `w-96` is 384 px,
written into the class attribute — not a token, not persisted, not adjustable.
A user with a wide position list cannot widen it; a user on a laptop can only
live with it.

Two related facts. Layout mode is driven by the single boolean
`showSidebars`, which decides grid-vs-flex *and* left-vs-right sidebar
visibility at once, so there is no independent control for either side. And
`TechPanel` is absolutely positioned inside the right sidebar — absolute
positioning plus a height that a density mode changes is how panels start
overlapping.

## Proposal

Replace `w-96` with a layout token, let the user set the sidebar width, and
persist it. Then decide what resizing is *for*: a user who resizes the sidebar
is expressing a preference that has no other way to be expressed, and there is
no reset for it.

Add the reset affordance here rather than deferring it, because this is the item
that makes the arrangement user-owned.

## Acceptance criteria

- [ ] The sidebar width comes from a layout token in `src/themes.css`, not from
      a `w-*` utility in `+page.svelte`
- [ ] The width is user-adjustable with a pointer drag, bounded by a named
      minimum and maximum constant
- [ ] The chosen width persists across a reload and is restored exactly
- [ ] A reset control restores the default width, and the control is reachable
      by keyboard
- [ ] The resize handle is keyboard-operable, not pointer-only
- [ ] With the sidebar at its maximum width the main calculator column keeps its
      `max-w-3xl` and does not collapse or overflow
- [ ] `TechPanel`'s absolute positioning is re-verified at compact and wide
      density — if density changes its height, it must not overlap
- [ ] The shell is verified at a viewport narrower than the sidebar's maximum
      width, including the existing `xl` breakpoint and the mobile branch
- [ ] `BUG-0410` (mode state must not depend on sidebar) is not reintroduced:
      switching the sidebar off and on restores the mode, and a test asserts it

## Out of scope

- Collapsible sidebars, or a sidebar that hides into a rail. That is a layout
  decision, not a width one.
- Changing which panels appear in which sidebar — that is
      [FEAT-0606](FEAT-0606-button-placement-visibility-and-dependency-audit.md)'s
      territory.
- Snapping windows beside the sidebar.
- Making the right sidebar independently toggleable from the left. The
      `showSidebars` coupling is a real finding, but splitting it changes
      behaviour for existing users and is its own decision.
- Density, which changes token values rather than introducing them.

## Open questions

- Should the width be per-sidebar, so the position list can be wide and the
  sentiment panel narrow? One shared width is simpler and is what the current
  layout implies.
- Does the width belong in `settings.svelte.ts` (six touchpoints, per the audit)
  or in the window/layout persistence that the window system already uses? The
  second avoids growing a 2166-line store, and sidebars are layout, not
  settings.

## Links

- Evidence: [`assets/FEAT-0605/ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §1 and §7 (N6)
- `src/routes/+page.svelte`
- [FEAT-0609](FEAT-0609-introduce-control-and-density-tokens.md) — prereq
- [BUG-0410](../bugs/BUG-0410-mode-state-must-not-depend-on-sidebar.md)
- [FEAT-0616](FEAT-0616-add-magnetic-snapping-and-edge-tiling-for-windows.md)
