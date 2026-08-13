---
id: FEAT-0069
title: Send TP/SL, time-in-force and a client order ID with Bitunix order placement
type: feature
status: specced
priority: P1
milestone: M3
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
estimate: 5
size: L
target_date: 2026-09-03
---

# FEAT-0069 — Send TP/SL, time-in-force and a client order ID with Bitunix order placement

## Problem

Cachy's `place_order` call sends only a subset of what the endpoint accepts
(see [`07_trade.md`](../../bitunix-api/07_trade.md) and
[`INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md) §1). Three
omissions hurt:

- **No `tpPrice`/`slPrice`:** TP/SL cannot be attached atomically at entry.
  The position exists unprotected until a separate TP/SL call succeeds — and
  today that separate call does not even exist
  ([`FEAT-0070`](FEAT-0070-bitunix-tpsl-placement.md)).
- **No `clientId`:** a network retry after an ambiguous response can double an
  order; without a client order ID there is no idempotent way to resubmit or
  to correlate the WS confirmation with the attempt.
- **No `effect`:** the panel cannot offer IOC/FOK/POST_ONLY; everything is
  implicitly GTC.

## Proposal

Extend `PlaceOrderSchema`, the `/api/orders` proxy (`type: "place-order"`) and
`placeBitunixOrder` to pass `tpPrice`/`tpStopType`/`tpOrderType`/`tpOrderPrice`,
the `sl*` counterparts, `effect`, and a Cachy-generated `clientId` per attempt.
The trade panel gains TP/SL-at-entry fields (values it already computes for the
position-size calculation) and a time-in-force selector. The order audit trail
([`FEAT-0015`](FEAT-0015-order-audit-trail.md)) records the `clientId`.

## Acceptance criteria

- [ ] An order placed with TP and SL set produces the position and its
      protective orders from a single `place_order` request, confirmed via the
      WS order channel.
- [ ] Every submission carries a unique `clientId`; resubmitting the same
      attempt reuses it, and the WS confirmation is matched to the attempt by
      it.
- [ ] `effect` is selectable (GTC default, IOC, FOK, POST_ONLY) for limit
      orders and omitted for market orders.
- [ ] All prices/quantities pass through `decimal.js` formatting; no native
      float serialisation.

## Out of scope

- Trigger/plan orders (endpoint family missing from the doc crawl — see the
  TODO in `INTEGRATION_STATUS.md`).
- Batch orders (`batch_order`).

## Open questions

- `clientId` format: random per attempt vs. derived (deterministic) so a
  crash-and-reload can rediscover an in-flight attempt.

## Links

- [`docs/bitunix-api/INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md)
- [`docs/bitunix-api/07_trade.md`](../../bitunix-api/07_trade.md)
- [`FEAT-0011`](FEAT-0011-preflight-order-verification.md) — every extension of
  the order payload widens what the M1 gate must recompute
