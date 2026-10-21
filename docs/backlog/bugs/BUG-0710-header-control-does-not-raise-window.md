---
id: BUG-0710
title: Clicking a window header control does not raise its window
type: bug
status: done
branch: fix/window-header-control-focus
priority: P3
milestone: none
created: "2026-10-21"
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
estimate: 1
size: XS
assignee: opencode
---

# BUG-0710 — Clicking a window header control does not raise its window

## Symptom

Clicking a control in a window's title bar — a chart timeframe button, the
timeframe dropdown arrow — changes the control's value but leaves the window
where it is in the stacking order. Clicking anywhere else in the same window
raises and focuses it. A trader working with two chart windows can change a
background window's timeframe while the window in front still covers most of
it, which makes the change look like it did nothing.

## Evidence

**Derived** — the defect follows from the event wiring; no incident was
recorded before this item.

- `src/components/shared/windows/WindowFrame.svelte`: the root frame's
  `onpointerdown={handlePointerDown}` calls `windowManager.bringToFront(win.id)`.
- The header's control container stops the event:
  `onpointerdown={(e) => e.stopPropagation()}` on `.header-controls`, and the
  button repeats the same stop. The event therefore never reaches the frame
  root.
- `startDrag` already ignores pointerdowns from `.header-controls`
  (`e.target.closest(".header-controls")`), so the stops are not what prevents
  dragging — they only remove the focus behaviour.

A component test that dispatches `pointerdown` on a header control reproduces
it: `bringToFront` is not called before the fix.

## Cause

The two `pointerdown` stops on the header controls are redundant for their
original purpose (drag prevention) and swallow the frame-level focus handler.

## Fix

Remove the `pointerdown` stops from `.header-controls` and from the control
button; keep the `click`, `dblclick` and `keydown` stops. The `startDrag`
guard keeps header controls from starting a drag, and the frame root raises the
window exactly as it does for a click on the window body.

## Acceptance criteria

- [x] A component test dispatches `pointerdown` on a header control and asserts
      `windowManager.bringToFront(win.id)`; it fails without the fix
      (`WindowFrame.component.test.ts`, "brings the window to front when a
      header control is pressed" — 0 calls before the change)
- [x] A `pointerdown` on the header background still reaches `startDrag` (the
      frame gets the `dragging` class, and loses it on `pointerup`)
- [x] The control's `click` action still runs after the change

## Out of scope

- Persisting a chart window's timeframe in the session (`saveSession()` is only
  triggered by opening/closing a window) — separate item.

## Links

- `src/components/shared/windows/WindowFrame.svelte`
- `src/lib/windows/WindowManager.svelte.ts`
- Branch: `fix/window-header-control-focus`
