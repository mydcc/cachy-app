---
id: BUG-0696
title: The settings window inherits a minWidth it can never use
type: bug
status: ready
priority: P3
milestone: none
created: "2026-10-18"
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0696 — The settings window inherits a minWidth it can never use

Found while measuring FEAT-0605; this is finding N4 of
`docs/backlog/assets/FEAT-0605/ui-zustandsaufnahme.md`.

## Problem

`src/lib/windows/WindowRegistry.svelte.ts` defines the settings window at
`:321`. Its `layout` (`:336`) spreads `...baseLayout` and overrides only `width`
and `height`, so it inherits `minWidth: 200` from `baseLayout` (`:95`). Its
flags, however, set `isResizable: false` (`:330`). The window is fixed at
1000 px, so the inherited minimum is unreachable — the value is inert.

That is worse than a dead number: it reads as a real constraint. The FEAT-0605
audit first read it as one and concluded that `SettingsGrid`'s two-column layout
might never trigger. It does trigger — at a fixed 1000 px container, the 560 px
threshold is always cleared.

Two things are actually open:

1. An inert `minWidth` on a non-resizable window is a false statement about that
   window, in the one file every window reads its geometry from.
2. The responsive path is the only one that can go below the threshold
   (`edgeToEdgeBreakpoint: 768`, `:333`). What a 360–559 px viewport does to
   `SettingsGrid` is unmeasured and untested.

## Fix proposal

- Either drop the inherited `minWidth`/`minHeight` from the `settings` layout or
  set a value the window can act on. Leaving a default that `isResizable: false`
  makes unreachable is the thing to remove.
- Cover the sub-560 px container with a component test on `SettingsGrid`, so the
  single-column band is asserted rather than assumed.

## Acceptance criteria

- The `settings` entry no longer carries a `minWidth` that `isResizable: false`
  renders unreachable.
- A test exercises `SettingsGrid` below the 560 px container threshold and
  asserts a single column.

## Out of scope

- The threshold value itself: 560 px is defined and documented in
  `src/components/settings/shared/SettingsGrid.svelte:56` as deliberate, and is
  not up for renegotiation here.
- The geometry of every other window in the registry.
