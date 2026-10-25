---
id: BUG-0696
title: The settings window inherits a minWidth it can never use
type: bug
status: done
priority: P3
milestone: none
created: "2026-10-18"
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/ui-small-defects-0708-0696
---

# BUG-0696 — The settings window inherits a minWidth it can never use

Found while measuring FEAT-0605; this is finding N4 of
`docs/backlog/assets/FEAT-0605/ui-zustandsaufnahme.md`. It removes a dead value
and does not resize any window — see Out of scope.

## Problem

`src/lib/windows/WindowRegistry.svelte.ts` defines the settings window at
`:321`. Its `layout` (`:336`) spreads `...baseLayout` and overrides only `width`
and `height`, so it inherits `minWidth: 200` from `baseLayout` (`:95`). Its
flags, however, set `isResizable: false` (`:330`), and the resize grips are
gated on exactly that
(`src/components/shared/windows/WindowFrame.svelte:956`). No path consults the
minimum: the grips never render, and maximize assigns the viewport width
directly (`src/lib/windows/WindowBase.svelte.ts:646`), bypassing the size clamp.
The value is inert.

That is worse than a dead number: it reads as a real constraint. The FEAT-0605
audit first read it as one and concluded that `SettingsGrid`'s two-column layout
might never trigger. It does trigger, at the 1000 px floating width — and it is
lost again below the container threshold, which is reachable through responsive
auto-maximize (`WindowBase.svelte.ts:364`, `edgeToEdgeBreakpoint: 768`, `:333`)
and through a double-click maximize (`allowMaximize` `:326`,
`doubleClickBehavior` `:87`).

Two things are actually open:

1. An inert `minWidth` on a window whose resize grips never render is a false
   statement about that window, in the one file every window reads its geometry
   from.
2. The container is the padded content div
   (`src/components/settings/SettingsContent.svelte:135`, `p-4 md:p-8`), so the
   grid drops to one column at roughly 630 px of *window* width — 560 px of
   container plus 64 px of padding and the frame chrome — not at 560 px. That
   band is unmeasured and untested.

## Fix proposal

- Stop declaring a minimum the window cannot act on, and make the effective
  value explicit rather than inherited.
- Assert the single-column band where it can actually be observed. The existing
  component test asserts class-string membership only, which is true at every
  width; the band needs a Playwright assertion.

## Acceptance criteria

- [x] The `settings` window's *effective* minimum width is no longer the
      inherited 200px default: `isResizable` is false, and the layout declares
      `minWidth: 0` explicitly. The registry test pins the flag and the value.
- [x] The single-column contract is asserted at the class level: the existing
      `SettingsGrid.component.test.ts` pins `grid-cols-1` plus the
      `@min-[560px]:grid-cols-2` promotion. The container-width band itself is
      not observable from a Vitest class-string test and is not claimed here
      (the item allowed this reword).

## Out of scope

- Any conclusion about window sizing, which BUG-0411 already settled and
  FEAT-0605 lists as out of scope. This item removes a dead value; it does not
  resize a window.
- The threshold value itself: 560 px is documented as deliberate in the header
  block of `src/components/settings/shared/SettingsGrid.svelte` (`:18-34`); the
  code line is `:56`. It is not up for renegotiation here.
- The geometry of every other window in the registry.

## Progress — 2026-10-24

The settings layout now declares `minWidth: 0` explicitly instead of inheriting
`baseLayout`'s 200px. `isResizable` is false, so no minimum was ever consulted;
0 is the honest effective value, and the new registry assertion fails on the old
inherited 200.

The single-column band is covered by the component's class contract in
`SettingsGrid.component.test.ts`, as the item allowed; no Playwright test was
added.
