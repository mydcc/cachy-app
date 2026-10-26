---
id: FEAT-0739
title: Snap a dragged window to other windows and the screen centre
type: feature
status: in-progress
assignee: opencode
branch: feature/feat-0739-window-to-window-snap
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0616, FEAT-0738]
---

# FEAT-0739 — Snap a dragged window to other windows and the screen centre

## Problem

Dragging a window only snaps it to the screen edges (FEAT-0616/0738). There is
no way to align a second window's edge, top or centre with an existing window,
and no magnetic screen-centre position. The KWin comparison marks "snap to
other windows and screen centre" as a defer item; the current multi-window
workspace makes it worthwhile.

## Proposal

- Add `src/lib/windows/windowSnapping.ts`, a pure helper that takes the raw
  dragged rectangle, the other visible windows and the usable viewport bounds.
- Threshold: `WINDOW_SNAP_THRESHOLD_PX = 12`, separate from the 48 px screen
  edge. Screen-edge tiling wins while its preview is active; window snapping
  only runs when no snap zone is detected.
- For each other window, candidates on each axis:
  - left/left, right/right, left-to-other-right, right-to-other-left,
  - centre-to-centre.
  - The screen centre of the usable rectangle (sidebars/titlebar/dock
    excluded) is always a candidate.
- Each axis snaps independently to the nearest candidate within 12 px; ties
  are deterministic by candidate order. Both axes can snap at once.
- Candidate windows exclude the dragged window, minimized windows, and
  modal/dialog windows; they use the current geometry at pointer-move time.
- No new persisted state and no guides: the snapped position is the feedback,
  and the existing drag-end save persists the final rectangle.
- Add tests for the pure helper and one component drag against a second
  window.

## Acceptance criteria

- [ ] Dragging a non-maximized window within 12 px of another window's left,
      right, top, bottom or centre line snaps that axis to it.
- [ ] A 12 px boundary snaps; 13 px does not.
- [ ] The window's left/right/top/bottom can also align adjacent to another
      window's opposite edge (no gap, no overlap by construction).
- [ ] The usable-area centre is a candidate on both axes, using the same shell
      insets as tiling.
- [ ] The active screen-edge half/quarter preview suppresses window snapping;
      cancelling the edge preview restores normal movement.
- [ ] The dragged window, minimized windows and modal/dialog windows never act
      as targets.
- [ ] Both axes can snap in one move; each axis chooses the nearest candidate.
- [ ] No new localStorage keys or window state; the drag-end save keeps the
      snapped geometry.
- [ ] Pure-helper and component tests cover the candidate matrix, threshold,
      insets, exclusions and the edge-preview interaction.
- [ ] `npm run check` stays at 0 errors; no hardcoded colours.

## Out of scope

- Resizing or re-tiling against another window.
- Visible alignment guides.
- Window groups, rules or multi-monitor placement.
- Snapping the dock or the left rail.
- Touch gestures.

## Open questions

None blocking. The 12 px threshold is deliberately smaller than the 48 px
screen-edge magnet; it is recorded here and easy to tune later.

## Links

- KWin comparison: [`assets/FEAT-0618/window-manager-comparison.md`](../assets/FEAT-0618/window-manager-comparison.md)
- `src/lib/windows/snapping.ts`
- `src/lib/windows/windowSnapping.ts`
- `src/components/shared/windows/WindowFrame.svelte`
- `src/lib/windows/WindowManager.svelte.ts`
