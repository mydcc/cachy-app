---
id: FEAT-0046
title: Move the SidePanel onto the window manager and drop interactjs
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

# FEAT-0046 — Move the SidePanel onto the window manager and drop interactjs

## Problem

`SidePanel.svelte` is the last floating surface with its own everything: its own
store (`src/stores/floatingWindows.svelte.ts`), its own geometry model, its own
clamping (`clampPanelPosition`, `SidePanel.svelte:231-253`), its own stacking
counter, and its own drag implementation built on **interactjs**
(`SidePanel.svelte:100-190`).

Two drag implementations means every touch fix has to be made twice.
[`BUG-0042`](../bugs/BUG-0042-window-drag-jumps-on-touch.md) fixes `touch-action`
and `pointercancel` in `WindowFrame` only — the SidePanel keeps whatever
interactjs does. Every clamping or persistence improvement has the same problem.

The panel holds iframe content, which `IframeWindow` already models.

## Proposal

Replace `floatingWindowsStore` with `WindowManager` and `SidePanel`'s drag layer
with `WindowFrame`. Each entry the store holds today (`url`, `title`, geometry,
`zIndex` — `floatingWindows.svelte.ts:10-19`) becomes an `IframeWindow`
instance. `openWindow`/`closeWindow`/`focusWindow` map onto the manager's
existing `open`/`close`/`bringToFront`.

Two behaviours in the store need a decision rather than a translation:

- **The 3-window cap.** `maxWindows = 3` with oldest-evicted-first
  (`floatingWindows.svelte.ts:24,39-44`). The manager has its own cap of 20, also
  FIFO. Either express the panel's cap as `maxInstances: 3` on the iframe type,
  or drop it and let the global cap apply.
- **The staggering offsets.** `floatingWindows.svelte.ts:46-49` hard-codes a
  1024×576 centre calculation. `WindowBase` already staggers
  (`WindowBase.svelte.ts:210-218`); the panel should use that, not a second copy.

`interactjs` comes out of `package.json` once nothing imports it.

`settingsState`'s `panelState`, `dockingPosition`, `enableDockingCentered` and
`sidePanelLayout` keep working — docking is a `pinSide`/`isPinned` concept
`WindowBase` already has (`WindowBase.svelte.ts:487-495`), though it is marked
experimental there and may need filling in.

## Acceptance criteria

- [ ] `src/stores/floatingWindows.svelte.ts` is deleted
- [ ] `interactjs` is absent from `package.json` and `grep -rn "interactjs" src`
      is empty
- [ ] Clicking the SidePanel raises it above a previously focused window
- [ ] Dragging the SidePanel on a phone behaves identically to dragging a chart
      window, because it is the same code path
- [ ] The docking settings (`dockingPosition`, `enableDockingCentered`,
      `sidePanelLayout`) produce the same layouts as before
- [ ] The window cap behaviour is either preserved at 3 or explicitly changed,
      and the item says which
- [ ] `npm run build` succeeds with the dependency removed

## Out of scope

Redesigning the SidePanel's contents or its settings. This item changes what
moves and stacks it, not what it shows. Drag-to-edge snapping is not added here
— `pinSide` stays as experimental as it is today.

## Open questions

Whether `WindowBase`'s `pinSide`/`isPinned` is complete enough to express
`dockingPosition` and `enableDockingCentered`, or whether pinning needs work
first. Worth checking before starting; if it does, split it out rather than
growing this item.

## Links

- [`ADR-0006`](../../adr/0006-one-window-stacking-authority.md)
- `src/stores/floatingWindows.svelte.ts`, `src/components/shared/SidePanel.svelte:36-40,100-190,231-253`
- `src/lib/windows/implementations/IframeWindow.svelte.ts`
- `src/lib/windows/WindowBase.svelte.ts:210-218,487-495`
- `src/stores/settings.svelte.ts` — `panelState`, `dockingPosition`, `sidePanelLayout`
