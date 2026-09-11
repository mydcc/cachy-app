---
id: BUG-0081
title: Trade store leaks auto-save $effect.root closures and timers during HMR
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0081 — Trade store leaks auto-save $effect.root closures and timers during HMR

## Symptom

When developing locally with Vite's Hot Module Replacement (HMR), modifying `src/stores/trade.svelte.ts` causes memory leaks and duplicate execution of auto-save loops. The store initializes an `$effect.root` and a `setTimeout` loop in its constructor but does not expose a `destroy()` method or hook into `import.meta.hot.dispose()` to tear them down when the module is reloaded.

## Evidence

**Derived**

In `src/stores/trade.svelte.ts`, the `TradeManager` class constructor initializes an `$effect.root`:

```typescript
    if (browser) {
      this.load();

      // Auto-save effect
      $effect.root(() => {
        $effect(() => {
          // Explicitly track dependencies by reading snapshot
          const snap = this.getSnapshot();
          this.saveDebounced(snap);

          // Debounced update for in-memory listeners (UI sync, etc.)
          untrack(() => {
            if (this.notifyTimer) clearTimeout(this.notifyTimer);
            this.notifyTimer = setTimeout(() => {
              this.notifyListeners(snap);
            }, 50);
          });
        });
      });
    }
```

Unlike other stores (which were fixed in BUG-0078), `trade.svelte.ts`:
1. Does not capture the return value of `$effect.root` into a cleanup variable (e.g., `this.effectCleanup = $effect.root(...)`).
2. Does not implement a `destroy()` method to call the cleanup function and clear `notifyTimer` and internal debounce timers.
3. Does not contain an `if (import.meta.hot) { import.meta.hot.dispose(() => tradeState.destroy()); }` block at the bottom of the file.

As a result, every time HMR triggers a reload of the module, a new `$effect.root` is orphaned and continues to run in the background, firing state derivations and disk writes.

## Cause

The singleton instance `tradeState` instantiates an `$effect.root` and timeouts on module load but fails to hook into `import.meta.hot.dispose()` to clean up the previous instance's effects, and misses the necessary tracking variables to even do so.

## Fix

1. Add a `private effectCleanup: (() => void) | null = null;` property to `TradeManager`.
2. Capture the `$effect.root` cleanup function: `this.effectCleanup = $effect.root(() => { ... });`
3. Add a `destroy()` method to `TradeManager` that calls `this.effectCleanup()`, clears `this.notifyTimer`, and ideally cancels any pending debounced saves in `saveDebounced`.
4. Add the HMR disposal block at the bottom of the file:
```typescript
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    tradeState.destroy();
  });
}
```

## Acceptance criteria

- [ ] A test reproduces the defect and fails without the fix (e.g. verifying that an orphaned `$effect.root` triggers callbacks after the module should have been disposed).
- [ ] The test passes with the fix.
- [ ] `src/stores/trade.svelte.ts` exposes a `destroy()` method that halts its internal `$effect.root` instance and timers.
- [ ] `src/stores/trade.svelte.ts` wires `destroy()` to `import.meta.hot.dispose`.

## Links

- BUG-0078: Core stores leak auto-save $effect.root closures and timers during HMR
