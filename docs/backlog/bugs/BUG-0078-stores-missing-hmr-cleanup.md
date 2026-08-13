---
id: BUG-0078
title: Core stores leak auto-save $effect.root closures and timers during HMR
type: bug
status: ready
priority: P2
milestone: M1
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [BUG-0053]
parent: FEAT-0067
estimate: 2
size: S
start_date: 2026-08-13
target_date: 2026-08-15
---

# BUG-0078 — Core stores leak auto-save $effect.root closures and timers during HMR

## Symptom

When developing locally with Vite's Hot Module Replacement (HMR), modifying store files (e.g. `journal.svelte.ts`, `settings.svelte.ts`, `indicator.svelte.ts`) causes memory leaks and duplicate execution of auto-save loops. The stores initialize `$effect.root` and `setTimeout` loops in their constructors but do not expose a `destroy()` method or hook into `import.meta.hot.dispose()` to tear them down when the module is reloaded.

## Evidence

**Derived**

In `src/stores/chat.svelte.ts` (and `market.svelte.ts`), cleanup is correctly implemented:
```typescript
// HMR: Cleanup on module disposal to prevent memory leaks
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    chatState.destroy();
  });
}
```

However, `src/stores/indicator.svelte.ts` sets up intervals/timeouts but has no `destroy` method:
```typescript
      $effect.root(() => {
        $effect(() => {
          // Track ALL properties by calling toJSON()
          this.toJSON();

          untrack(() => {
            if (this.saveTimer) clearTimeout(this.saveTimer);
            this.saveTimer = setTimeout(() => {
              this.save();
            }, 500);

            if (this.notifyTimer) clearTimeout(this.notifyTimer);
            this.notifyTimer = setTimeout(() => {
              this.notifyListeners();
            }, 50);
          });
        });
      });
```
It lacks `import.meta.hot.dispose` and a mechanism to clear `saveTimer`, `notifyTimer`, and the `$effect.root`.

The same is true for:
- `src/stores/journal.svelte.ts` (`$effect.root` auto-save)
- `src/stores/settings.svelte.ts` (`$effect.root` auto-save)

Every time HMR triggers a reload of these modules, a new `$effect.root` is orphaned and continues to run in the background, firing state derivations and disk writes.

## Cause

Singletons instantiating `$effect.root` and timeouts on module load without hooking into `import.meta.hot.dispose()` to clean up the previous instance's effects.

## Fix

Add a `destroy()` method to `JournalManager`, `SettingsManager`, and `IndicatorSettingsManager` that calls the cleanup function returned by `$effect.root()` and clears any pending timers (`saveTimer`, `notifyTimer`).
Add the HMR disposal block at the bottom of these files.

```typescript
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    journalState.destroy();
  });
}
```

## Acceptance criteria

- [ ] Core stores (`journal`, `settings`, `indicator`) expose a `destroy()` method that halts all internal `$effect.root` instances and timers.
- [ ] Core stores wire `destroy()` to `import.meta.hot.dispose`.

## Out of scope

- Changing auto-save debouncing intervals or storage backends — this item only adds lifecycle cleanup (`destroy()` + `import.meta.hot.dispose()`).
- Refactoring legacy `.subscribe()` subscriber timer behavior — handled separately in BUG-0079.

## Links

- N/A
