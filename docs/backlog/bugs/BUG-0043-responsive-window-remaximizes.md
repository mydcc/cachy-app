---
id: BUG-0043
title: A responsive window restored by hand on mobile re-maximizes on the next resize event
type: bug
status: specced
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

## Acceptance criteria

- [ ] A test maximizes a responsive window at a small viewport, restores it, then
      dispatches `resize` at the same width, and fails without the fix
- [ ] The window stays restored
- [ ] Returning to a large viewport does not restore a window the user maximized
      by hand
- [ ] A test asserts one `resize` listener exists regardless of how many windows
      are open
- [ ] A non-responsive window whose geometry is outside a shrunk viewport is
      brought back inside on `resize`, without a drag

## Links

- [`ADR-0006`](../../adr/0006-one-window-stacking-authority.md)
- `src/lib/windows/WindowBase.svelte.ts:224-227,238-250,391-413`
- `src/lib/windows/WindowRegistry.svelte.ts` — which types set `isResponsive`
- Related mobile defect: [`BUG-0042`](BUG-0042-window-drag-jumps-on-touch.md)
