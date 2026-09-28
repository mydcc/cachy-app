---
id: FEAT-0335
title: Trail a stop behind a position once the exchange endpoint is verified
type: feature
status: in-progress
assignee: opencode
branch: docs/bitget-api-crawl (supersedes feature/feat-0335-bitget-trailing-stop, which is unmerged, still carries the pre-review wording, and whose bitget-api/ copy diverges from develop — so the line references below are develop's)
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
> against the live venue* has not happened, and that half gates the rest. The
> second criterion is gated on its own evidence as well — it was narrowed to
> the percentage, because neither documented path expresses an absolute
> distance. What the documentation established — including which of the two
> trailing shapes is specifiable at all — is in the field-level verification
> below. This item still carries no `estimate` and no `size`: both would be
> invented numbers.

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
- [ ] A trail distance can be set on an open position, in `decimal.js`, as the
      percentage `callbackRatio` documents. **An absolute offset is not
      offered**: `callbackRatio` is a percentage ("Range 1-10"), and the unit
      of the alternative, `rangeRate`, is undocumented — so no documented path
      expresses an absolute distance. This criterion was narrowed by the
      2026-09-28 verification, which is the reason it reads differently than
      when it was written.
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
  Partly answered 2026-09-25 (documentation, no venue account used) — see
  *Verification status* below, superseded in part by *Field-level
  verification*. The answer is one item per exchange if Bitunix ever gets an
  endpoint; until then Bitget-only is the only buildable half.
- **Which side fires, and on which side of the high?** Not documented
  anywhere in `docs/bitget-api/` — see the field-level verification. This has
  to be settled against the live venue before `callbackRatio` is encoded.

## Verification status (2026-09-25) — superseded in part 2026-09-28

Read alongside *Field-level verification* below, which overturns the Bitget
verdict in this section.

- **Bitget: documented from public docs** (documentation is not live
  verification — criterion 1 is still half met). `POST /api/v2/mix/order/place-tpsl-order`
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
- Decision 2026-09-25 (spent 2026-09-28): document only; the item stays blocked
  until Bitunix publishes a placement endpoint **or** a Bitget-only build is
  commissioned. The second condition is now met, so only the Bitunix half
  remains blocked.

## Field-level verification (2026-09-28)

Commissioned and checked against Bitget's public documentation, read from the
Classic v2 mix tree (`bitget.com/docs/catalog/classic-contract-plan/classic-contract-plan`
and the `/api-doc/classic/contract/plan/*` pages) and transcribed in
[`06_tp_sl.md`](../../bitget-api/06_tp_sl.md) and
[`08_error_codes.md`](../../bitget-api/08_error_codes.md). Each claim below
cites the file it comes from, which is why the `rangeRate` finding is reported
as a gap rather than guessed around.

**The reference reached this conclusion first, and this pass does not
corroborate it.** [`06_tp_sl.md`](../../bitget-api/06_tp_sl.md) records
`track_plan` as *Trailing stop order* in its Family A table (`:34`) and the
callback field as `callbackRatio` in its field-name table (`:113`);
[`INTEGRATION_STATUS.md`](../../bitget-api/INTEGRATION_STATUS.md) §3
*Capability parity* records it as ✅ against `trailingStop: false` (`:177`).
This pass reads the same documentation as the same author, so the agreement is
a consistency check and carries no independent evidential weight — it is the
expected outcome by construction, not a confirmation of anything. What the pass
adds is the *field-level* detail the reference does not spell out.

**The path this item named is not the buildable one.** The 2026-09-25 note
recorded `place-tpsl-order` with `planType: moving_plan` and a `rangeRate`
callback range. That request shape exists and is documented — but the trail
distance itself is not. `rangeRate` is documented as *"Callback range. It's
required only in `planType` is `moving_plan`"*
([`06_tp_sl.md`](../../bitget-api/06_tp_sl.md) `:189`) with **no units, no
range and no precision**. That the one field a value is *required* for belongs
to the one plan type we cannot build is the finding: whether it is a percentage
or an absolute amount is not stated anywhere, and the only thing provable is
that a lower bound exists (error `43032`, `rangeRate is smaller than {0}`).
The reference quotes only the first three fields of this endpoint's example
body — and flags that quote as a doc defect in its own right (`:202`) — so
whether the example carries a `rangeRate` value, and whether such a value would
carry a unit, is not established here either way. The
neighbouring half is caught by the same file's group defect list — defect 22
records that the trailing-stop callback field is `callbackRatio` in one family
and `rangeRate` in the other (`06_tp_sl.md:741`). Building against an
unspecified unit would mean writing a field whose unit we do not know into a
signed request that places a protective stop — the unverified-shape failure
the capability model exists to prevent.

**The buildable path is the unified one**: `place-plan-order` with
`planType: track_plan` and `callbackRatio`, documented as *"Required for
trailing stop orders and the rate cannot be greater than 10"*
([`06_tp_sl.md`](../../bitget-api/06_tp_sl.md) `:308`), with the range stated
outright in the pending-orders response: *"Implementation of the callback rate.
(Range 1-10) …"* (`:492`). Market execution only (`orderType` must be `market`,
`price` must be empty), `triggerType` required (`mark_price` or `fill_price`),
`tradeSide` required in hedge mode, `reduceOnly` applicable in one-way mode
only.

**The trail direction is not documented, and this item does not assert it.**
`side` and `tradeSide` are client-supplied, and the one view of a triggered
plan — `plan-sub-order` — omits `side` entirely. Errors `43034`/`43035`
constrain a trigger price against market once and say nothing about a
`track_plan` being reset as the high moves, so they cannot corroborate
"follows the highest price" either. Which side fires, and on which side of
the high, is an open question for implementation to settle against the live
venue.

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
besides. Minimum size and step are not hardcoded in the order path — they come
per symbol from `mix/market/contracts`.

**Not on this path:** `place-tpsl-order` cannot express a trailing take-profit
(there is no `moving_profit_plan`; only `profit_plan`, `loss_plan`,
`moving_plan`, `pos_profit`, `pos_loss`). A trail that also carries a
take-profit is the `track_plan` percentage fields instead, which is the
already-out-of-scope trailing take-profit, not this item.

**Still not verified, and blocking nothing here:** Bitunix placement (unchanged
— no documented route), the numeric cap behind 45091, the trail direction
above, and Bitget's *UTA* account family — a different, non-v2 API under
`/api/v3/*` ([`00_common.md`](../../bitget-api/00_common.md),
[`13_vendor_guidance.md`](../../bitget-api/13_vendor_guidance.md)). The
reference discusses UTA throughout but does not transcribe its endpoints, so no
UTA trailing field names were retrieved. Cachy talks to the Classic v2 family;
UTA is out of scope and should stay explicitly so.

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
