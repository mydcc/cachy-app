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

Five independent systems render floating surfaces and each picks its own
z-index. The quiz card sits at `200`, the SidePanel counter starts at `1000`,
modals at `10000`, windows at `11000`, the dock at `12000`, maximized windows at
`20000`, effects at `99999`. Nothing relates these numbers to each other.

Two of the resulting defects are user-visible today: the quiz opens behind any
open window ([`BUG-0049`](../bugs/BUG-0049-quiz-closes-after-every-answer.md)),
and the SidePanel can never come to the front because its counter starts ten
thousand below the window layer.

## Proposal

One file — `src/lib/windows/layers.css` (or a `:root` block in `themes.css`,
whichever keeps the import graph simpler) — defines the ordered layer tokens:

```
--z-content      /* inline UI that is part of page flow */
--z-panel        /* SidePanel, PositionsSidebar, docked chrome */
--z-window       /* WindowManager BASE_Z_INDEX */
--z-window-dock  /* minimized-window dock */
--z-window-max   /* maximized windows */
--z-modal        /* modal + dialog surfaces */
--z-toast        /* toasts, offline banner */
--z-fx           /* FXOverlay, burn effects — never interactive */
```

Every hard-coded value listed in [`ADR-0006`](../../adr/0006-one-window-stacking-authority.md)
is replaced by a `var(--z-…)` reference. `WindowManager.BASE_Z_INDEX` and
`floatingWindowsStore.nextZIndex` read from the same source so that per-surface
increments happen *within* a layer instead of across layers.

This is deliberately mechanical. It changes no behaviour except the two ordering
defects it exists to fix.

## Acceptance criteria

- [ ] `grep -rn "z-index: [0-9]" src/components src/routes` returns no floating
      surface — only inline UI that ADR-0006 puts out of scope
- [ ] `grep -rn "z-\[[0-9]" src` likewise
- [ ] The quiz card renders above an open chart window
- [ ] Clicking the SidePanel brings it above a window that was focused before it
- [ ] A test asserts the layer tokens are strictly ordered, so a later edit
      cannot silently make `--z-modal` lower than `--z-window`
- [ ] Toast and modal no longer tie at the same value

## Out of scope

Merging the systems themselves — that is [`FEAT-0044`](FEAT-0044-modalframe-through-window-manager.md)
and [`FEAT-0046`](FEAT-0046-sidepanel-onto-window-manager.md). This item only
makes their ordering deliberate. `.window-frame.maximized`'s `!important`
override is replaced by a token here but the underlying design problem — that
maximized windows ignore focus order — is fixed in FEAT-0044.

## Open questions

Whether the dock belongs above or below maximized windows. Today it is below
(`12000` vs `20000`), which means maximizing a window hides the dock. That may
be intentional.

## Links

- [`ADR-0006`](../../adr/0006-one-window-stacking-authority.md)
- `src/lib/windows/WindowManager.svelte.ts:29`, `src/stores/floatingWindows.svelte.ts:23`
- `src/components/shared/windows/WindowContainer.svelte:96,122`, `WindowFrame.svelte:713`
- `src/components/shared/ModalFrame.svelte:154`, `FlashCard.svelte:73`
