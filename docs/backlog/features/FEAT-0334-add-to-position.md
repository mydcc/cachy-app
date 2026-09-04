---
id: FEAT-0334
title: Add to an open position and see what it does to the average entry
type: feature
status: done
assignee: claude
shipped: 1.6.0-beta.223
priority: P1
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: [FEAT-0011]
parent: FEAT-0023
estimate: 3
size: M
start_date: 2026-09-02
target_date: 2026-12-14
---

# FEAT-0334 — Add to an open position and see what it does to the average entry

## Problem

Cachy can open a position and close part of it
([`FEAT-0256`](FEAT-0256-partial-close-position.md)), but it cannot increase
one. Scaling into a position — the other half of how a trader actually manages
size — means leaving the app.

Worse than the missing button is the missing number. Adding moves the average
entry, and the average entry is what every stop distance and every risk figure
in the calculator is measured from. A trader adding at the exchange has to work
out where their entry lands before deciding whether the add is survivable, and
Cachy is the tool that exists to do exactly that arithmetic.

## Proposal

An add control in the position panel: a quantity input, a preview of what the
resulting position looks like, and an order that goes out through the normal
path.

- **Reuse the quantity-input shape [`FEAT-0256`](FEAT-0256-partial-close-position.md)
  established** — slider with percentage marks plus a linked absolute field,
  one committed quantity as the single source of truth, rounded to the
  instrument's step size on commit. A second implementation of the same input
  is how the two drift apart.
- **Preview the resulting size and average entry** before the order is sent:
  `(oldAvg × oldQty + limitOrMarkPrice × addQty) / (oldQty + addQty)`, in
  `decimal.js` throughout. Native `number` here is a wrong entry price, which
  is a wrong stop distance, which is money.
- **The preview is a preview, never a stored truth.** Once the venue reports
  the position back, its average entry wins. Cachy must not persist its own
  computed figure and must not keep showing it after a fill — a locally
  computed average that quietly disagrees with the exchange is worse than no
  preview at all, because it is believed.
- **An add is an opening order, not a reduce.** It goes out as `place-order`,
  passes the full [`FEAT-0011`](FEAT-0011-preflight-order-verification.md) gate
  — margin, size, price, account — and inherits `place-order`'s confirmation
  from [`FEAT-0024`](FEAT-0024-confirmation-policy.md)'s catalogue. No new
  catalogue key: `ConfirmableAction` in
  [`confirmationPolicy.ts`](../../../src/lib/confirmationPolicy.ts) already
  covers it, and adding a key for something the gate already enforces
  structurally would weaken it, not strengthen it.

### Why there is no matching "reduce" item

[`FEAT-0023`](FEAT-0023-position-management.md) listed the control as "add to /
reduce, average entry recomputed" and asked whether the two belong together.
They do not, and the reason is arithmetic rather than taste: **a reduce does
not move the average entry.** Closing part of a position realises PnL and
leaves the remainder's entry price exactly where it was. The recomputation the
epic named as the shared work is add-only work, and the reduce itself already
shipped as [`FEAT-0256`](FEAT-0256-partial-close-position.md).

## Acceptance criteria

- [ ] An open position can be increased from the position panel, by percentage
      or absolute size
- [ ] The quantity is rounded to the instrument's step size before it reaches
      the service, so the gate and the venue agree it is fillable
- [ ] The resulting size and average entry are previewed before sending, in
      `decimal.js`, with a test covering long and short
- [ ] The previewed average is replaced by the venue's reported figure once the
      position update arrives, and is never persisted
- [ ] The order passes the FEAT-0011 gate on the opening path, with a test that
      an add exceeding available margin is refused
- [ ] The action inherits the `place-order` confirmation rather than defining a
      new one
- [ ] The control is absent where the exchange cannot support it, per
      [`FEAT-0017`](FEAT-0017-exchange-capability-model.md)
- [ ] German and English strings

## Out of scope

- **Reducing a position** — [`FEAT-0256`](FEAT-0256-partial-close-position.md).
- **Averaging down as a strategy.** This is an input, not advice; Cachy shows
  the number and does not suggest the trade.
- **Recomputing stops or take-profits to follow the new entry.** Whether an
  existing TP/SL should move when the entry does is a separate decision with
  its own risk, and it belongs to whoever specs it.

## Open questions

- ~~**Does the preview show a new liquidation price as well?**~~ **Decided: no.**
  The item set the bar — only if the risk engine already exposes an estimate
  that matches what the venue will report — and neither estimate clears it.
  `calculateBaseMetrics` in [`core.ts`](../../../src/lib/calculators/core.ts)
  uses `entry × (1 ∓ 1/leverage ± mmr)`, an isolated-margin, single-position
  approximation blind to wallet balance, cross margin and other positions.
  `projectLiquidation` in
  [`liquidation.ts`](../../../src/lib/calculators/liquidation.ts) is better
  calibrated — it back-solves the MMR out of the venue's own
  entry/liquidation/leverage triple — but it projects across a *leverage*
  change at fixed size, while an add moves entry, size and maintenance-margin
  tier at once. It would be right for small isolated adds and wrong for the
  large ones where the number decides the trade, which is the "close but
  wrong" hazard the item names. The rationale is recorded in
  [`addToPosition.ts`](../../../src/lib/calculators/addToPosition.ts)'s module
  note so it is not re-litigated at the next preview.

  Reopening it needs the venue's maintenance-margin tier table, not a better
  formula.

## Implementation notes

- **The add does not travel as `kind: "open"`.** The FEAT-0011 gate re-derives
  an open's quantity from `accountSize × risk% / stopDistance` and refuses a
  payload that disagrees. An add carries no new stop, so satisfying that
  formula would have meant inventing the inputs that reproduce the wanted
  quantity — the gate would then verify a fiction, which is the failure it
  exists to prevent. It travels as a new `kind: "add"` instead, verified the
  way a reduce is (against the quantity the panel displayed) plus a margin
  check that a reduce has no need of. See `OrderIntentKind` in
  [`orderGate.ts`](../../../src/services/orderGate.ts).
- **`increasesExposure` had to learn about it.** An add that the kill switch
  let through would be a kill switch in name only
  ([`rmsService.ts`](../../../src/services/rmsService.ts)). The day's-loss limit
  applies too; the size-based limits do not, because they measure a stop
  distance an add does not carry.
- **The dialog is market-only.** A limit add rests unfilled while the position
  and its average entry move underneath it, which makes the preview a claim
  about a state that may never arrive. The order panel already places limit
  orders.

## Links

- [`FEAT-0023`](FEAT-0023-position-management.md) — the epic this belongs to
- [`FEAT-0256`](FEAT-0256-partial-close-position.md) — the quantity input to reuse
- [`FEAT-0011`](FEAT-0011-preflight-order-verification.md) — the gate every action passes
- [`FEAT-0024`](FEAT-0024-confirmation-policy.md) — `place-order` confirmation
- `src/lib/confirmationPolicy.ts` — `ConfirmableAction`
- `src/services/tradeService.ts` — order placement
