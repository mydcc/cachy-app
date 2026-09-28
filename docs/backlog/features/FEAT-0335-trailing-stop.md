---
id: FEAT-0335
title: Trail a stop behind a position once the exchange endpoint is verified
type: feature
status: in-progress
assignee: opencode
branch: feature/feat-0335-bitget-trailing-stop
priority: P2
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: [FEAT-0017]
parent: FEAT-0023
---

# FEAT-0335 — Trail a stop behind a position once the exchange endpoint is verified

> **Bitunix: blocked, and not by a decision.** There is no verified Bitunix
> trailing-stop endpoint in the current API doc crawl — see
> [`INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md) §Trade and
> [`FEAT-0070`](FEAT-0070-bitunix-tpsl-placement.md)'s own Out of scope. That
> half stays blocked, and stays its own item if Bitunix ever ships the route.
>
> **Bitget: commissioned, documented, not yet built.** The Bitget-only half was
> commissioned 2026-09-28. The reference is
> [`docs/bitget-api/`](../../bitget-api/README.md), and its first acceptance
> criterion is still **half met**: the endpoint is documented, but *verified
> against the live venue* has not happened, and that half gates the rest. What
> the documentation established — including which of the two trailing shapes is
> specifiable at all — is in the field-level verification below. This item
> still carries no `estimate` and no `size`: both would be invented numbers.

## Problem

A stop that does not follow a winning position either gets left behind, giving
back the move, or gets dragged by hand, which means watching the chart — the
thing Cachy exists to stop a trader having to do. Every venue Cachy talks to
offers some form of trailing stop; Cachy offers none.

## Proposal

A trailing stop on an open position: a trail distance, expressed as a
percentage or an absolute offset, that moves the stop in the position's
favour and never against it.

The shape of the feature is not the hard part. The hard part is that a trailing
stop is a **standing instruction held by someone**, and who holds it changes
everything:

- **Exchange-side** — the venue owns the trail. It keeps working when Cachy is
  closed, which is the only version worth shipping for a stop. It requires the
  endpoint that does not yet exist.
- **Client-side** — Cachy watches the price and moves the stop itself. It stops
  working the moment the tab closes, the laptop sleeps or the WebSocket drops,
  and a stop that silently stops trailing is worse than no trailing stop,
  because the trader believes it is there.

**This item is the exchange-side version.** A client-side emulation is not a
fallback for it and must not be introduced as one; if it is ever wanted, it is
a different item with its own honest name and its own warning copy.

## Acceptance criteria

- [ ] A trailing-stop endpoint is documented in the API crawl and verified
      against the live venue, per exchange — this criterion gates every one
      below it
- [ ] A trail distance can be set on an open position, as a percentage or an
      absolute offset, in `decimal.js`
- [ ] The instruction is placed at the exchange and survives Cachy being closed
- [ ] The trail moves only in the position's favour, with a test
- [ ] The action passes the [`FEAT-0011`](FEAT-0011-preflight-order-verification.md)
      gate like every other order
- [ ] The control is **absent**, not disabled-with-an-error, on any exchange
      whose capability model does not report support, per
      [`FEAT-0017`](FEAT-0017-exchange-capability-model.md)
- [ ] German and English strings

## Out of scope

- **Client-side trailing.** See above — it is a different item, not this one
  degraded.
- **Trailing take-profit.** Same endpoint question, different instruction;
  split it out once the API is known rather than assuming they arrive together.

## Open questions

- **Which venues actually support it, and with which parameter shape?**
  Partly answered 2026-09-25 (web verification, no venue account used) —
  see Verification status below. The answer is one item per exchange if
  Bitunix ever gets an endpoint; until then Bitget-only is the only
  buildable half.

## Verification status (2026-09-25)

- **Bitget: verified from public docs.** `POST /api/v2/mix/order/place-tpsl-order`
  with `planType: moving_plan` (trailing stop, `rangeRate` callback range,
  market execution, `size` required) and `POST /api/v2/mix/order/place-plan-order`
  with `track_plan`, plus `orders-plan-pending` / `orders-plan-history`
  (`track_plan`) and `modify-tpsl-order` coverage. Exchange-held, as required.
- **Bitunix: not verifiable.** Public docs list only LIMIT/MARKET order types
  with no trail parameters; no plan-order placement pages exist (guessed doc
  URL 404s; sidebar has no plan section). Trailing exists in App/Web UI and
  venue responses carry order type `5` (`TRAILING_STOP_MARKET`, already mapped
  in `OpenOrdersList`/`OrderDetailsTooltip`/`OrderHistoryList`), but no
  placement route is documented. The `/api/v1/futures/plan/` family is real
  (`get_history_plan_orders` is used by the journal sync) yet place/cancel/
  pending remain uncrawled — see the TODO in `INTEGRATION_STATUS.md`.
- Decision 2026-09-25: document only; the item stays blocked until Bitunix
  publishes a placement endpoint or a Bitget-only build is commissioned.

## Field-level verification (2026-09-28)

Commissioned and verified against Bitget's public documentation, read from the
Classic v2 mix tree (`bitget.com/docs/catalog/classic-contract-plan/classic-contract-plan`
and the `/api-doc/classic/contract/plan/*` pages). Every field below is quoted
from those tables; nothing here is reconstructed from memory, which is why the
`rangeRate` finding below is reported as a gap rather than guessed around.

**This is a second, independent pass, and it agrees with the reference.**
[`06_tp_sl.md`](../../bitget-api/06_tp_sl.md) already reaches the same
conclusion — its capability table records `planType: track_plan` +
`callbackRatio` as the trailing-stop shape, and
[`INTEGRATION_STATUS.md`](../../bitget-api/INTEGRATION_STATUS.md) §Trailing
stop records it as ✅ documented against `trailingStop: false`. Two passes over
the same documentation landing on the same answer is worth more than either
alone, and it means the finding below is not one researcher's reading. What
this pass adds is the *field-level* detail the reference does not spell out.

**The path this item named is not the buildable one.** The 2026-09-25 note
recorded `place-tpsl-order` with `planType: moving_plan` and a `rangeRate`
callback range. That request shape exists and is documented — but the trail
distance itself is not. `rangeRate` is documented as *"Callback range. It's
required only in `planType` is `moving_plan`"*
([`06_tp_sl.md`](../../bitget-api/06_tp_sl.md) §place-tpsl-order) with **no
units, no range, no precision and no worked example carrying a value**. That
the one field a value is *required* for belongs to the one plan type we cannot
build is the finding: whether it is a percentage or an absolute amount is not
stated anywhere, and the only thing provable is that a lower bound exists
(error `43032`, `rangeRate is smaller than {0}`). The reference's own defect
list reaches the neighbouring half of this — defect 22 records that the
trailing-stop callback field is `callbackRatio` in one family and `rangeRate`
in the other. Building against an unspecified unit would mean writing a field
whose unit we do not know into a signed request that places a protective stop —
the unverified-shape failure the capability model exists to prevent.

**The buildable path is the newer unified one**: `place-plan-order` with
`planType: track_plan` and `callbackRatio`, documented as *"Required for
trailing stop orders and the rate cannot be greater than 10"*, with the
pending-orders response stating the range outright: *"Callback rate.
(Range 1-10)"*. Market execution only (`orderType` must be `market`, `price`
must be empty), `triggerType` required (`mark_price` or `fill_price`),
`tradeSide` required in hedge mode, `reduceOnly` applicable in one-way mode
only. Long positions trail upward — the stop follows the highest price and
fires a sell — confirmed from Bitget's own support articles rather than
inferred, and consistent with the arming-price errors 43034/43035.

**The `rangeRate` path is not rejected as wrong, only as unspecified.** If
Bitget ever documents its units, the older shape becomes viable; until then
`track_plan` is the one that can be implemented and honestly cited.

Two further constraints, both from
[`08_error_codes.md`](../../bitget-api/08_error_codes.md): a 300 ms limit on
modify (`43036`), whose scope the message does not state — per order, per
symbol or per account is not derivable from it — and a cap on tracking orders
(`45091`) whose value is unpublished and whose scope is equally unstated.
Neither is load-bearing: the app can react to both codes rather than
pre-emptively encode a rule it cannot cite, and that is the cheaper design
besides. Minimum size and step are not hardcoded anywhere in Cachy — they come
per symbol from `mix/market/contracts`.

**Not on this path:** `place-tpsl-order` cannot express a trailing take-profit
(there is no `moving_profit_plan`; only `profit_plan`, `loss_plan`,
`moving_plan`, `pos_profit`, `pos_loss`). A trail that also carries a
take-profit is the `track_plan` percentage fields instead, which is the
already-out-of-scope trailing take-profit, not this item.

**Still not verified, and blocking nothing here:** Bitunix placement (unchanged
— no documented route), the numeric cap behind 45091, and Bitget's *UTA*
account family, which is a different non-v2 API (`/api/v3/trade/place-strategy-order`
with `type: trailing_stop`) and whose trailing field names this verification
did not retrieve. Cachy talks to the Classic v2 family; UTA is out of scope and
should stay explicitly so.

## Links

- [`06_tp_sl.md`](../../bitget-api/06_tp_sl.md) — the plan-order family this
  verification reads, and the source a future `trailingStop: true` line cites
- [`08_error_codes.md`](../../bitget-api/08_error_codes.md) — where `43032`,
  `43034`, `43035`, `43036` and `45091` are transcribed
- [`FEAT-0023`](FEAT-0023-position-management.md) — the epic this belongs to
- [`INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md) — §Trade, where the endpoint is not
- [`FEAT-0070`](FEAT-0070-bitunix-tpsl-placement.md) — TP/SL placement, excludes trailing
- [`FEAT-0017`](FEAT-0017-exchange-capability-model.md) — capability model
- [`FEAT-0011`](FEAT-0011-preflight-order-verification.md) — the gate every action passes
