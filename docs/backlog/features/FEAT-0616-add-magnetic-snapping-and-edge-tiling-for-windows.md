---
id: FEAT-0616
title: Add magnetic edge snapping and tiling to the window system
type: feature
status: specced
priority: P2
milestone: none
created: "2026-10-03"
editions: [community, pro, private]
area: ui
parent: FEAT-0605
data_class: none
adr: none
depends_on: [FEAT-0615]
---

# FEAT-0616 — Add magnetic edge snapping and tiling to windows

Dragging a window to a screen edge currently does nothing. The data model for
pinning exists and no gesture drives it.

## Problem

`WindowBase` holds `isPinned: boolean` and
`pinSide: 'left' | 'right' | 'top' | 'bottom' | 'none'`. `togglePin()` is
annotated *"Pinning logic (experimental tiling)"* and does one thing: return
early if `pinSide === 'none'`, otherwise flip `isPinned`, un-maximize and save.

Searching `WindowFrame.svelte` for `snap|magnet|threshold` matches only the
`pinned-left` / `pinned-right` CSS class names. There is no drag-to-edge
magnetic snapping anywhere in the codebase. Only one call site in
`WindowRegistry.svelte.ts:420` ever sets a `pinSide`, and it sets `left`.

So the feature is present as data, present as CSS classes, and absent as
interaction. A user who drags a window to the left edge gets no feedback at
all.

The reason this is not simply "add a drag handler" is
[FEAT-0615](FEAT-0615-consolidate-window-flags-and-resolve-the-double-click-drift.md):
`allowMaximize`/`showMaximizeButton` and the two double-click flag sets overlap,
and snapping needs to decide what a window's edge behaviour is.

## Proposal

Add a drag-to-edge snap: near an edge, show a preview zone; on drop, pin the
window to that side and tile it. Implement half-tiling on left and right first,
because the app shell already has left and right sidebars and a left-edge
window should not collide with them.

Every pinned layout needs a way back. The calculator has `#reset-btn`; windows
and sidebars need the same, and that is filed as its own item rather than
folded in here.

## Acceptance criteria

- [ ] Dragging a window within the snap threshold of an edge shows a visible
      preview of the zone it will occupy; leaving the threshold cancels it
- [ ] Releasing inside the zone pins the window; releasing outside leaves the
      position untouched
- [ ] The snap threshold is a named constant, not a literal, and the value is
      recorded in this item
- [ ] Left and right edge snapping are implemented; top and bottom are either
      implemented or explicitly deferred with the reason recorded here
- [ ] Snapping never collides with the app shell's left and right sidebars: a
      pinned window's geometry accounts for the visible sidebars at snap time
- [ ] A pinned window restores its pinned geometry across a reload, and the
      restored state matches what was saved
- [ ] Every `$effect` that registers the drag listeners returns a cleanup
      function
- [ ] Keyboard operation exists for every snap action — a drag gesture alone is
      not reachable by keyboard
- [ ] Every existing window implementation's test passes; new tests cover the
      threshold, the preview, the cancel path and the reload path
- [ ] `WindowFrame.svelte` grows by a defensible amount or the snapping logic
      is extracted to its own module; a 1373-line file does not become a
      1600-line file without comment

## Out of scope

- Free-form tiling layouts, tiling multiple windows side by side, or a
  workspace system. This is edge snapping, not a tiling manager.
- Persisting a full layout arrangement. One window's pinned state is already
  persisted; the arrangement around it is not.
- The flag consolidation, which is FEAT-0615.
- The reset affordance, which is its own item.
- Changing window sizes or minimum sizes.
- Touch gestures. The existing drag is a pointer drag; touch parity is a
  separate question.

## Open questions

- Should snapping be opt-in per window via the consolidated flags, or global?
  A per-window opt-out is safer for the 17 existing implementations that were
  laid out by hand.
- Should the snap threshold scale with viewport size, or be a fixed pixel
  value? A fixed value on a 4K display feels wrong; a proportional one is harder
  to hit accurately.
- Does a snapped left window replace the left sidebar, or sit beside it? This
  determines whether the answer lives here or in
  [FEAT-0617](FEAT-0617-turn-sidebar-width-into-a-token-and-allow-resizing.md).

## Links

- Evidence: [`assets/FEAT-0605/ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §2.3
- `src/lib/windows/WindowBase.svelte.ts`, `src/lib/windows/implementations/WindowRegistry.svelte.ts`
- [FEAT-0615](FEAT-0615-consolidate-window-flags-and-resolve-the-double-click-drift.md) — prereq
- [FEAT-0617](FEAT-0617-turn-sidebar-width-into-a-token-and-allow-resizing.md)
- [FEAT-0618](FEAT-0618-entry-point-registry-and-window-manager-scope.md)
