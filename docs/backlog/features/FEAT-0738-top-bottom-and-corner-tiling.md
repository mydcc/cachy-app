---
id: FEAT-0738
title: Tile windows to top/bottom halves and corners
type: feature
status: done
assignee: opencode
branch: feature/feat-0738-tiling
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0616]
---

# FEAT-0738 — Tile windows to top/bottom halves and corners

## Problem

Windows snap only to the left and right halves (FEAT-0616). Dragging to the
top, the bottom or a corner does nothing, and the keyboard can only produce
the two half layouts. The KWin comparison deferred quarter tiling until the
vertical collision with the app shell was defined; that rule is defined here.

## Shell collision

The snap area is the viewport minus the shell surfaces that a window must not
cover:

- `[data-snap-sidebar="left"|"right"]` — the existing sidebar insets.
- `#wco-titlebar` — the PWA window-controls bar, when rendered.
- `.minimized-dock.dock-top` / `.dock-bottom` — the minimized-window dock,
  measured on the side it currently occupies.

The page's own `py-4`/`md:py-8` is content padding, not chrome; there is no
global app header otherwise. The same usable rectangle applies to all eight
zones: top and bottom halves span the usable width, and the left/right halves
also stop at the vertical chrome instead of covering it. Corners are the four
quadrants of that rectangle.

## Proposal

- Replace `SnapSide` with `SnapZone`: `left`, `right`, `top`, `bottom` and the
  four corners.
- Extend `SnapInsets` with `top` and `bottom`; `readShellInsets` measures the
  titlebar and the dock as described above.
- `computeSnapGeometry` returns halves or quarters of the usable rectangle.
  `minWidth` and `minHeight` are hard floors, applied last.
- `detectSnapZone(x, y, width, height)` checks the four corners first, then
  the edges, with the existing 48 px threshold.
- Dragging into an edge snaps the half; into a corner snaps the quarter. The
  preview uses the same geometry as the commit.
- Keyboard, using the existing `Alt+Arrow` gesture:
  - from no snap, an arrow selects that half;
  - from a horizontal half, Up/Down refines it to a corner;
  - from a vertical half, Left/Right refines it to a corner;
  - from a corner, an arrow collapses to the half on that axis.
  This is a pure `nextSnapZone(current, direction)` state machine.
- Widen the persisted `pinSide` to `SnapZone | "none"`. Old snapshots keep
  working; `togglePin` re-snaps any known zone, and `detachPin` keeps it.
- Add the eight `pinned-*` CSS classes with the same edge treatment the two
  half classes use.

## Acceptance criteria

- [x] Dragging within 48 px of the left/right/top/bottom edge snaps the
      corresponding half; a corner (both axes in range) wins over an edge.
- [x] The snap preview and the committed geometry are identical for all eight
      zones.
- [x] Top/bottom halves and corners use the usable rectangle: sidebars,
      `#wco-titlebar` and a top/bottom dock are not covered.
- [x] `Alt+Arrow` follows the state machine above; a perpendicular arrow from
      a half produces a corner, a second arrow collapses to the half.
- [x] `pinSide` persists all eight zones; legacy `left`/`right`/`top`/`bottom`
      snapshots load; unpin restores the pre-snap rectangle and re-pin returns
      to the last zone.
- [x] All eight zones render the correct `pinned-*` class and edge styling.
- [x] Geometry, detection, state machine, insets, persistence and the frame
      gesture have targeted tests; `npm run check` stays at 0 errors.
- [x] No hardcoded colours; no `as` cast is needed to read a persisted zone.

## Progress

`SnapZone` now covers the four halves and four corners. `computeSnapGeometry`
splits the usable rectangle (sidebars, PWA titlebar and minimized dock
excluded) and applies `minWidth`/`minHeight` last; a floored half keeps its
top/left anchor instead of pushing the header off-screen. `readShellInsets`
uses the union of the titlebar and a top dock rather than summing their
heights, and `SNAP_ZONES` is the single source for the union and the persisted
validator.

`detectSnapZone` checks corners before edges at the existing 48 px threshold;
the drag preview and the committed geometry share one call. `Alt+Arrow` uses
`nextSnapZone`: an arrow selects a half from no snap or from a corner, a
perpendicular arrow refines a half into a corner, and a same-axis arrow
switches halves. `pinSide` accepts all eight zones, validates persisted values
through `isSnapZone`, and `togglePin` re-snaps any known zone instead of the
old left/right-only branch. Legacy vertical zones load unchanged; held keys
do not re-tile because repeat events are ignored.

The frame adds the eight `pinned-*` classes and their edge styling, scoped so
maximized and docked frames keep their own radius and border. Tests: 21
geometry/detection/state-machine/inset cases, 33 `WindowBase.snapping` cases
(top/bottom/corner geometry, persistence, legacy zones, minimums, shell
insets, reload re-pin) and 53 `WindowFrame` cases (all-zone preview/commit
equality, top and corner drags, pointercancel, the keyboard state machine,
classes, focus guards, detach re-snap); the broader
`WindowBase`/`WindowManager` suites stay at 71. `npm run check` reports 0
errors and the existing 6 warnings; ESLint is clean.

A dock that appears after a window has already been tiled is not re-flowed;
that dynamic layout change stays outside this item.

## Out of scope

- Window-to-window snapping and screen-centre snapping.
- Multi-monitor placement.
- Resizing a snapped window by dragging its inner edges.
- Moving or resizing the dock.
- Touch gestures and window rules.

## Open questions

None blocking. The shell collision is fixed above; the existing 48 px
threshold and `minWidth` behaviour stay unchanged.

## Links

- KWin comparison: [`assets/FEAT-0618/window-manager-comparison.md`](../assets/FEAT-0618/window-manager-comparison.md)
- `src/lib/windows/snapping.ts`
- `src/lib/windows/WindowBase.svelte.ts`
- `src/components/shared/windows/WindowFrame.svelte`
- `src/themes.css` (dock and titlebar positioning)
