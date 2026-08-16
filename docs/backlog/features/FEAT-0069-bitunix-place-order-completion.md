---
id: FEAT-0069
title: Send TP/SL, time-in-force and a client order ID with Bitunix order placement
type: feature
status: done
branch: claude/feat-0011-erledigen-k3fht2
priority: P1
milestone: M3
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
estimate: 5
size: L
target_date: 2026-11-27
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

- [~] An order placed with TP and SL set produces the position and its
      protective orders from a single `place_order` request, confirmed via the
      WS order channel. — **payload and simulator done, live WS confirmation
      not verified.** The single request carries both levels end to end
      (schema → route → `placeBitunixOrder`), and paper mode turns them into
      resting plans on the position the entry created, so the atomic form is
      demonstrable offline. Confirming it against the real WS order channel
      needs a funded account and is the one part of this item that cannot be
      settled from a test.
- [x] Every submission carries a unique `clientId`; resubmitting the same
      attempt reuses it, and the WS confirmation is matched to the attempt by
      it. — the id is on the payload and in the FEAT-0015 audit record, which
      is what makes the match possible after a reload.
- [~] `effect` is selectable (GTC default, IOC, FOK, POST_ONLY) for limit
      orders and omitted for market orders. — **the parameter and its
      validation are done**; the selector control belongs to
      [`FEAT-0021`](FEAT-0021-order-types.md), see the scope note below.
- [x] All prices/quantities pass through `decimal.js` formatting; no native
      float serialisation.

## Out of scope

- Trigger/plan orders (endpoint family missing from the doc crawl — see the
  TODO in `INTEGRATION_STATUS.md`).
- Batch orders (`batch_order`).

## Resolved questions

- **`clientId` format: random per attempt vs. derived?** → **Random per
  attempt, reusable on retry.** Neither pure form works. Purely random,
  regenerated on every retry, defeats the point: a retry after an ambiguous
  response is exactly when idempotency matters, and a fresh id there doubles
  the order. Derived from the order's content collides on purpose — two
  deliberate identical entries, which is ordinary when scaling in, would
  produce the same id and the second would be rejected as a duplicate of an
  order the trader meant to place.

  So the unit is the **attempt**, not the content. `newClientOrderId()` mints
  one per submission and `placeOrder` accepts one back, so a retry of that
  attempt reuses it while a genuinely new order gets a new one. Crash-and-
  reload rediscovery comes from the [`FEAT-0015`](FEAT-0015-order-audit-trail.md)
  audit trail, which already persists the id with everything else about the
  attempt — rather than a second persistence mechanism that could disagree
  with it.

## Scope note: the panel controls

The Proposal above says "the trade panel gains TP/SL-at-entry fields and a
time-in-force selector". Those controls are **not** in this item as shipped,
deliberately: [`FEAT-0021`](FEAT-0021-order-types.md) owns the trade panel's
order-entry UI (its own problem statement is that Cachy "offers a narrow way
to place" a calculated position), and building half of that here would have
put two items in the same components.

What shipped instead is the whole execution layer beneath those controls —
`tradeService.placeOrder()` takes every field, gates it, and sends it. When
FEAT-0021 builds the panel, there is nothing left to add on the wire.

## What shipped

- `PlaceOrderSchema` — `effect`, `clientId`, and the four `tp*`/four `sl*`
  fields, with the enums the API documents. The "a LIMIT plan needs its order
  price" rule is validated in `placeBitunixOrder` rather than as a `.refine()`,
  because a refined object is a `ZodEffects` and `z.discriminatedUnion` cannot
  take one.
- `/api/orders` — passes all of them through, and drops `effect` for a market
  order rather than sending a value the exchange ignores.
- `placeBitunixOrder` — runs the attached levels through the same
  `formatApiNum` path as every other price, so a low-priced asset is not
  serialised as `1e-7`.
- `tradeService.placeOrder()` — the first `open` intent in the codebase. This
  is where the FEAT-0011 gate's size recomputation, leverage and margin-mode
  checks and FEAT-0013's limits and kill switch stop being reachable only
  from tests.
- The paper simulator turns entry TP/SL into resting plans with an explicit
  trigger direction — a target and a stop on the same long are both closing
  BUY-side orders, so direction cannot be derived from the side.

## Consequence worth knowing

`placeOrder` **cannot place an entry without a stop**. FEAT-0011 derives the
expected size from the stop distance, so an entry with no stop has no second
derivation to check the quantity against, and the gate refuses it. For an app
whose premise is sizing from a stop that is the right answer, but it is a real
constraint rather than an oversight, and it is asserted by a test.

## Links

- [`docs/bitunix-api/INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md)
- [`docs/bitunix-api/07_trade.md`](../../bitunix-api/07_trade.md)
- [`FEAT-0011`](FEAT-0011-preflight-order-verification.md) — every extension of
  the order payload widens what the M1 gate must recompute
