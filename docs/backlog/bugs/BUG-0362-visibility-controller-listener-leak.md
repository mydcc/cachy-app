---
id: BUG-0362
title: VisibilityController attaches uncleaned document visibilitychange listener without destroy method
type: bug
status: in-progress
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

- [ ] `VisibilityController` provides a `destroy()` method that removes the `visibilitychange` listener.
- [ ] `ActiveTechnicalsManager.destroy()` cleans up sub-controllers and active timers.
- [ ] A unit test verifies that `removeEventListener` is called when `destroy()` is executed.

## Out of scope

- Altering indicator calculation priorities or scheduling intervals.

## Open questions

None.

## Links

- `src/services/activeTechnicals/visibilityController.ts:40-47`
- `src/services/activeTechnicalsManager.svelte.ts:43-60`
