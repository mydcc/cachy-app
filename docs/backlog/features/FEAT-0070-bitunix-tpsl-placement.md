---
id: FEAT-0070
title: Place new TP/SL orders on existing Bitunix positions
type: feature
status: done
priority: P1
milestone: M3
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
estimate: 3
size: M
target_date: 2026-12-08
start_date: 2026-08-09
---


# FEAT-0070 — Place new TP/SL orders on existing Bitunix positions

## Problem

Cachy can list, modify and cancel Bitunix TP/SL orders but cannot **create**
one: neither `POST /tpsl/place_order` (partial quantity) nor
`POST /tpsl/position/place_order` (position-wide, max one per position) is
integrated — see [`06_tp_sl.md`](../../bitunix-api/06_tp_sl.md) and
[`INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md) §1. A
position opened without TP/SL (or whose TP/SL was cancelled) can only be
protected through the exchange's own UI.

## Proposal

Add `place` and `place-position` actions to the `/api/tpsl` proxy route and
`tradeService`, and extend the TP/SL edit modal so it can create where nothing
exists: position-wide TP/SL (closes at market, tracks position size) and
partial TP/SL with explicit `tpQty`/`slQty`. Success is confirmed via
WS/refetch, not the REST response alone.

## Acceptance criteria

- [x] A position without TP/SL can be given a position-wide TP, SL or both
      from the positions UI ([`TpSlCreateModal`](../../../src/components/shared/TpSlCreateModal.svelte));
      the new order appears in the pending TP/SL list (`tpSlState.invalidate()`
      on success forces the shared cache to refetch).
- [x] A partial TP/SL with explicit quantity can be created; the quantity is
      validated against the position size client-side (not against other
      partial plans already reserving part of it — the store does not
      reliably enumerate every partial plan on a symbol, see BUG-0266 — the
      venue enforces that bound).
- [x] The API constraint "one position-TP/SL per position" is reflected in the
      UI: a leg already covered by a position-wide plan
      (`scopeGuess === "position"`, BUG-0266) shows its price with an Edit
      link into the existing `TpSlEditModal` instead of a second create
      input. A partial leg does not gate this — several partial plans may
      coexist per the API docs, so only the position-wide type is limited.
- [x] Trigger type (`LAST_PRICE`/`MARK_PRICE`) is selectable, defaulting to
      `MARK_PRICE` — the same default `placePositionTpSl`/`placeTpSlOrder`
      and the (now-fixed, BUG-0267) modify flow already use.

## Out of scope

- Trailing stops (no endpoint in the current doc crawl; M3 lists them —
  revisit when the API supports it or emulate client-side under a separate
  item).
- Adding a missing leg to an *existing* position-wide plan without going
  through the single-leg edit modal. `POST /tpsl/position/modify_order`
  (the endpoint that would do this in one call) is not integrated —
  `INTEGRATION_STATUS.md` line 92. The edit-instead-of-create path this item
  ships works today because a leg-level edit through `tpsl/modify_order`
  changes the price and quantity of one leg of that same position-wide row.
- Reconciling this feature's `scopeGuess` inference against a live account.
  Needs credentials and an open position; the risk if it is wrong is
  documented on BUG-0266 (a refused create, or a second plan where the
  trader expected an edit) and is worth a deliberate check before this ships
  to anyone trading with size.

## Resolved

- Default for new TP/SL: position-wide or partial? **Both offered
  side-by-side** rather than picking one — the create modal always shows the
  position-wide section first (matching the exchange UI's own primary flow,
  as the original open question suggested) and the partial section
  collapsed underneath it, opened on demand.

## Links

- [`docs/bitunix-api/INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md)
- [`docs/bitunix-api/06_tp_sl.md`](../../bitunix-api/06_tp_sl.md)
- [`FEAT-0069`](FEAT-0069-bitunix-place-order-completion.md) — atomic TP/SL at
  entry; this item covers the after-entry case
