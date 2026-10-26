---
id: FEAT-0740
title: Add optional focus-follows-mouse for floating windows
type: feature
status: done
assignee: opencode
branch: feature/feat-0740-focus-follows-mouse
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0044]
---

# FEAT-0740 — Add optional focus-follows-mouse for floating windows

## Problem

Floating windows are raised and focused only by clicking them or by the
keyboard switcher. On a multi-window workspace the pointer must click before
typing, even though the user has already visually selected the window. The KWin
comparison lists focus-follows-mouse as a deferred focus-policy item.

## Proposal

- Add an opt-in display setting `focusFollowsMouse`, default **off**, in the
  Visuals settings and the existing display persistence schema.
- When enabled, hovering a floating window with a **mouse** pointer for
  `FOCUS_FOLLOW_DELAY_MS = 120` ms raises and focuses it. A shorter pass-through
  does nothing.
- Cancel the timer on pointerleave, pointerdown, unmount, or when the setting
  is turned off before it fires.
- Skip when the window is already focused or minimized, when any window is
  being dragged/resized (`.window-frame.interacting`), or when a modal/dialog
  window is open. Those surfaces own focus or are mid-gesture.
- Raise through `windowManager.bringToFront(id, { sweepCloseOnBlur: false })`
  so hovering can never close a `closeOnBlur` window, then focus the frame
  root (`tabindex="-1"`, with `preventScroll`).
- Touch and pen pointers are ignored; this is a mouse-only setting.
- New DE/EN strings for the section title, toggle and description.

## Acceptance criteria

- [x] The setting exists in Visuals, defaults to off, and persists through the
      existing display schema.
- [x] With the setting off, hovering never raises or focuses a window.
- [x] With the setting on, a mouse hover for 120 ms raises and focuses the
      window; leaving before the delay cancels.
- [x] Pointerdown, unmount and turning the setting off before the delay cancel
      the pending focus.
- [x] Touch/pen hovers are ignored.
- [x] No focus change while a window is being dragged/resized or while a
      modal/dialog window is open.
- [x] A hover raise uses `sweepCloseOnBlur: false`, so a `closeOnBlur` window
      stays open.
- [x] The frame root receives DOM focus after the raise.
- [x] Component tests cover delay/cancel/setting/modal/drag/touch and the
      closeOnBlur guard; settings persistence/default tests cover the new key.
- [x] `npm run check` stays at 0 errors; no hardcoded colours.

## Progress

Focus-follows-mouse is a display setting, default off, surfaced under
Visuals → Window behavior and persisted through the display schema. When on,
`WindowFrame` starts a 120 ms timer on a mouse `pointerenter`, then raises via
`windowManager.bringToFront(id, { sweepCloseOnBlur: false })` and focuses the
frame root.

The timer is cancelled by `pointerleave`, any pointerdown (including a click
on another window, via a one-shot capture listener), turning the setting off,
or unmounting. The callback re-checks the setting, focus/minimized state,
modal/dialog ownership, an active drag/resize (`.window-frame.interacting`) and
document visibility. Touch and pen pointers are ignored.

Tests: 88 `WindowFrame` component cases (entry guard, off, 119/120 ms
boundary, leave, setting-off, pointerdown on the frame and elsewhere,
touch/pen, held-button, already-focused, minimized, modal/dialog, modal or drag
appearing during the delay, z-order raise, closeOnBlur, resize/interacting,
visibility, re-entry and unmount cleanup), 5 `VisualsLayout` component cases
(including the new toggle binding), 10 settings display/persistence cases and 6
reactivity-contract cases. `npm run check` reports 0 errors and the existing 6
warnings; ESLint is clean.

## Out of scope

- Keep-above, window rules and configurable delay.
- Focus-follows for the left rail, sidebars, dock or page content.
- Touch/pen focus behaviour.
- Changing the click-to-focus or keyboard-switcher behaviour.

## Open questions

None blocking. The 120 ms delay avoids flicker while crossing a window on the
way to another; it is a named constant so it can be tuned later.

## Links

- KWin comparison: [`assets/FEAT-0618/window-manager-comparison.md`](../assets/FEAT-0618/window-manager-comparison.md)
- `src/components/shared/windows/WindowFrame.svelte`
- `src/lib/windows/WindowManager.svelte.ts`
- `src/stores/settings/display.svelte.ts`
- `src/stores/settings/persistenceSchema.ts`
- `src/components/settings/tabs/VisualsLayout.svelte`
