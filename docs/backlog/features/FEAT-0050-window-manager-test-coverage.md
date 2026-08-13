---
id: FEAT-0050
title: Put tests under the window manager before more surfaces depend on it
type: feature
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: ui
data_class: A
adr: ADR-0006
depends_on: []
estimate: 2
size: S
target_date: 2026-09-13
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

- [x] Test files exist beside `WindowManager`, `WindowBase` and `WindowRegistry`
      — `WindowRegistry.test.ts` is new; the other two already existed from
      earlier items in this batch and gained the invariants below
- [x] Each invariant listed above has a test that fails if the invariant is
      removed — verified by removing it, not by assuming. One genuinely did:
      the "capacity limit does not evict a focused window" test failed
      against the *actual* code (`open()`'s eviction picked
      `activeWindows[0]` by array position, not focus state), so a real
      window could be silently closed out from under a user who had it in
      front. Fixed in `WindowManager.svelte.ts` alongside the test, not just
      documented as a known gap
- [x] A registry test fails today because of `chatpanel`, or `chatpanel` is gone
      per [`FEAT-0045`](FEAT-0045-academy-as-window-type.md) — gone. The new
      registry test caught a live descendant of the same gap anyway:
      `iframe` had no config either (`getConfig()` was silently falling back
      to `window`'s defaults) — fixed with a real registry entry. Investigating
      that surfaced `IframeWindow`/`openIframe()` itself is apparently
      unreachable from any current UI (`FloatingIframeButton.svelte` uses
      `ChannelWindow` instead) -- recorded as `docs/TODO.md` item 25, the
      same "found it, didn't decide its fate" shape as items 5/8/9/11/17,
      since deciding that is a product call FEAT-0050 wasn't scoped to make
- [x] A Playwright case covers header drag in a mobile viewport --
      `tests/e2e/window-drag-mobile.spec.ts`, verified passing locally
      (`npx playwright test tests/e2e/window-drag-mobile.spec.ts`); not part
      of CI today (no workflow runs Playwright at all currently -- a
      pre-existing gap, out of this item's scope)
- [x] `npm test` and `npm run check` are clean

## Out of scope

Testing every window implementation's content. The point is the shared frame and
lifecycle, not what each window renders inside it. Visual regression testing.

## Open questions

Whether `WindowFrame.svelte` can be unit-tested meaningfully at 1146 lines or
whether the drag and resize handlers should be extracted into a testable module
first. Worth deciding before writing the Playwright case, since extraction would
move most of that coverage into unit tests.

Resolved: no extraction. The Playwright case covers the drag path exactly as
proposed above, end to end through real pointer events -- which is the actual
behavior that matters (BUG-0042 was a touch-input defect, not a unit-testable
formula), and extraction for its own sake wasn't needed to get there.

## Verification

`npm run check` and `npm test` are green (978 passed, 6 skipped, no
regressions; 22 new unit tests across `WindowManager.test.ts` (capacity
eviction incl. the fix above, z-index layer bounds, `isOpen`, `saveSession`
debounce), `WindowBase.test.ts` (viewport clamping per edge, `updateSize`
bounds/aspect-ratio, the restoreState-before-updateResponsiveState ordering),
and the new `WindowRegistry.test.ts`), plus the new Playwright mobile-drag
spec (verified passing locally; not wired into CI, since no Playwright job
exists in this repo's CI yet).

## Links

- [`ADR-0006`](../../adr/0006-one-window-stacking-authority.md) — "What this costs"
- `src/lib/windows/WindowManager.test.ts`, `WindowBase.test.ts`,
  `WindowRegistry.test.ts` (new)
- `tests/e2e/window-drag-mobile.spec.ts` (new)
- `docs/TODO.md` item 25 — `IframeWindow`/`openIframe()` unreachability,
  found while writing the registry completeness test
- `src/stores/quiz.test.ts` for the house style
