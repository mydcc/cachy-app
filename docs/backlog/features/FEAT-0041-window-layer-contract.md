---
id: FEAT-0041
title: Give every floating surface its z-index from one layer contract
type: feature
status: specced
priority: P1
milestone: M0
editions: [community, pro, private]
area: ui
data_class: none
adr: ADR-0006
depends_on: []
---

# FEAT-0041 — Give every floating surface its z-index from one layer contract

## Problem

Independent systems render floating surfaces and each picks its own z-index.
The quiz card sits at `200`, modals at `10000`, windows at `11000`, the dock at
`12000`, maximized windows at `20000`, effects at `99999`. Nothing relates these
numbers to each other.

The user-visible defect: the quiz opens behind any open window
([`BUG-0049`](../bugs/BUG-0049-quiz-closes-after-every-answer.md)).

`floatingWindowsStore` and `SidePanel.svelte` were originally in scope here too
— the SidePanel's counter starting at `1000` looked like the same class of bug.
It turns out `SidePanel.svelte` is not rendered anywhere in the app
([`BUG-0051`](../bugs/BUG-0051-sidepanel-never-rendered.md)), so there is no
live stacking defect to fix there yet. This item does not touch
`floatingWindowsStore` or `SidePanel.svelte`; that is picked back up in
[`FEAT-0046`](FEAT-0046-sidepanel-onto-window-manager.md) once BUG-0051 is
resolved.

Three more global, unanchored overlays carry the same disorder without having
been named in ADR-0006's table: the offline banner (`z-[100]`, actually *below*
the window layer today), the disclaimer notice (`z-[9999]`) and the hotkey
conflict warning (`z-[10000]`). None of them are anchored to a control — per
ADR-0006 they are in scope the same way toasts are.

## Proposal

One file — `src/lib/windows/layers.css` (or a `:root` block in `themes.css`,
whichever keeps the import graph simpler) — defines the ordered layer tokens:

```
--z-content      /* inline UI that is part of page flow — not touched here */
--z-window       /* WindowManager BASE_Z_INDEX */
--z-window-dock  /* minimized-window dock */
--z-window-max   /* maximized windows */
--z-modal        /* modal + dialog surfaces, the quiz card */
--z-toast        /* toasts, offline banner, disclaimer, hotkey conflict notice */
--z-fx           /* FXOverlay, burn effects — never interactive */
```

`WindowManager.svelte.ts`'s `_nextZIndex` counter and `MAX_SAFE_Z_INDEX`
normalization threshold stay as they are (`BASE_Z_INDEX = 11000`,
normalizing back to it at `1000000`) — that is a working, tested mechanism and
this item does not touch it. The other layers are placed in bands above that
ceiling (`--z-window-dock` etc. in the `1_000_000+` range) so the window layer's
own long-session growth can never cross into them. A shared `src/lib/windows/zLayers.ts`
module is the one place both the CSS values and any JS that needs the numbers
(none currently do, beyond the window layer itself) are allowed to originate
from.

Every hard-coded value named above is replaced by a `var(--z-…)` reference.

This is deliberately mechanical. It changes no behaviour except the ordering
defects it exists to fix.

## Acceptance criteria

- [ ] `grep -rn "z-index: [0-9]" src/components src/routes` returns no floating
      surface — only inline UI that ADR-0006 puts out of scope
- [ ] `grep -rn "z-\[[0-9]" src` likewise
- [ ] The quiz card renders above an open chart window
- [ ] A test asserts the layer tokens are strictly ordered, so a later edit
      cannot silently make `--z-modal` lower than `--z-window`
- [ ] Toast and modal no longer tie at the same value
- [ ] The offline banner, disclaimer notice and hotkey conflict warning use the
      toast layer instead of their current ad hoc values

## Out of scope

Merging the systems themselves — that is [`FEAT-0044`](FEAT-0044-modalframe-through-window-manager.md)
and [`FEAT-0046`](FEAT-0046-sidepanel-onto-window-manager.md). This item only
makes their ordering deliberate. `.window-frame.maximized`'s `!important`
override is replaced by a token here but the underlying design problem — that
maximized windows ignore focus order — is fixed in FEAT-0044.

`floatingWindowsStore` and `SidePanel.svelte` — blocked on
[`BUG-0051`](../bugs/BUG-0051-sidepanel-never-rendered.md), see Problem above.

Anchored/local stacking per ADR-0006's explicit carve-out — for example
`Tooltip.svelte`, `PositionTooltip.svelte`, `ChartPatternChart.svelte`'s
tooltip, `PositionsSidebar`'s context menu, `+layout.svelte`'s
cursor-following tooltip, `AccountSummary`'s hover dropdown,
`FloatingIframeButton`'s dropdown, `JournalTable`'s hover preview, form-input
suggestion lists, the visual bar, and `WindowFrame.svelte`'s own internal
stacking for its header dropdown and resize grips (`WindowFrame.svelte:776,1040,1091`)
— all of them establish a local stacking context rather than competing for a
place among floating surfaces.

## Open questions

Whether the dock belongs above or below maximized windows. Today it is below
(`12000` vs `20000`), which means maximizing a window hides the dock. That may
be intentional.

## Links

- [`ADR-0006`](../../adr/0006-one-window-stacking-authority.md)
- [`BUG-0051`](../bugs/BUG-0051-sidepanel-never-rendered.md)
- `src/lib/windows/WindowManager.svelte.ts:29`
- `src/components/shared/windows/WindowContainer.svelte:96,122`, `WindowFrame.svelte:713`
- `src/components/shared/ModalFrame.svelte:154`, `FlashCard.svelte:73`
- `src/components/shared/ToastContainer.svelte:39`, `FXOverlay.svelte:528`
- `src/components/shared/OfflineBanner.svelte:50`, `DisclaimerModal.svelte:42`
- `src/components/settings/HotkeySettings.svelte:191`
