---
id: FEAT-0741
title: Keep a floating window above the other windows
type: feature
status: done
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

Every ordinary window shares one z-order: focusing a chart or a settings pane
raises it above every other ordinary window. A small reference window — a
journal entry, an alert panel, a chart — therefore disappears behind the chart
exactly when the trader needs both at once. Edge-pinning is the only per-window
workaround today, but it changes the window's geometry and does not keep it
above a maximized window; it is a different concept.

The KWin comparison lists keep-above as a deferred per-window stacking flag:
"reopen when a calculator or journal must stay visible over another window".
The reference window here is a window-manager window such as the journal, the
alert panel or a chart; the page calculator is not a window.

## Proposal

- Add a per-window `isKeepAbove` flag, default **off**, persisted with the
  window's existing geometry snapshot when that window has its own state key.
  Windows that share one key (news articles) keep the flag for the session
  only, so one article cannot lift every later article.
- Add a header toggle for ordinary windows that are not `closeOnBlur` and not
  minimized (and not modal, dialog or symbol-picker). It shows an "above" icon,
  exposes `aria-pressed`, and toggles the flag; turning it on raises the window
  immediately. The accessible name stays stable; only the tooltip describes
  the next action.
- Add a dedicated stacking band `Z_LAYERS.windowKeepAbove` above the maximized
  band and below the modal band:
  - ordinary unmaximized windows keep the existing counter; a maximized
    ordinary window keeps the existing `windowMax` band;
  - a keep-above window — floating or maximized — is assigned `zIndex` inside
    the new band on every raise, with one focus sequence;
  - modals, promise dialogs and the promise-based symbol picker move into the
    reserved modal band so they stay above keep-above windows;
  - normalization preserves both bands and the order inside the keep-above
    band instead of flattening every window back into the normal range.
- Turning the flag off returns the window to the normal counter, or to the
  `windowMax` band if it is still maximized.
- Keep the keyboard switcher's "most recently focused" contract independent of
  the z-band by recording a separate focus ordinal.
- New DE/EN strings for the toggle's two states.

## Acceptance criteria

- [x] `isKeepAbove` defaults to false on every window type.
- [x] The header toggle appears for an ordinary, non-close-on-blur window and
      toggles the flag; it is absent for modal, dialog, symbol-picker,
      minimized and close-on-blur windows.
- [x] With the flag on, the window renders above an ordinary and a maximized
      ordinary window, even after the other window is focused.
- [x] Two keep-above windows reorder among themselves by focus, including when
      one is maximized and the other is floating.
- [x] A modal, a promise dialog or a symbol picker stays above a keep-above
      window, including through normalization.
- [x] A maximized keep-above window renders from the same keep-above sequence,
      not from `maximizedZIndex`.
- [x] Turning the flag off returns the window to the normal counter, or to the
      `windowMax` band if it is still maximized.
- [x] Z-index normalization preserves both bands and the focus order inside the
      keep-above band.
- [x] The flag survives close/reopen through the per-window persistence
      snapshot; a shared-key window does not persist it.
- [x] The keyboard switcher stays most-recently-focused-first across bands.
- [x] `Z_LAYERS.windowKeepAbove` is ordered between `windowMax` and `modal` and
      has a matching `--z-window-keep-above` custom property.
- [x] Component/model tests cover the toggle, stacking, modal/dialog/picker
      precedence, maximized case, normalization, switcher recency and
      persistence.
- [x] `npm run check` stays at 0 errors; no hardcoded colours.

## Progress

Implemented as a per-window `isKeepAbove` flag, default off, saved in the
window's geometry snapshot when it has its own state key. The header toggle
renders for ordinary, non-close-on-blur windows (not modal, dialog,
symbolpicker or minimized), forwards `aria-pressed`, flips the flag and
re-stacks the window immediately. The accessible name stays constant; the
tooltip changes between the two states.

Stacking uses `Z_LAYERS.windowKeepAbove = 1_025_000`, above the maximized band
and below `modal` (`1_030_000`). A keep-above window uses `zIndex` in that band
even while maximized, so there is one focus sequence; `bringToFront` keeps a
per-band monotonic ordinal and rewrites the band through `normalizeZIndices`
before it can wrap. `WINDOW_STACK_Z_SPAN = 4_000` bounds both the maximized and
the keep-above bands. Modals, promise dialogs and symbol pickers share the
reserved modal band, including when the responsive rule maximizes them, so a
confirm cannot end up behind a keep-above window. The keyboard switcher sorts
by `lastFocusOrder` instead of `zIndex`, which preserves its documented
recency contract across bands.

Tests cover the default and persistence (including the shared-key rule), the
header toggle and its exclusions, an ordinary and a maximized window focused
later, mixed floating/maximized keep-above ordering, the ordinal wrap, modal/
dialog/picker precedence, the dialog band through normalization, the two-window
normalization order, the backdrop relation, switcher recency and the z-layer/
CSS contract. `npm run check` reports 0 errors and the existing 6 warnings;
ESLint is clean.

## Out of scope

- Keep-below and per-window-type defaults.
- User-defined window rules (FEAT for the rules engine), matching by title,
  class or role, or applying keep-above on open by rule.
- Opacity, shading, skip-taskbar and the other KWin attributes.
- Keep-above for close-on-blur windows, modals, dialogs, the dock and the
  minimized tiles.
- Changing the keyboard switcher's hotkey or overlay; only its ordering source
  moves from `zIndex` to `lastFocusOrder`.
- Changing click-to-focus or focus-follows-mouse.

## Open questions

None blocking. "Pin" in this app already means edge-tiling, so the UI calls this
**keep above** (DE: "Im Vordergrund halten") and does not reuse the pin icon.

## Links

- KWin comparison: [`assets/FEAT-0618/window-manager-comparison.md`](../assets/FEAT-0618/window-manager-comparison.md)
- `src/lib/windows/WindowBase.svelte.ts`
- `src/lib/windows/WindowManager.svelte.ts`
- `src/lib/windows/windowSwitcher.ts`
- `src/lib/windows/zLayers.ts`
- `src/components/shared/windows/WindowFrame.svelte`
- `src/components/shared/windows/WindowContainer.svelte`
- `src/themes.css`
- Tests: `src/lib/windows/{WindowBase,WindowManager,zLayers,windowSwitcher}.test.ts`,
  `src/components/shared/windows/{WindowFrame,WindowContainer,WindowSwitcher}.component.test.ts`
