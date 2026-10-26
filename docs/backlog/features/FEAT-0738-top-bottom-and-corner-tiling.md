---
id: FEAT-0738
title: Tile windows to top/bottom halves and corners
type: feature
status: in-progress
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
global app header otherwise. Top and bottom halves span the usable width
between the sidebars and the usable height between the titlebar/dock insets.
Corners are the four quadrants of that same rectangle.

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

- [ ] Dragging within 48 px of the left/right/top/bottom edge snaps the
      corresponding half; a corner (both axes in range) wins over an edge.
- [ ] The snap preview and the committed geometry are identical for all eight
      zones.
- [ ] Top/bottom halves and corners use the usable rectangle: sidebars,
      `#wco-titlebar` and a top/bottom dock are not covered.
- [ ] `Alt+Arrow` follows the state machine above; a perpendicular arrow from
      a half produces a corner, a second arrow collapses to the half.
- [ ] `pinSide` persists all eight zones; legacy `left`/`right`/`top`/`bottom`
      snapshots load; unpin restores the pre-snap rectangle and re-pin returns
      to the last zone.
- [ ] All eight zones render the correct `pinned-*` class and edge styling.
- [ ] Geometry, detection, state machine, insets, persistence and the frame
      gesture have targeted tests; `npm run check` stays at 0 errors.
- [ ] No hardcoded colours; no `as` cast is needed to read a persisted zone.

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
