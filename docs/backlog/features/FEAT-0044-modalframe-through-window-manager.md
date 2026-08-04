---
id: FEAT-0044
title: Make ModalFrame an adapter over WindowFrame instead of a second implementation
type: feature
status: specced
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

- [ ] `AcademyModal`, `MarketDashboardModal` and `TpSlEditModal` render with no
      change to their own source
- [ ] All three have a draggable title bar, a close button and working Escape
- [ ] Escape closes the Academy, and the dead `windowManager.isOpen("academy")`
      branch in `+page.svelte:203` is gone
- [ ] Both the Academy and the Market Dashboard go edge-to-edge below 768px,
      without either component asking for it
- [ ] `modal-size-instructions` no longer controls mobile layout for anything
      going through `ModalFrame`
- [ ] Two maximized chart windows stack in focus order; a test asserts
      `bringToFront()` changes which one is on top
- [ ] A test covers restoring persisted state that contains a field the current
      types no longer allow, as `WindowFrame.svelte:351-378` describes

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

Whether `TpSlEditModal` should stay `isResponsive`. It is a small editing form,
and fullscreen-on-phone may be right for it or may be overkill.

## Links

- [`ADR-0006`](../../adr/0006-one-window-stacking-authority.md)
- `src/components/shared/ModalFrame.svelte`
- `src/components/shared/AcademyModal.svelte:46`, `MarketDashboardModal.svelte:155-159`
- `src/lib/windows/types.ts:182-199`, `src/lib/windows/WindowRegistry.svelte.ts`
- `src/components/shared/windows/WindowFrame.svelte:713,351-378`
- `src/routes/+page.svelte:203`
- `src/themes.css:3029-3060`
