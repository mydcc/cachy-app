---
id: FEAT-0071
title: Replace client-side cancel and close loops with native Bitunix endpoints
type: feature
status: ready
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

- `tradeService` implements `cancel_all_orders` issuing exactly one API request (per symbol filter) and surfaces partial failures from `failureList`.
- `tradeService` implements `close_all_position` and `flash_close_position` natively; flash close targets a `positionId`, proven correct in hedge mode.
- `tradeService` implements `modify_order` mit "Safe Modify" Ansatz: Bevor die Order modifiziert wird, muss Cachy zwingend einen synchronen Call an `get_order_detail` durchführen. Die Modifikation (z.B. TP/SL) wird dann mit der garantierten `qty` und `price` aus der Live-Antwort gemergt und an Bitunix gesendet.
- Ein offenes Limit-Order-Preis/Menge oder TP/SL kann modifiziert werden, ohne die Order-ID zu verlieren.
- Die alten For-Schleifen-Implementierungen werden komplett gelöscht.

## Out of scope

- Batch order placement (`batch_order`) — separate concern.
- UI redesign of the order list; only the actions behind existing controls
  change.

## Open questions

- **GELÖST:** `modify_order` requires `qty` and `price` even when only TP/SL changes.
  **Lösung:** Ansatz 2 (Safe Modify). Die Werte werden durch einen frischen API-Call (`get_order_detail`) unmittelbar vor der Modifikation beschafft, um Race Conditions bei Teil-Fills zu 100% auszuschließen.

## Links

- [`docs/bitunix-api/INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md)
- [`docs/bitunix-api/07_trade.md`](../../bitunix-api/07_trade.md)
