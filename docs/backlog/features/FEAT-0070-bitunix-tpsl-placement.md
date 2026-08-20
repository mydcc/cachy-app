---
id: FEAT-0070
title: Place new TP/SL orders on existing Bitunix positions
type: feature
status: specced
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

- [ ] A position without TP/SL can be given a position-wide TP, SL or both
      from the positions UI; the new order appears in the pending TP/SL list.
- [ ] A partial TP/SL with explicit quantity can be created; quantities are
      validated against the position size.
- [ ] The API constraint "one position-TP/SL per position" is reflected in the
      UI (offer edit instead of a second create).
- [ ] Trigger type (`LAST_PRICE`/`MARK_PRICE`) is selectable and defaults
      consistently with the existing modify flow.

## Out of scope

- Trailing stops (no endpoint in the current doc crawl; M3 lists them —
  revisit when the API supports it or emulate client-side under a separate
  item).

## Open questions

- Default for new TP/SL: position-wide or partial? Position-wide matches the
  exchange UI's primary flow.

## Links

- [`docs/bitunix-api/INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md)
- [`docs/bitunix-api/06_tp_sl.md`](../../bitunix-api/06_tp_sl.md)
- [`FEAT-0069`](FEAT-0069-bitunix-place-order-completion.md) — atomic TP/SL at
  entry; this item covers the after-entry case
