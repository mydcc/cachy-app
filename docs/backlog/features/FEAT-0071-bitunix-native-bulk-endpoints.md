---
id: FEAT-0071
title: Replace client-side cancel and close loops with native Bitunix endpoints
type: feature
status: specced
priority: P2
milestone: M3
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
---

# FEAT-0071 — Replace client-side cancel and close loops with native Bitunix endpoints

## Problem

Four operations that Bitunix offers as single atomic calls are currently
emulated client-side (see
[`INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md) §1):

- "Cancel all" fetches pending orders and cancels them one by one — an order
  filled between fetch and cancel is silently missed, and the loop burns rate
  limit.
- "Close all" fires parallel MARKET reduce-only orders per position instead of
  `close_all_position`.
- "Flash close" is a MARKET reduce-only `place_order` instead of
  `flash_close_position`, which closes exactly the position referenced by
  `positionId` — in hedge mode that distinction prevents closing the wrong
  side.
- An open order's price/quantity can only be changed by cancel + re-place
  (losing queue position) instead of `modify_order`.

## Proposal

Proxy the four native endpoints (`cancel_all_orders`, `close_all_position`,
`flash_close_position`, `modify_order`) and switch
`tradeService.cancelAllOrders`, `closeAllPositions`, `flashClosePosition` and
a new `modifyOrder` to them. Keep the response-handling discipline of the
existing cancel path: per-item `failureList` entries surface as errors, and
the WS channels remain the source of truth for final state.

## Acceptance criteria

- [ ] Cancel-all issues exactly one API request (per symbol filter) and
      surfaces partial failures from `failureList`.
- [ ] Close-all and flash-close use the native endpoints; flash close targets
      a `positionId`, proven correct in hedge mode with a long and short open
      on the same symbol.
- [ ] An open limit order's price/quantity can be modified without losing its
      order ID.
- [ ] The old loop implementations are removed, not left as dead fallbacks.

## Out of scope

- Batch order placement (`batch_order`) — separate concern.
- UI redesign of the order list; only the actions behind existing controls
  change.

## Open questions

- `modify_order` requires `qty` and `price` even when only TP/SL changes —
  confirm against live behaviour before relying on partial modification.

## Links

- [`docs/bitunix-api/INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md)
- [`docs/bitunix-api/07_trade.md`](../../bitunix-api/07_trade.md)
