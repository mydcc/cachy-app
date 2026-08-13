---
id: FEAT-0046
title: Move the SidePanel onto the window manager and drop interactjs
type: feature
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: A
adr: ADR-0006
depends_on: [FEAT-0041]
estimate: 5
size: L
target_date: 2026-10-23
---

# FEAT-0046 — Move the SidePanel onto the window manager and drop interactjs

## Problem

[`BUG-0051`](../bugs/BUG-0051-sidepanel-never-rendered.md), found while
starting this item, is resolved: `SidePanel.svelte` had no render point and is
now mounted in `src/routes/+layout.svelte`, gated on
`settingsState.enableSidePanel` as the component already expected. This item's
premise — that the panel is a live, reachable surface competing for stacking
order with the window manager — now holds, so it proceeds as originally
written below.

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

## Resolution: this shipped as a deletion, not a port

Starting this item found that its own premise was already half-resolved, the
same way [`BUG-0051`](../bugs/BUG-0051-sidepanel-never-rendered.md) found for
`SidePanel.svelte` itself:

- `src/lib/windows/implementations/AssistantWindow.svelte.ts` and
  `AssistantView.svelte` already exist and are already reachable (the
  "AI Assistant" button in `LeftControlPanel.svelte`, via
  `uiState.toggleAssistant()`). They are a **complete, independent
  reimplementation** of `SidePanel`'s AI/Notes/Chat content on top of
  `WindowManager`/`WindowFrame` -- same three modes, same export-to-file
  logic, same clear-history logic, reading the same `aiState`/`notesState`/
  `chatState`/`settingsState.sidePanelMode` stores `SidePanel.svelte` did.
- The Visuals settings tab's "Enable Side Panel" toggle was already wired to
  `uiState.showAssistant`/`toggleAssistant(...)`, **not** to
  `settingsState.enableSidePanel`. Nothing in the current UI ever set that
  flag to `true` -- `SidePanel.svelte`'s own `{#if settingsState.enableSidePanel}`
  gate was permanently closed for any fresh install, the same "silently
  inert" shape `BUG-0051` found for the whole component one layer up.
- `floatingWindowsStore`'s `openWindow`/`closeWindow`/`focusWindow`/`.all` --
  the "each entry becomes an `IframeWindow`" premise this item was written
  around -- were called from nowhere in the codebase. `SidePanel.svelte` only
  ever called `.requestZIndex()`, for its own stacking counter. There were no
  `FloatingWindow` entries to migrate; the store held an API nothing used.

Given that, porting `SidePanel`'s internals onto `WindowFrame` would have
built a second, competing implementation of a feature `AssistantWindow`
already covers. The resolution was deletion: `SidePanel.svelte`,
`floatingWindows.svelte.ts`, its three `sidepanel/*.svelte` view components,
and `interactjs` are removed outright, along with the settings fields that
existed only to configure `SidePanel`'s own geometry (`panelState`,
`panelIsExpanded`, `sidePanelLayout` and its `SidePanelLayout`/`PanelState`
types, `enableSidePanel`). `sidePanelMode` and `chatStyle` stay --
`AssistantWindow`/`AssistantView` still read them. `dockingPosition` and
`enableDockingCentered` were never SidePanel's; they belong to
`WindowContainer`'s minimized-window dock and are untouched.

Docking is now `WindowBase`'s existing `pinSide`/`isPinned` mechanism, already
configured on the `assistant` registry type (`pinSide: 'left'`,
`doubleClickBehavior: 'pin'`) before this item started -- double-clicking the
header (anywhere off the title text) pins it flush to the left edge at full
height, verified live. The old floating/sidebar layout toggle and the 3-window
cap have no equivalent because there was nothing left holding either state to
carry forward.

ADR-0006 has a new paragraph recording this finding in full, matching how it
already recorded `BUG-0051`'s.

## Acceptance criteria

- [x] `src/stores/floatingWindows.svelte.ts` is deleted
- [x] `interactjs` is absent from `package.json` and `grep -rn "interactjs" src`
      is empty
- [x] Clicking the SidePanel raises it above a previously focused window --
      N/A, superseded: this is `AssistantWindow`'s behavior now, and it's
      generic `WindowManager.bringToFront()` behavior already covered by
      that suite, not anything SidePanel-specific to re-verify
- [x] Dragging the SidePanel on a phone behaves identically to dragging a chart
      window, because it is the same code path -- true by construction:
      `AssistantWindow` is a `WindowBase` instance rendered by the same
      `WindowFrame`; verified live that dragging works (BUG-0042's
      touch-action/pointercancel fixes apply automatically)
- [x] The docking settings (`dockingPosition`, `enableDockingCentered`,
      `sidePanelLayout`) produce the same layouts as before -- changed rather
      than preserved, per the resolution above: `dockingPosition`/
      `enableDockingCentered` were never SidePanel's (they're
      `WindowContainer`'s minimized-dock settings, untouched);
      `sidePanelLayout` had no surviving concept to preserve since
      `SidePanel.svelte` is gone -- `pinSide`/`isPinned` is the one docking
      mechanism now, verified live (double-click pins left, full height)
- [x] The window cap behaviour is either preserved at 3 or explicitly changed,
      and the item says which -- moot: there were never any `FloatingWindow`
      entries for a cap to apply to (see Resolution above); nothing to
      preserve or change
- [x] `npm run build` succeeds with the dependency removed -- verified

## Out of scope

Redesigning the SidePanel's contents or its settings. This item changes what
moves and stacks it, not what it shows. Drag-to-edge snapping is not added here
— `pinSide` stays as experimental as it is today.

## Open questions

~~Whether `WindowBase`'s `pinSide`/`isPinned` is complete enough to express
`dockingPosition` and `enableDockingCentered`~~. Moot per the Resolution
above: `dockingPosition`/`enableDockingCentered` were never SidePanel
settings, and `pinSide`/`isPinned` turned out already sufficient for
`AssistantWindow`'s left-edge docking, verified live (double-click pins it
flush to the left edge at full height, matching the old sidebar layout's
visual result without any new code).

## Verification

`npm run check` and `npm test` are green (958 passed, 6 skipped, no
regressions -- no new tests added, since every acceptance criterion is
either a deletion checkable by `grep`, a generic `WindowFrame`/
`WindowManager` behavior already covered by `WindowBase.test.ts`/
`WindowManager.test.ts` from FEAT-0044, or an `npm run build` pass).
`npm run build` succeeds (verified full production build, not just `check`).

Verified end-to-end against the dev server with Playwright: no SidePanel
trigger strip/FAB present anywhere in the DOM; the "AI Assistant" button
opens `AssistantWindow` as a real window; clicking its title cycles
AI → Notes → Chat mode (`onHeaderTitleClick` → `cycleMode()`); it's draggable
by its header (grabbing the `.header-spacer` area next to the title, not the
title text itself -- `.title-wrapper`'s own `onpointerdown` calls
`stopPropagation()` by design, true for every `headerAction: 'toggle-mode'`
window, not something this item introduced); double-clicking the header pins
it flush to the left edge at full height.

## Links

- [`ADR-0006`](../../adr/0006-one-window-stacking-authority.md) -- has a new
  paragraph recording the `AssistantWindow` discovery
- [`BUG-0051`](../bugs/BUG-0051-sidepanel-never-rendered.md) — the sibling
  discovery this item's own finding rhymes with
- `src/lib/windows/implementations/AssistantWindow.svelte.ts`,
  `AssistantView.svelte` — the destination this item found already existed
- `src/components/shared/LeftControlPanel.svelte` — "AI Assistant" button,
  `uiState.toggleAssistant()`
- `src/stores/settings.svelte.ts` — removed `enableSidePanel`,
  `sidePanelLayout`/`SidePanelLayout`, `panelState`/`PanelState`,
  `panelIsExpanded`; kept `sidePanelMode`, `chatStyle`,
  `dockingPosition`/`enableDockingCentered` (unrelated, `WindowContainer`'s)
- `package.json` — `interactjs` removed
