---
id: FEAT-0741
title: Keep a floating window above the other windows
type: feature
status: in-progress
assignee: opencode
branch: feature/feat-0741-keep-above
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0044]
---

# FEAT-0741 — Keep a floating window above the other windows

## Problem

Every ordinary window shares one z-order: focusing a chart, a settings pane or a
maximized surface raises it above everything else. A small reference window —
the position-size calculator, a journal entry, an alert panel — therefore
disappears behind the chart exactly when the trader needs both at once. Today
the only way to keep a window visible while working elsewhere is to edge-pin it,
which also changes its geometry and is a different concept.

The KWin comparison lists keep-above as a deferred per-window stacking flag:
"reopen when a calculator or journal must stay visible over another window".

## Proposal

- Add a per-window `isKeepAbove` flag, default **off**, persisted with the
  window's existing geometry snapshot.
- Add a header toggle for ordinary floating windows (not modal/dialog, not
  minimized). It shows an "above" icon, exposes `aria-pressed`, and toggles the
  flag; turning it on raises the window immediately.
- Add a dedicated stacking band `Z_LAYERS.windowKeepAbove` above the maximized
  band and below the modal band:
  - ordinary windows keep the existing counter;
  - a keep-above window is assigned a z-index inside the new band on every
    raise, so focusing a normal window can never draw over it;
  - modals and promise dialogs stay above keep-above windows;
  - normalization preserves the band instead of flattening every window back
    into the normal range.
- A maximized keep-above window keeps the maximized geometry but uses the
  keep-above band for `maximizedZIndex`.
- Turning the flag off returns the window to the normal band on the next raise.
- New DE/EN strings for the toggle's two states.

## Acceptance criteria

- [x] `isKeepAbove` defaults to false on every window type.
- [x] The header toggle appears for an ordinary floating window and toggles the
      flag; it is absent for modal and dialog windows and while minimized.
- [x] With the flag on, the window renders above an ordinary and a maximized
      ordinary window, even after the other window is focused.
- [x] Two keep-above windows still reorder among themselves by focus.
- [x] A modal or a promise dialog stays above a keep-above window.
- [x] A maximized keep-above window stays in the keep-above band.
- [x] Turning the flag off returns the window to the normal band.
- [x] Z-index normalization preserves both bands.
- [x] The flag survives a window close/reopen through the existing per-window
      persistence snapshot.
- [x] `Z_LAYERS.windowKeepAbove` is ordered between `windowMax` and `modal` and
      has a matching `--z-window-keep-above` custom property.
- [x] Component/model tests cover the toggle, stacking, modal precedence,
      maximized case, normalization and persistence.
- [x] `npm run check` stays at 0 errors; no hardcoded colours.

## Progress

Implemented as a per-window `isKeepAbove` flag, default off, saved in the
window's existing geometry snapshot. The header toggle renders for ordinary
windows only (not modal, dialog, symbolpicker or minimized), forwards
`aria-pressed`, flips the flag and re-stacks the window immediately; turning
it off returns the window to the normal counter.

Stacking uses a new `Z_LAYERS.windowKeepAbove = 1_025_000` band above the
maximized band and below `modal` (`1_030_000`). `WINDOW_STACK_Z_SPAN = 4_000`
bounds both the maximized and the keep-above ordinals, and
`bringToFront`/`normalizeZIndices` preserve the band. Modals and promise
dialogs share the modal band, so a confirm cannot end up behind a keep-above
window; a modal or dialog also keeps that band when the responsive rule
maximizes it.

Tests cover the default and persistence, the header toggle and its absence for
modal/dialog/minimized, an ordinary and a maximized window focused later, two
keep-above windows, modal and dialog precedence, turning the flag off,
normalization and the z-layer/CSS contract. `npm run check` reports 0 errors
and the existing 6 warnings; ESLint is clean.

## Out of scope

- Keep-below and per-window-type defaults.
- User-defined window rules (FEAT for the rules engine), matching by title,
  class or role, or applying keep-above on open by rule.
- Opacity, shading, skip-taskbar and the other KWin attributes.
- Keep-above for modals, dialogs, the dock and the minimized tiles.
- Changing click-to-focus, focus-follows-mouse or the keyboard switcher.

## Open questions

None blocking. "Pin" in this app already means edge-tiling, so the UI calls this
**keep above** (DE: "Im Vordergrund halten") and does not reuse the pin icon.

## Links

- KWin comparison: [`assets/FEAT-0618/window-manager-comparison.md`](../assets/FEAT-0618/window-manager-comparison.md)
- `src/lib/windows/WindowBase.svelte.ts`
- `src/lib/windows/WindowManager.svelte.ts`
- `src/lib/windows/zLayers.ts`
- `src/components/shared/windows/WindowFrame.svelte`
- `src/themes.css`
