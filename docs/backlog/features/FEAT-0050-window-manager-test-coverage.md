---
id: FEAT-0050
title: Put tests under the window manager before more surfaces depend on it
type: feature
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: ui
data_class: A
adr: ADR-0006
depends_on: []
---

# FEAT-0050 — Put tests under the window manager before more surfaces depend on it

## Problem

The window system has **no tests**. `WindowManager.svelte.ts`,
`WindowBase.svelte.ts`, `WindowRegistry.svelte.ts`, `WindowFrame.svelte` and
`WindowContainer.svelte` have no `*.test.ts` beside them, unlike the stores and
services in this repository, which do.

That was tolerable while the window system carried a dozen windows and the other
four overlay systems failed independently.
[`ADR-0006`](../../adr/0006-one-window-stacking-authority.md) makes it carry
everything, which converts every regression in `WindowFrame` from a one-surface
bug into an all-surfaces bug. The ADR names this as the price of the decision,
and this item is how the price gets paid.

The bug items in this batch each carry a reproducing test for their own defect.
This item covers the invariants that no single bug fix owns.

## Proposal

Unit tests beside the code, as the repository does elsewhere.

`WindowManager.svelte.test.ts`
- `bringToFront` orders by focus, including between two maximized windows
- z-index values stay inside the layer the contract assigns
- the capacity limit evicts oldest-first and does not evict a focused window
- `saveSession` debounces and restores from `sessionStorage`
- `isOpen` for an unregistered type returns false and does not throw — the
  failure mode behind the dead `windowManager.isOpen("academy")` branch

`WindowBase.svelte.test.ts`
- viewport clamping keeps a window on screen for each edge
- `updatePosition`/`updateSize` respect `minWidth`/`minHeight` and `aspectRatio`
- `restoreState` tolerates a persisted payload with unknown or since-narrowed
  fields (`WindowFrame.svelte:351-378` documents one such value) and does not
  throw
- `restoreState` runs before `updateResponsiveState`, and the responsive rule
  wins on a small viewport — the ordering is currently an accident of
  constructor order (`WindowBase.svelte.ts:196` vs `223`) and nothing states it

`WindowRegistry.svelte.test.ts`
- every member of the `WindowType` union has a config, which would have caught
  `chatpanel` (`types.ts:190`)
- `getConfig` falls back to `window` for an unknown type

A Playwright case for the drag path, since the touch behaviour in
[`BUG-0042`](../bugs/BUG-0042-window-drag-jumps-on-touch.md) is what unit tests
model least well: drag a window by its header in a mobile viewport and assert the
page did not scroll and the window followed.

## Acceptance criteria

- [ ] Test files exist beside `WindowManager`, `WindowBase` and `WindowRegistry`
- [ ] Each invariant listed above has a test that fails if the invariant is
      removed — verified by removing it, not by assuming
- [ ] A registry test fails today because of `chatpanel`, or `chatpanel` is gone
      per [`FEAT-0045`](FEAT-0045-academy-as-window-type.md)
- [ ] A Playwright case covers header drag in a mobile viewport
- [ ] `npm test` and `npm run check` are clean

## Out of scope

Testing every window implementation's content. The point is the shared frame and
lifecycle, not what each window renders inside it. Visual regression testing.

## Open questions

Whether `WindowFrame.svelte` can be unit-tested meaningfully at 1146 lines or
whether the drag and resize handlers should be extracted into a testable module
first. Worth deciding before writing the Playwright case, since extraction would
move most of that coverage into unit tests.

## Links

- [`ADR-0006`](../../adr/0006-one-window-stacking-authority.md) — "What this costs"
- `src/lib/windows/`, `src/components/shared/windows/`
- `src/stores/quiz.test.ts` for the house style
