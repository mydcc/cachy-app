---
id: FEAT-0044
title: Make ModalFrame an adapter over WindowFrame instead of a second implementation
type: feature
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: A
adr: ADR-0006
depends_on: [FEAT-0041]
---

# FEAT-0044 — Make ModalFrame an adapter over WindowFrame instead of a second implementation

## Problem

`ModalFrame.svelte` is a second, unrelated implementation of a floating surface.
Anything `WindowFrame` learned, its three callers never got: no title bar to
drag, no minimise, no maximise, no geometry persistence, no viewport clamping,
and Escape that only works if the overlay `div` happens to hold focus
(`ModalFrame.svelte:108`) — which nothing arranges.

That last one has a visible consequence. `src/routes/+page.svelte:203` tries to
close the Academy on Escape with `windowManager.isOpen("academy")`, but
`academy` is not in the `WindowType` union (`src/lib/windows/types.ts:182-199`)
and never will be while the Academy is a `ModalFrame`. The call returns `false`
unconditionally, so that line is dead and Escape does not close the Academy.

The mobile rule is worse than missing, it is inconsistent. Fullscreen-on-phone
is opted into by passing the CSS class `modal-size-instructions`
(`AcademyModal.svelte:46`, `themes.css:3036-3045`). `MarketDashboardModal.svelte:155-159`
does not pass it, so two surfaces built from the same component behave
differently on the same device. Layout policy lives in a class name a caller has
to remember.

## Proposal

Keep the component name and its props. Replace its body.

`ModalFrame` registers a `modal`-type window with `WindowManager` on mount and
renders through `WindowFrame`, mapping its existing props onto window options:
`title` → window title, `alignment` → `centerByDefault`, `onclose` → close
handler, `extraClasses`/`bodyClass` → passthrough to the frame's content slot.
All three call sites — `AcademyModal`, `MarketDashboardModal`, `TpSlEditModal` —
stay untouched in this item.

`isResponsive: true` with `edgeToEdgeBreakpoint: 768` moves onto the `modal`
type in `WindowRegistry`, so edge-to-edge on phones follows from the window type
and `modal-size-instructions` stops being how a caller asks for it. Per
ADR-0006 this is the point: responsive behaviour is a window property.

While in this file, fix the maximized-window stacking override. `.window-frame.maximized`
forces `z-index: 20000 !important` (`WindowFrame.svelte:713`), which defeats the
reactive `style:z-index={win.zIndex}` bind, so `bringToFront()` cannot reorder
two maximized windows — reachable today with multiple `chart` instances
(`allowMultipleInstances: true` and `allowMaximize: true`). Maximized windows
take a token from the maximized layer *plus* their focus offset instead of a
flat constant.

## Acceptance criteria

- [x] `AcademyModal`, `MarketDashboardModal` and `TpSlEditModal` render with no
      change to their own source — verified by diff: none of the three files
      were touched
- [x] All three have a draggable title bar, a close button and working Escape
      — inherited from `WindowFrame` automatically; verified live for Academy
      and Market Dashboard via Playwright (drag, close button, Escape), and
      by inspection for TpSlEditModal (identical `<ModalFrame>` usage, no
      caller-specific styling that could interfere)
- [x] Escape closes the Academy, and the dead `windowManager.isOpen("academy")`
      branch in `+page.svelte:203` is gone — removed; Escape now goes through
      `WindowManager`'s own `closeOnBlur` handling (`modal` type sets
      `closeOnBlur: true`), verified via Playwright
- [x] Both the Academy and the Market Dashboard go edge-to-edge below 768px,
      without either component asking for it — `isResponsive`/
      `edgeToEdgeBreakpoint: 768` moved onto the `modal` registry type;
      verified live for Academy at a 390px viewport
- [x] `modal-size-instructions` no longer controls mobile layout for anything
      going through `ModalFrame` — its `@media (max-width: 768px)` block was
      removed from `themes.css`; the desktop width/aspect-ratio rule is now
      inert too (`ModalFrameWindow` computes the equivalent size in JS,
      since `WindowFrame`'s inline `style:width`/`style:height` always win
      over a class), kept non-destructively since `modalState`/`DialogWindow`
      still references the class name (BUG-0010)
- [x] Two maximized chart windows stack in focus order; a test asserts
      `bringToFront()` changes which one is on top —
      `WindowManager.test.ts`'s "bringToFront and maximized windows" block
- [x] A test covers restoring persisted state that contains a field the current
      types no longer allow, as `WindowFrame.svelte:351-378` describes —
      `WindowBase.test.ts`'s "restoreState tolerates unknown persisted
      fields" test

## Out of scope

Registering `academy` and `marketdashboard` as their own window types — that is
[`FEAT-0045`](FEAT-0045-academy-as-window-type.md), deliberately separate so this
item stays revertible per call site. The Academy's own internal layout is
[`BUG-0047`](../bugs/BUG-0047-academy-unusable-on-mobile.md); its glassmorphism
problem is [`BUG-0048`](../bugs/BUG-0048-glass-removes-academy-sidebar-background.md).
Neither is fixed by this item.

`modalState`/`DialogWindow` already renders through the window manager and is
not touched here; see [`BUG-0010`](../bugs/BUG-0010-modal-extraclasses-ignored.md).

## Open questions

Whether `TpSlEditModal` should stay `isResponsive`. Resolved implicitly:
`isResponsive`/`edgeToEdgeBreakpoint` live on the `modal` registry type, not
per-instance, so all three callers get the same rule for consistency (the
premise of ADR-0006 — responsive behaviour is a window-type property, not
something each caller opts into separately). If TpSlEdit's small form turns
out to feel wrong fullscreen on a phone, that's a follow-up bug against the
`modal` type's config, not a reason to special-case one caller here.

## Verification

Backing implementation: `src/lib/windows/implementations/ModalFrameWindow.svelte.ts`
(new `WindowBase` subclass) and `src/components/shared/windows/ModalFrameContent.svelte`
(new content view, deliberately no independent scroll container — `WindowFrame`'s
own `.window-content` is the single scroll boundary, avoiding a BUG-0047-style
nested-overflow bug). `ModalFrame.svelte` itself shrank to a lifecycle
coordinator: an `$effect` opens/closes a `ModalFrameWindow` in step with
`isOpen` (in practice, mount/unmount, since all three callers wrap `ModalFrame`
in their own `{#if}` and always pass `isOpen={true}`), plus two small sync
effects for `title` and the `burnModals` setting (the only reachable branch of
the old title-matching burn config — journal/settings/guide already route
through their own window types and never rendered through `ModalFrame`, per
BUG-0051's findings).

New supporting infrastructure, all in `WindowBase`: `maximizedZIndex` +
`refreshMaximizedZIndex()` (maximized windows now stack independently of the
flat `!important` z-index `WindowFrame.svelte`'s CSS used to force),
`showBackdrop` (read by `WindowContainer` to render a dimming layer behind
backdrop windows), `resolveDoubleClickAction()` (de-duplicates identical
double-click-resolution logic that existed twice in `WindowFrame.svelte`),
and a new `extraClasses` field so a window can carry a caller-specific CSS
class through to its `WindowFrame` render (`WindowContainer` forwards it
generically for both the floating and dock layers). `WindowManager` gained a
global Escape listener that closes the topmost `closeOnBlur` window.

A real regression was caught and fixed before this could ship: the window's
opening `$effect` originally called `windowManager.open(win)` without
`untrack()`. `open()` → `bringToFront()` reads the shared `windowManager`
`$state` window list internally, and without `untrack` that read was recorded
as a dependency of the *opening effect itself* — every subsequent mutation of
that shared array (including the window's own registration moments earlier)
rescheduled the effect, which tore the window down and recreated it in an
immediate loop. Symptom: the window would flash into existence and
self-close before any observer (Playwright, a screenshot, a human) could see
it — `windowManager.windows.length` was reliably `0` a tick later, even
though `open()` visibly ran. Root-caused by tracing `WindowManager.close()`'s
call stack (`update_effect` → `execute_effect_teardown`, proving the *same*
effect was re-running, not a real unmount) back to the untracked read. Fixed
by wrapping window construction and `windowManager.open()` in `untrack()`,
leaving `isOpen` as the effect's only real dependency.

`npm run check` and `npm test` are green (947 passed, 6 skipped, no
regressions; 17 new tests: `resolveDoubleClickAction()`, `maximizedZIndex`/
`refreshMaximizedZIndex()`, `showBackdrop`, the Escape mechanism, `bringToFront`
reordering two maximized windows, and the legacy-persisted-field tolerance
test). Verified end-to-end against the dev server with Playwright: Academy
renders with a title bar, closes via its close button and via Escape,
re-opens, is draggable, keeps its 80vw/1320px-cap/3:2-aspect desktop sizing,
shows a dimming backdrop, and goes edge-to-edge at a 390px viewport with its
close button still reachable; Market Dashboard renders at the registry's
default 800×600; two `ChartWindow` instances maximized back-to-back stack in
open order and `bringToFront()` demonstrably reorders them. TpSlEditModal
was not separately driven through the UI (it requires an open position/order
to reach) but uses `<ModalFrame>` identically to the other two with no
caller-specific styling, so it shares the same verified code path.

No automated component-rendering test exists for the DOM-level assertions
above (no harness in this repo — `FEAT-0050`), so the Playwright pass above
is the only evidence for those; everything else (the z-index/backdrop/
Escape/legacy-field logic itself) is covered by the new unit tests.

## Links

- [`ADR-0006`](../../adr/0006-one-window-stacking-authority.md)
- `src/components/shared/ModalFrame.svelte`
- `src/components/shared/AcademyModal.svelte:46`, `MarketDashboardModal.svelte:155-159`
- `src/lib/windows/types.ts:182-199`, `src/lib/windows/WindowRegistry.svelte.ts`
- `src/components/shared/windows/WindowFrame.svelte:713,351-378`
- `src/routes/+page.svelte:203`
- `src/themes.css:3029-3060`
