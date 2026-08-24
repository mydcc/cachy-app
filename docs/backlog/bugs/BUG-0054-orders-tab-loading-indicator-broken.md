---
id: BUG-0054
title: Orders-tab loading indicator is broken in both directions
type: bug
status: done
priority: P2
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: []
start_date: 2026-08-08
target_date: 2026-08-13
size: XS
estimate: 1
---


# BUG-0054 — Orders-tab loading indicator is broken in both directions

## Symptom

In the Market Activity panel's Orders tab: with at least one open order, the
loading spinner never appears, no matter how long a refresh (e.g. after
cancelling an order) takes. With zero open orders, the loading spinner never
goes away — it spins forever.

## Evidence

**Derived, not demonstrated** — both halves follow directly from reading the
two pieces of code against each other; no live reproduction was recorded.

**Spinner never disappears with zero orders**
(`src/components/shared/PositionsSidebar.svelte`, pre-fix lines 322-326):

```ts
$effect(() => {
  if (activeTab === "orders" && openOrders.length === 0) {
    fetchPendingOrders();
  }
});
```

`openOrders` is a `$derived` over `accountState.openOrders`, and
`hydrateOpenOrders()` (`src/stores/account.svelte.ts:334`) assigns a **new**
array reference on every call — even when the result is empty. The `$effect`
tracks `openOrders` itself (not a primitive), so every fetch (even one that
resolves to zero orders) produces a new reference, re-triggers the effect,
and re-fetches — forever, as long as the account has no open orders.

**Spinner never appears with ≥1 order**
(`src/components/shared/OpenOrdersList.svelte`, pre-fix line 89):

```svelte
{#if loading && orders.length === 0}
```

The loading UI is gated on the list being empty. A manual refresh (e.g.
`fetchPendingOrders()` called again after `handleCancelOrder`) sets
`loading = true`, but with `orders.length > 0` this branch is never taken —
the refresh is invisible.

## Cause

Two independent design mistakes on the same feature: (1) using object
identity (`openOrders.length === 0` inside a reactive dependency on the array
itself) as a one-shot "fetch once" guard instead of a dedicated flag, and (2)
conflating "list is empty" with "nothing is loading" in the loading UI.

## Fix

1. Replace the length-gated `$effect` with a `hasFetchedOrdersOnce` flag that
   is set once per tab-activation and reset when the tab is left or the API
   key/exchange changes — mirrors the existing pattern already used for
   `fetchAccount`/`fetchPositions` in the API-key-change `$effect`.
2. Keep the existing full-panel spinner for the empty state, and add a
   separate small non-blocking refresh indicator in `OpenOrdersList.svelte`
   for `loading && orders.length > 0`, so an in-flight refresh is visible
   without hiding the existing list.

## Acceptance criteria

- [x] Activating the Orders tab with zero open orders fetches exactly once
      and the spinner settles (no infinite loop)
- [x] Cancelling an order (or any other refresh while ≥1 order is open) shows
      a visible, non-blocking loading indicator
- [x] Switching API key/exchange while on the Orders tab re-fetches
- [x] Existing `account.svelte.ts` tests continue to pass unchanged

## Links

- `src/components/shared/PositionsSidebar.svelte`
- `src/components/shared/OpenOrdersList.svelte`
- `src/stores/account.svelte.ts` — `hydrateOpenOrders()`

## What shipped

Shipped in 1.2.0-beta.30.
