---
id: BUG-0056
title: Order history tab shows stale trades
type: bug
status: done
priority: P2
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: []
---

# BUG-0056 — Order history tab shows stale trades

## Symptom

The Market Activity panel's History tab keeps showing the same snapshot of
trades from whenever it was first opened in the session. New fills or
cancellations do not appear, and switching the API key/exchange does not
refresh it either.

## Evidence

**Derived, not demonstrated.**
`src/components/shared/PositionsSidebar.svelte`, pre-fix:

- `historyOrders` (a local `$state`) is only fetched under the guard
  `activeTab === "history" && historyOrders.length === 0` (pre-fix lines
  328-333) — once it has any entries, this never fires again for the rest of
  the session.
- Unlike `fetchPositions`/`fetchAccount`, history is **not** included in the
  "watch API key changes" `$effect` (pre-fix lines 336-345) — switching
  account/exchange leaves the previous account's history on screen.
- There is no WS push channel for order history (confirmed: Bitunix's
  private WS channels cover live positions/orders/balance only, not
  historical fills — `docs/bitunix-api/08_websocket.md`), and no manual
  refresh control existed in `OrderHistoryList.svelte`.
- The server route additionally caps results at the last 20 entries per
  bucket with no time-range parameters
  (`src/routes/api/orders/+server.ts:452`) — a separate, larger gap tracked
  as a follow-up rather than fixed here (see Out of scope).

## Cause

History was implemented as a fetch-once snapshot, unlike positions/orders/
balance which are kept live by the WS layer. Nothing in the surrounding code
invalidates it.

## Fix

- Reset the "fetched once" guard whenever the History tab is left (so
  returning to it refreshes) and whenever the API key/exchange changes
  (matching the existing pattern for positions/account).
- Add a manual refresh button to `OrderHistoryList.svelte`'s header.
- Register an `accountState.registerOrderCloseCallback()` hook: when a WS
  push closes an open order (FILLED/CANCELED/...) while the History tab is
  active, eagerly refetch history instead of waiting for the next tab
  switch.

## Acceptance criteria

- [x] Leaving and returning to the History tab re-fetches
- [x] Changing API key/exchange while on (or later visiting) the History tab
      shows that account's history, not the previous one's
- [x] A manual refresh control exists and works
- [x] Closing an order while History is the active tab refreshes it without
      user action
- [x] A test covers the new `registerOrderCloseCallback` firing/non-firing
      cases in `src/stores/account.test.ts`

## Out of scope

Server-side time-range filtering and pagination beyond the last 20 entries
per bucket (`src/routes/api/orders/+server.ts:452`) — real gap, but a
separate, larger feature. Tracked in
[`FEAT-0057`](../features/FEAT-0057-market-activity-panel-redesign.md) as a
follow-up rather than folded into this fix.

## Links

- `src/components/shared/PositionsSidebar.svelte`
- `src/components/shared/OrderHistoryList.svelte`
- `src/stores/account.svelte.ts` — `registerOrderCloseCallback()`
