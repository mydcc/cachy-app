---
id: BUG-0358
title: MarketOverview duplicate effects register price and ticker channels twice per tile
type: bug
status: done
assignee: antigravity
shipped: 1.6.0-beta.216
priority: P2
milestone: none
editions: [community, pro, private]
area: market
data_class: none
adr: none
depends_on: []
size: XS
---

# BUG-0358 — MarketOverview duplicate effects register price and ticker channels twice per tile

## Symptom

Every mounted `MarketOverview` tile issues duplicate subscription registrations for `price` and `ticker` to `MarketWatcher` and `SubscriptionRegistry`. For a setup with an active symbol and four favorite tiles, 20 registration cycles run instead of 10, causing redundant registry updates and teardown overhead.

## Evidence

**Derived** from inspecting `src/components/shared/MarketOverview.svelte`:

First effect block at lines 191–202:
```typescript
// Price and Ticker Data Subscription
$effect(() => {
  if (symbol && symbol.length >= 3) {
    untrack(() => {
      marketWatcher.register(symbol, "price");
      marketWatcher.register(symbol, "ticker");
    });
    return () => {
      marketWatcher.unregister(symbol, "price");
      marketWatcher.unregister(symbol, "ticker");
    };
  }
});
```

Second effect block at lines 284–295:
```typescript
// Watch for symbol or provider changes (Ticker & Price)
$effect(() => {
  if (symbol) {
    untrack(() => {
      marketWatcher.register(symbol, "price");
      marketWatcher.register(symbol, "ticker");
    });
    return () => {
      marketWatcher.unregister(symbol, "price");
      marketWatcher.unregister(symbol, "ticker");
    };
  }
});
```

## Cause

An earlier refactor duplicated the registration block into two different locations in `MarketOverview.svelte`, leading to double registration for identical channels on the same component instance.

## Fix

Remove the redundant `$effect` block on lines 284–295, keeping the guarded version on lines 191–202 (or merge any provider reactivity explicitly).

## Evaluation

- **Umfang (Scope):** XS (approx. 12 lines removed)
- **Priorität (Priority):** P2 (Subscription churn and unnecessary CPU cycles)
- **Schwierigkeit (Difficulty):** Low (pure deduplication)
- **Dringlichkeit (Urgency):** Medium

## Acceptance criteria

- [x] Mounting a single `MarketOverview` tile calls `marketWatcher.register` exactly once for `price` and once for `ticker`.
- [x] Unmounting the tile decrements registration counts to zero cleanly.
- [x] Component test asserts registration count and unmount behavior.

## Out of scope

- Modifying the `SubscriptionRegistry` reference counting logic.

## Open questions

None.

## Links

- `src/components/shared/MarketOverview.svelte:191-202`
- `src/components/shared/MarketOverview.svelte:284-295`
