---
id: FEAT-0737
title: Add a keyboard window switcher
type: feature
status: done
assignee: opencode
branch: feature/feat-0737-window-switcher
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0616]
---

# FEAT-0737 — Add a keyboard window switcher

## Problem

Open windows overlap, and the only way to bring one forward is the mouse: the
dock lists minimized windows, but it is pointer-oriented, and a keyboard user
cannot cycle the windows that are already open. The KWin comparison marks the
window switcher as the next candidate for exactly this reason.

`Alt+Tab` is not available to a web app: the operating system or the browser
consumes it before the page sees it. The app needs its own shortcut and an
in-app overlay, not a synthetic Alt+Tab.

## Proposal

- Add a `WINDOW_SWITCHER` action to `HOTKEY_ACTIONS`, category
  "UI & Navigation", default `Alt+W`, customizable through the existing hotkey
  settings. Map it in the safety and hybrid modes; direct mode stays without
  it because a bare `W` belongs to typing.
- Add a small `windowSwitcherState` rune store (`open`/`close`/`toggle`) and a
  `WindowSwitcher.svelte` overlay mounted in `WindowContainer`.
- On open, snapshot the open non-modal windows ordered by z-index, most recent
  first. The default selection is the second entry (the next window); with only
  one window it is that window. Arrow keys cycle with wrap, Enter/Space and a
  click commit, Escape and a backdrop click cancel, Tab stays inside the
  overlay.
- Committing restores a minimized window, calls `windowManager.bringToFront`,
  closes the overlay and moves focus to the selected window frame. The frame
  gains `data-window-id` and `tabindex="-1"` so it is a real focus target.
- Each row shows the window title and a "minimized" badge. No thumbnails: the
  app cannot cheaply screenshot live component trees, and a stale thumbnail is
  worse than a title.
- Add `Z_LAYERS.switcher` between `modal` and `toast` (CSS custom property
  `--z-window-switcher`) so the overlay sits above every window and modal but
  below toasts.
- New i18n keys in DE and EN: switcher title, hint, minimized badge.

Modal and dialog windows are excluded from the list. They are blocking tasks
that own focus while open; moving focus to a window behind a modal would look
like a no-op. The switcher is for the ordinary overlapping windows.

## Acceptance criteria

- [x] `Alt+W` opens the switcher; the binding is listed in the hotkey settings
      and a custom binding replaces it.
- [x] Safety and hybrid modes bind it; direct mode does not.
- [x] The overlay lists every open non-modal window, most recent first, and
      includes minimized windows.
- [x] The initial selection is the next window, not the currently focused one;
      with one window it is that window.
- [x] Arrow keys cycle with wrap; Enter/Space and a click commit; Escape and a
      backdrop click cancel.
- [x] Committing restores a minimized window and focuses the selected frame;
      `data-window-id` and `tabindex="-1"` exist on every frame.
- [x] The overlay is a labelled dialog with a listbox and options, has a visible
      keyboard hint, and traps Tab.
- [x] The new z-layer is declared in `zLayers.ts` and `themes.css` and asserted
      by the existing layer test.
- [x] No hardcoded colours; every effect that registers a listener returns a
      cleanup.
- [x] Targeted component/unit tests and `npm run check` pass; existing window
      behaviour is unchanged.

## Progress

`Alt+W` now opens `WindowSwitcher.svelte` from `WindowContainer`. The overlay
snapshots the non-modal windows by z-index, preselects the window after the
focused one, cycles with arrow keys, commits on Enter/Space or click, and
cancels on Escape or the backdrop. Committing restores a minimized window,
raises it through `windowManager.bringToFront` and focuses its frame.

The hotkey is a regular `HOTKEY_ACTIONS` entry (safety and hybrid modes, not
direct mode), so the existing settings editor can rebind it. While a
modal/dialog is open the hotkey does nothing: those windows own focus and
switching behind them would be a no-op.

The overlay has its own `Z_LAYERS.switcher` / `--z-window-switcher` slot
between modal and toast. `WindowFrame` gained `data-window-id` and
`tabindex="-1"` so the commit can focus the selected frame.

Tests: 13 unit cases (ordering/filter, store, z-layer, hotkey registration),
7 component cases (order, default selection, wrap, restore, Escape/backdrop,
Tab trap, dialog semantics) and the 29 existing `WindowFrame` cases including
the new focus-target assertion. `npm run check` reports 0 errors and the
existing 6 warnings. No production behaviour outside the window layer changed.

## Out of scope

- Intercepting the operating system's `Alt+Tab`.
- Thumbnails, window previews or grouping.
- Window-to-window snapping, quarter tiling and window rules.
- Reordering the dock or changing z-order semantics.
- Touch gestures.

## Open questions

None blocking. `Alt+W` is the default because the browser cannot own
`Alt+Tab`; the existing hotkey editor makes it replaceable.

## Links

- KWin comparison: [`assets/FEAT-0618/window-manager-comparison.md`](../assets/FEAT-0618/window-manager-comparison.md)
- `src/services/hotkeyService.ts`
- `src/lib/windows/WindowManager.svelte.ts`
- `src/lib/windows/WindowBase.svelte.ts`
- `src/components/shared/windows/WindowContainer.svelte`
- `src/components/shared/windows/WindowFrame.svelte`
- `src/lib/windows/zLayers.ts`
