---
id: BUG-0361
title: ConnectionManager attaches anonymous window and document listeners with no teardown method
type: bug
status: ready
priority: P2
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
size: S
---

# BUG-0361 — ConnectionManager attaches anonymous window and document listeners with no teardown method

## Symptom

`ConnectionManager` instances attach event listeners to `document` and `window` during construction that can never be removed. In test suites that instantiate multiple instances, or during development with hot module reloading (HMR), listeners accumulate indefinitely on the global window and document objects.

## Evidence

**Derived** from `src/services/connectionManager.ts:71-85`:

```typescript
if (typeof window !== "undefined") {
    document.addEventListener("visibilitychange", () => {
        this.notifyVisibilityChange(document.visibilityState === "visible");
    });

    window.addEventListener("focus", () => this.notifyVisibilityChange(true));
    window.addEventListener("blur", () => this.notifyVisibilityChange(false));
}
```

The event listeners are passed anonymous arrow functions. `ConnectionManager` does not save references to them and has no `destroy()` or cleanup method. (Test comment in `connectionManager.test.ts:232` acknowledges: `"// proves the constructor's addEventListener calls are still in place"`).

## Cause

Omission of listener references and a teardown lifecycle method on `ConnectionManager`.

## Fix

1. Store bound listener methods as class properties (`private handleVisibilityChange = () => ...;`, `private handleFocus = () => ...;`, `private handleBlur = () => ...;`).
2. Add a public `destroy(): void` method to `ConnectionManager` that removes all three listeners using `document.removeEventListener` and `window.removeEventListener`.
3. Clear internal providers and state maps in `destroy()`.
4. Integrate `destroy()` with Vite HMR dispose hooks if applicable.

## Evaluation

- **Umfang (Scope):** S (approx. 25 lines of code)
- **Priorität (Priority):** P2 (Test suite hygiene and leak prevention)
- **Schwierigkeit (Difficulty):** Low
- **Dringlichkeit (Urgency):** Low

## Acceptance criteria

- [ ] `ConnectionManager` provides a `destroy()` method.
- [ ] Calling `destroy()` removes the `visibilitychange`, `focus`, and `blur` listeners from `document` and `window`.
- [ ] A unit test verifies that `removeEventListener` is called with the exact listener references.

## Out of scope

- Changes to how visibility state triggers provider reconnection.

## Open questions

None.

## Links

- [`src/services/connectionManager.ts:71-85`](file:///home/pat/Dokumente/GitHub/cachy-app/src/services/connectionManager.ts#L71-L85)
- [`src/services/connectionManager.test.ts:232`](file:///home/pat/Dokumente/GitHub/cachy-app/src/services/connectionManager.test.ts#L232)
