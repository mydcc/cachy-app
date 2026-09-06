---
id: BUG-0362
title: VisibilityController attaches uncleaned document visibilitychange listener without destroy method
type: bug
status: done
shipped: 1.6.0-beta.231
priority: P3
milestone: none
editions: [community, pro, private]
area: indicators
data_class: none
adr: none
depends_on: []
size: XS
assignee: claude
branch: fix/2584-2587-2588-bugfixes
---

# BUG-0362 — VisibilityController attaches uncleaned document visibilitychange listener without destroy method

## Symptom

`VisibilityController` attaches an anonymous listener to `document.addEventListener("visibilitychange")` that is never unbound, leaking references if `ActiveTechnicalsManager` is re-initialized.

## Evidence

**Derived** from `src/services/activeTechnicals/visibilityController.ts:40-47`:

```typescript
if (browser && typeof document !== "undefined") {
    this.isTabVisible = !document.hidden;

    document.addEventListener("visibilitychange", () => {
        this.handleVisibilityChange();
    });
}
```

Neither `VisibilityController` nor `ActiveTechnicalsManager` (`src/services/activeTechnicalsManager.svelte.ts`) defines a `destroy()` method to clean up listeners and pending throttled timeouts.

## Cause

Listener is registered with an anonymous closure and no teardown method exists on the class.

## Fix

1. Define `private onVisibilityChange = () => this.handleVisibilityChange();`.
2. Implement `public destroy(): void` in `VisibilityController` that calls `document.removeEventListener("visibilitychange", this.onVisibilityChange)`.
3. Implement `public destroy(): void` on `ActiveTechnicalsManager` that delegates to `this.visibility.destroy()`, clears all `throttles`, and tears down active effects.

## Evaluation

- **Umfang (Scope):** XS (approx. 20 lines across 2 files)
- **Priorität (Priority):** P3 (Clean lifecycle hygiene)
- **Schwierigkeit (Difficulty):** Low
- **Dringlichkeit (Urgency):** Low

## Acceptance criteria

- [x] `VisibilityController` provides a `destroy()` method that removes the `visibilitychange` listener.
- [x] `ActiveTechnicalsManager.destroy()` cleans up sub-controllers and active timers.
- [x] A unit test verifies that `removeEventListener` is called when `destroy()` is executed.

## Out of scope

- Altering indicator calculation priorities or scheduling intervals.

## Open questions

None.

## Links

- `src/services/activeTechnicals/visibilityController.ts:40-47`
- `src/services/activeTechnicalsManager.svelte.ts:43-60`

## Resolution

Shipped in PR #2676 (squash-merged as `3bf1e1a2`, release 1.6.0-beta.231).

- `VisibilityController` registers a named `onVisibilityChange` handler and
  exposes `destroy()` that removes the exact listener reference.
- `ActiveTechnicalsManager.destroy()` delegates to the controller and also
  clears throttle timers, tears down active `$effect` cleanups, resets
  registry subscriber counts (via new `SubscriptionRegistry.clear()`),
  `pausedCalculations`, `executor.workerState`, the debounce markers and
  the marketWatcher price/ticker/kline registrations read from the
  registered keys — a destroy->re-register of the same key restarts
  monitoring from scratch instead of being suppressed by stale state.
- Both singletons are wired into `import.meta.hot.dispose`, closing the
  production symptom (surviving listener after module re-init under HMR).
- Coverage: destroy test asserts the exact handler reference, cleared
  bookkeeping and the marketWatcher unregister calls.
