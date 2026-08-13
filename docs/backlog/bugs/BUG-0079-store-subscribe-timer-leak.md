---
id: BUG-0079
title: Legacy subscribe() causes memory leaks and race conditions via shared debounce timers
type: bug
status: ready
priority: P1
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
estimate: 5
size: L
target_date: 2026-09-12
---

# BUG-0079 — Legacy subscribe() causes memory leaks and race conditions via shared debounce timers

## Symptom

Repeatedly subscribing and unsubscribing to Svelte 5 stores (such as `journalState`, `uiState`, `presetState`, `chatState`, etc.) using the legacy `.subscribe(fn)` method introduces subtle memory leaks and missed updates. When an unsubscribe occurs, the pending debounce timer may either continue running, triggering a callback on a destroyed component, or when attempting to cleanup, it clears the timer for ALL subscribers, causing active UI components to freeze or miss state updates.

## Evidence

**Derived**

Several stores retain a legacy `.subscribe` method to be compatible with standard Svelte store contracts (e.g. `$journalState` in legacy Svelte components or manual subscriptions).
In `src/stores/journal.svelte.ts`:

```typescript
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;

  // Legacy subscribe for backward compatibility
  subscribe(fn: (value: JournalEntry[]) => void) {
    fn(this.entries);
    return $effect.root(() => {
      $effect(() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- bare read registers the $effect dependency
        this.entries; // Track
        untrack(() => {
          if (this.notifyTimer) clearTimeout(this.notifyTimer);
          this.notifyTimer = setTimeout(() => {
            fn(this.entries);
            this.notifyTimer = null;
          }, 20);
        });
      });
    });
  }
```

1. **Race Condition & Missed Updates**: `notifyTimer` is a *singleton instance property*. If two components subscribe, the second component's `$effect` overrides `this.notifyTimer`. If the first component expects a callback, its timer was just cancelled.
2. **Missing Teardown**: The cleanup function returned is just `$effect.root`'s cleanup. This destroys the effect, but leaves `this.notifyTimer` running if it was already scheduled! The callback `fn(this.entries)` will fire even after the component unsubscribed.
3. **Flawed Teardown (`preset.svelte.ts`)**: Some stores attempt to fix this by returning:
```typescript
    return () => {
      cleanup();
      if (this.notifyTimer) {
        clearTimeout(this.notifyTimer);
        this.notifyTimer = null;
      }
    };
```
But because `this.notifyTimer` is shared across *all* subscribers, unsubscribing one component clears the timer for *every* other active subscriber, permanently halting updates.

This pattern is present in:
- `src/stores/journal.svelte.ts`
- `src/stores/ui.svelte.ts`
- `src/stores/favorites.svelte.ts`
- `src/stores/results.svelte.ts`
- `src/stores/notes.svelte.ts`
- `src/stores/preset.svelte.ts`

## Cause

Using a single instance property `this.notifyTimer` to manage debouncing for multiple independent, closure-based subscriptions.

## Fix

Change the debounce timer to be local to the `subscribe` closure rather than an instance property `this.notifyTimer`.

```typescript
  subscribe(fn: (value: JournalEntry[]) => void) {
    fn(this.entries);
    let localTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = $effect.root(() => {
      $effect(() => {
        this.entries; // Track
        untrack(() => {
          if (localTimer) clearTimeout(localTimer);
          localTimer = setTimeout(() => {
            fn(this.entries);
            localTimer = null;
          }, 20);
        });
      });
    });

    return () => {
      cleanup();
      if (localTimer) clearTimeout(localTimer);
    };
  }
```

Remove `private notifyTimer` from these stores.

## Acceptance criteria

- [ ] A test reproduces the defect and fails without the fix (e.g. verifying that an unsubscribed callback is not called, and that multiple subscribers receive updates).
- [ ] The test passes with the fix.
- [ ] All `notifyTimer` instance properties are removed from `src/stores/*.svelte.ts`.
- [ ] All instances of `subscribe` use a closure-local timer and clear it on unsubscribe.

## Out of scope

- Refactoring UI components to stop calling `.subscribe()` — this item fixes the `.subscribe()` store contract implementation, not the consuming component code.
- HMR auto-save cleanup and module disposal — handled separately in BUG-0078.

## Links

- N/A

