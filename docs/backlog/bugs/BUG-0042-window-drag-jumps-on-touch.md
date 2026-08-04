---
id: BUG-0042
title: Dragging a window on a touch device jumps and can leave the window stuck to the finger
type: bug
status: done
priority: P1
milestone: M0
editions: [community, pro, private]
area: ui
data_class: A
adr: none
depends_on: []
---

# BUG-0042 — Dragging a window on a touch device jumps and can leave the window stuck to the finger

## Symptom

On a phone, dragging a window by its header is unreliable. The window jumps at
the start of the gesture instead of following the finger, and after some
gestures it keeps following the finger even though the finger was lifted.
Dragging also feels sluggish on lower-end devices.

## Evidence

**Derived**, from three independent mechanisms in `WindowFrame.svelte`. The drag
implementation itself is sound — it uses Pointer Events with
`setPointerCapture` (`startDrag`, `WindowFrame.svelte:83-110`), which is the
correct approach for mouse, touch and pen together.

**1 — no `touch-action`.** `grep -rn "touch-action" src/components src/lib`
returns no hit in the window system at all. Neither `.window-header`
(`WindowFrame.svelte:774-786`) nor `.resize-grip*` (`WindowFrame.svelte:1089-1145`)
sets it, so the browser keeps its native pan/scroll gesture on those elements
and competes with the JavaScript drag for the same movement. This is the
standard cause of a drag that jumps on first movement.

**2 — no `pointercancel` handler.** `startDrag` and `startResize` remove their
listeners on `pointerup` only (`WindowFrame.svelte:101-106` and `204-209`). When
the browser cancels the capture — a system gesture, a long-press context menu —
it fires `pointercancel` instead, so the `pointermove`/`pointerup` listeners are
never removed and `isDragging`/`isResizing` stay `true`. That is both the
stuck-window symptom and a listener leak.

**3 — `saveState()` runs on every pointer move.** `WindowFrame.svelte:219-223`:

```js
$effect(() => {
    if (win.persistent) { win.saveState(); }
});
```

The effect reads `win.x/y/width/height`, which change on every `pointermove`
during a drag. Each run does a synchronous `JSON.stringify` plus
`localStorage.setItem` (`WindowBase.svelte.ts:259-277`) — up to 120 times per
second on a high-refresh touchscreen. The session-level save in
`WindowManager.svelte.ts:90-101` was deliberately debounced at 500 ms; this path
was not.

## Cause

Three separate omissions, all in the same interaction path. They compound: the
scroll conflict produces the jump, the missing `pointercancel` makes a cancelled
gesture leave stale state, and the unthrottled write makes every frame of the
drag slower, which widens the window in which the browser decides the gesture is
a scroll.

## Fix

- `touch-action: none` on `.window-header` and every `.resize-grip*` rule.
- A `pointercancel` handler alongside each `pointerup` handler, running the same
  teardown. Keep the existing `pointerup` path unchanged.
- Debounce `saveState()` the way `saveSession()` already is, and flush it on
  drag end so a geometry change is never lost. Reuse the existing debounce
  constant rather than introducing a second one.

Leave the Pointer Events approach itself alone — it is correct. Do not add a
parallel `touchstart`/`touchmove` path.

Implemented as written, plus one addition not anticipated in the plan above:
`saveState()`'s field list (`x`, `y`, `width`, `height`, `isMaximized`,
`isMinimized`, `isPinned`, `pinSide`, `opacity`, `fontSize`, `zoomLevel`,
`showPriceInTitle`, `symbol`) now lives in one place —
`WindowBase.persistedSnapshot` (`WindowBase.svelte.ts`) — instead of being
hand-duplicated between `saveState()` and the debounced effect. The effect
reads `win.persistedSnapshot` to establish the same reactive dependencies
`saveState()` itself has, without a second, driftable copy of the field list.
`SAVE_DEBOUNCE_MS` is exported from `WindowManager.svelte.ts` and imported by
`WindowFrame.svelte`, per "reuse the existing constant."

## Verification

No automated test was added for this item. This repository has no Svelte
component-rendering test harness (`@testing-library/svelte` is not a
dependency, and no `*.svelte` component has a rendering test anywhere in the
codebase — confirmed by search before starting). Building one is
[`FEAT-0050`](../features/FEAT-0050-window-manager-test-coverage.md)'s job, not
this bug's; doing it here would have been a second, uncoordinated attempt at
the same infrastructure.

Instead, verified against the running dev server with Playwright, driving a
real, CDP-backed mouse pointer (not synthetic `dispatchEvent` — an early
attempt at that showed `setPointerCapture` rejects a pointer id the browser
isn't actively tracking, which does not represent real touch input either):

- `getComputedStyle(header).touchAction` and `...(resizeGrip).touchAction`
  are both `"none"`.
- During a drag, `.window-frame` gains the `dragging` class exactly while the
  pointer is down, and loses it on `pointerup`.
- Across a fast, 20-step interpolated drag, `localStorage.setItem` for the
  window's storage key fires **zero** additional times beyond the baseline
  (one write already pending from the window's own mount) — the debounce
  holds. Releasing the pointer fires exactly **one** more write (the flush),
  and waiting past the 500 ms debounce window afterward fires no further
  write — the cancelled timer does not double-fire.
- Dispatching a `pointercancel` on the pointer id the browser is genuinely
  tracking (mid-drag, after a real `pointerdown`) clears the `dragging` class
  immediately, and a subsequent `pointermove` on that same id no longer moves
  the window — the listeners were removed, not left stale.

## Acceptance criteria

- [ ] A test reproduces the stale-drag state by dispatching `pointercancel`
      after `pointerdown`, and fails without the fix — not done as an
      automated test; verified manually via Playwright per Verification above
- [x] `isDragging` and `isResizing` are `false` after a cancelled gesture, and
      no `pointermove` listener remains attached — verified via Playwright:
      the `dragging` class clears and a subsequent `pointermove` moves nothing
- [ ] A test asserts `localStorage.setItem` is called once, not per frame, for a
      drag made of many `pointermove` events — not done as an automated test;
      verified manually via Playwright per Verification above
- [x] The final geometry after a drag is persisted despite the debounce —
      verified: the window's position changed and exactly one flush write
      followed `pointerup`
- [x] `.window-header` and the resize grips carry `touch-action: none` —
      verified via computed style
- [ ] Dragging a window by its header on a phone follows the finger without
      scrolling the page underneath — the CSS mechanism that prevents this
      (`touch-action: none`) is confirmed present and the Pointer Events path
      is confirmed correct for a real active pointer, but the actual
      scroll-vs-drag race was not observed on a touch-emulated page (avoided
      Playwright's `hasTouch` context option, which was found to interfere
      with pointer-capture behaviour unrelated to this fix)

## Links

- [`ADR-0006`](../../adr/0006-one-window-stacking-authority.md)
- [`FEAT-0050`](../features/FEAT-0050-window-manager-test-coverage.md) — owns building the component-test harness this item's unstarred acceptance criteria need
- `src/components/shared/windows/WindowFrame.svelte` — `startDrag`/`startResize`/`flushSaveState`, the debounced auto-save effect, `.window-header`/`.resize-grip` styles
- `src/lib/windows/WindowBase.svelte.ts` — `persistedSnapshot`, `saveState()`
- `src/lib/windows/WindowManager.svelte.ts:31` — exported `SAVE_DEBOUNCE_MS`
- Related mobile defect: [`BUG-0043`](BUG-0043-responsive-window-remaximizes.md)
