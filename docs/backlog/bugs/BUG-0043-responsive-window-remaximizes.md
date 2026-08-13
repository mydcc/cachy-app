---
id: BUG-0043
title: A responsive window restored by hand on mobile re-maximizes on the next resize event
type: bug
status: done
priority: P2
milestone: M0
editions: [community, pro, private]
area: ui
data_class: A
adr: none
depends_on: []
---

# BUG-0043 — A responsive window restored by hand on mobile re-maximizes on the next resize event

## Symptom

On a phone, un-maximizing a dialog, the symbol picker or the settings pane does
not stick. The window snaps back to fullscreen a moment later — typically as
soon as the on-screen keyboard appears or the address bar collapses. The user
cannot keep a responsive window at a smaller size on mobile.

A second, non-mobile half of the same area: a window that is *not* marked
`isResponsive` is never re-clamped when the viewport shrinks, so rotating the
device or narrowing the browser can leave it partly or entirely off-screen until
the next manual drag.

## Evidence

**Derived.** `WindowBase.svelte.ts:238-250`:

```js
updateResponsiveState() {
    if (!this.isResponsive || typeof window === 'undefined') return;
    const isSmall = window.innerWidth < this.edgeToEdgeBreakpoint;
    if (isSmall && !this.isMaximized) {
        this.maximize();
        this._wasResponsiveMaximized = true;
    } else if (!isSmall && this.isMaximized && this._wasResponsiveMaximized) {
        this.restore();
        this._wasResponsiveMaximized = false;
    }
}
```

`_wasResponsiveMaximized` is only cleared in the *large-viewport* branch.
Restoring the window by hand while the viewport is still small leaves it `true`
and leaves `isMaximized` `false`, so the first branch matches again on the next
`resize` event and re-maximizes. On mobile browsers `resize` fires for the
on-screen keyboard and for address-bar show/hide, so the next event is seconds
away, not minutes.

The handler is also the *only* thing subscribed to `resize`
(`WindowBase.svelte.ts:224-227`) and it returns immediately for any window
without `isResponsive` — which is every type except `dialog`, `symbolpicker` and
`settings` (`WindowRegistry.svelte.ts`). Nothing re-clamps their geometry. The
clamp in `updatePosition` (`WindowBase.svelte.ts:391-413`) only runs on drag.

Each `WindowBase` instance registers its own `resize` listener, so up to 20 fire
per event (the manager's capacity limit).

## Cause

`_wasResponsiveMaximized` tracks "the responsive rule maximized this window" but
is never invalidated when the user overrides that decision. There is no path
that observes a manual `restore()` while small.

## Fix

Clear `_wasResponsiveMaximized` whenever `restore()` or `maximize()` is called
from user intent rather than from `updateResponsiveState()`. The simplest honest
shape is an explicit argument or a separate internal method, so the flag means
"the responsive rule owns this window's maximized state" and stops meaning it
the moment the user takes over.

Separately, move the `resize` subscription to `WindowManager`: one listener that
iterates open windows, calls `updateResponsiveState()` on the responsive ones and
re-clamps geometry on the rest. This removes the 20-listener fan-out and gives
non-responsive windows the missing re-clamp.

Do not change which types are `isResponsive` — that is
[`FEAT-0044`](../features/FEAT-0044-modalframe-through-window-manager.md).

Implemented as written. `_wasResponsiveMaximized` now means exactly "the
responsive rule owns this window's current maximized state" — `maximize()`
called by user action never sets it, and `restore()` always clears it. A
second flag, `_responsiveOverridden`, is set by `restore()` when it undoes a
responsive maximize *while the viewport is still below the breakpoint*, and
is the thing `updateResponsiveState()`'s small-viewport branch now checks
before re-maximizing. It clears the moment the viewport crosses back above
the breakpoint, so a later small session (e.g. rotating back to portrait)
re-applies the rule fresh rather than remembering an old override forever.

The per-instance `resize` listener and `resizeHandler` field are gone from
`WindowBase`; `destroy()` is now an empty stub kept only because subclasses
call `super.destroy()`. `WindowManager`'s constructor registers one `resize`
listener that calls a new `WindowBase.handleViewportResize()` on every open
window — `updateResponsiveState()` plus `updatePosition(this.x, this.y)`,
reusing the existing clamp instead of duplicating it, which is what gives
non-responsive windows the missing re-clamp for free.

One thing found while verifying, not part of the fix: of the three
`isResponsive` types, `dialog` and `symbolpicker` both set
`allowMaximize: false`, so neither currently exposes any window-chrome
control a user could use to restore them by hand — only `settings` allows
manual maximize/restore among the three, and `settings` itself has no
concrete `WindowBase` subclass wired into the app (no `SettingsWindow`
implementation was found), so it isn't reachable through the UI either. The
fix is still correct and necessary for any responsive+restorable window,
current or future; it just couldn't be exercised through the running app's
own UI chrome for browser verification below, which used the real
`windowManager` singleton directly instead.

## Verification

Three unit test files (real logic tests, not component-rendering tests —
`WindowBase` is a plain class):

- `src/lib/windows/WindowBase.test.ts` — 9 tests covering: auto-maximize
  below the breakpoint, restoring while still small stays restored across
  repeated `updateResponsiveState()` calls, a fresh small session (after
  returning to large) re-applies the rule, a user-maximized window is not
  auto-restored on a later resize, a responsive-maximized window still
  restores once the viewport grows, non-responsive windows are untouched,
  `handleViewportResize()` re-clamps an off-screen non-responsive window and
  leaves an in-bounds one alone, and constructing a `WindowBase` adds no
  `resize` listener.
- `src/lib/windows/WindowManager.test.ts` — 3 tests covering: one `resize`
  event calls `handleViewportResize()` on every open window, a closed window
  stops receiving calls, and opening several windows adds no further
  `window`-level `resize` listeners.

All 12 pass; `npm run check` clean; full suite (924 tests) green.

Additionally verified against the real running app with Playwright, driving
the actual `windowManager` singleton via a dynamic import in the page
context (since `symbolpicker` has no restore button, per the note above):
opened the symbol picker at a 390px viewport (auto-maximized, as expected),
called `win.restore()` on the live instance, then dispatched two real native
`resize` events at the same width — `isMaximized` stayed `false` throughout,
and the DOM (`.window-frame`'s `maximized` class) reflected it correctly.

## Acceptance criteria

- [x] A test maximizes a responsive window at a small viewport, restores it, then
      dispatches `resize` at the same width, and fails without the fix —
      `WindowBase.test.ts` "does not re-maximize a window the user restored
      while still small"
- [x] The window stays restored — same test, and confirmed live in the
      running app per Verification above
- [x] Returning to a large viewport does not restore a window the user maximized
      by hand — `WindowBase.test.ts` "does not restore a window the user
      maximized by hand once the viewport grows"
- [x] A test asserts one `resize` listener exists regardless of how many windows
      are open — `WindowBase.test.ts` "adds no 'resize' listener when a
      window is constructed" and `WindowManager.test.ts` "registers exactly
      one 'resize' listener regardless of how many windows are open"
- [x] A non-responsive window whose geometry is outside a shrunk viewport is
      brought back inside on `resize`, without a drag —
      `WindowBase.test.ts` "re-clamps a non-responsive window that is now
      outside a shrunk viewport"

## Links

- [`ADR-0006`](../../adr/0006-one-window-stacking-authority.md)
- `src/lib/windows/WindowBase.svelte.ts` — `updateResponsiveState()`, `restore()`, `handleViewportResize()`
- `src/lib/windows/WindowManager.svelte.ts` — the single `resize` listener in its constructor
- `src/lib/windows/WindowBase.test.ts`, `src/lib/windows/WindowManager.test.ts`
- `src/lib/windows/WindowRegistry.svelte.ts` — which types set `isResponsive`; `settings` is registered but has no reachable implementation
- Related mobile defect: [`BUG-0042`](BUG-0042-window-drag-jumps-on-touch.md)
