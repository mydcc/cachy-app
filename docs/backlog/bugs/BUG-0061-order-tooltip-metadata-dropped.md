---
id: BUG-0061
title: Order tooltip shows empty leverage/margin mode/qty/created date regardless of what the exchange returns
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


# BUG-0061 — Order tooltip shows empty leverage/margin mode/qty/created date regardless of what the exchange returns

## Symptom

Reported while verifying BUG-0060's fix: the order tooltip (hover on an
entry in the Orders or History tab) shows "Leverage: x" (no number), an
empty "Margin" row, and "Qty: -" even for a filled order whose "Filled"
row correctly shows a real quantity.

## Evidence

**Demonstrated by code inspection**, cross-checked against
`docs/bitunix-api/07_trade.md` and `08_websocket.md`.

Three independent gaps, all in the order data path (distinct from
BUG-0060's position/account envelope bug):

1. **Server never mapped leverage/marginMode/positionMode/TP-SL.**
   `fetchBitunixPendingOrders()`/`fetchBitunixHistoryOrders()`
   (`src/routes/api/orders/+server.ts`) built their `NormalizedOrder`
   objects without `leverage`, `marginMode`, `positionMode`, `tpPrice`,
   `tpStopType`, `tpOrderType`, `slPrice`, `slStopType`, `slOrderType`, or
   `mtime` — even though Bitunix documents all of them on both endpoints
   ("Analog zu Get History Orders" for pending) and the raw response
   examples show them present. `NormalizedOrder`
   (`src/types/bitunix.ts`) already declared these fields; they were just
   never read off the raw response.

2. **`OpenOrder` (the Orders-tab store type,
   `src/stores/account.svelte.ts`) dropped them again** even after fix #1:
   the interface had no fields for them, so `hydrateOpenOrders()` silently
   discarded whatever the server now sent, and `updateOrderFromWs()` had
   nowhere to put the WS order channel's equivalent fields (which use a
   different name, `positionType`, for margin mode —
   `docs/bitunix-api/08_websocket.md:235` — not a typo to unify with REST's
   `marginMode`). This only affected the Orders (pending) tab; History
   reads straight off the server response and was fixed by #1 alone.

3. **`OrderDetailsTooltip.svelte` read the wrong field names entirely**:
   `order.qty` (doesn't exist on `NormalizedOrder`, only `order.amount`
   does) and `order.ctime`/`order.mtime` for the "Created" row (the field
   is `order.time`, `ctime` doesn't exist on `NormalizedOrder`) — both
   always undefined regardless of #1/#2.

## Fix

1. `src/routes/api/orders/+server.ts`: both mapping functions now include
   `leverage`, `marginMode`, `positionMode`, `mtime`, and the six TP/SL
   fields.
2. `src/stores/account.svelte.ts`: extended `OpenOrder` and `RawWsOrder`
   with the same fields (plain strings, no Decimal parsing needed — these
   are descriptive metadata, not prices/amounts). `updateOrderFromWs()`
   preserves them across a push that omits them, the same way
   `updatePositionFromWs()` preserves `liquidationPrice`/`markPrice`.
3. `src/components/shared/PositionsSidebar.svelte`: the `openOrders`
   `$derived` now passes these fields through to the tooltip.
4. `src/components/shared/OrderDetailsTooltip.svelte`: reads
   `order.amount` (not `order.qty`) and `order.time` (not `order.ctime`),
   each with a defensive fallback to the wrong name for the tooltip's other
   loosely-typed callers.

## Acceptance criteria

- [x] A server-level test (`orders_leverage_marginmode.test.ts`) confirms
      both `fetchBitunixPendingOrders`/`fetchBitunixHistoryOrders` map
      leverage/marginMode/positionMode/TP-SL/mtime
- [x] A store-level test confirms `hydrateOpenOrders()` and
      `updateOrderFromWs()` (both the "positionType" WS field name and
      preservation across an update that omits the fields) carry them
      through to `accountState.openOrders`
- [x] `npm run check` and the full Vitest suite pass

## Links

- [`BUG-0060`](BUG-0060-positions-account-envelope-mismatch.md) — the
  report that led here
- `src/routes/api/orders/+server.ts`
- `src/stores/account.svelte.ts` — `OpenOrder`, `RawWsOrder`,
  `updateOrderFromWs()`, `hydrateOpenOrders()`
- `src/components/shared/OrderDetailsTooltip.svelte`,
  `PositionsSidebar.svelte`
- `docs/bitunix-api/07_trade.md:294-325`,
  `docs/bitunix-api/08_websocket.md:216-256`
