---
id: FEAT-0256
title: Close part of a position without closing all of it
type: feature
status: in-progress
branch: feat/feat-0256-partial-close
priority: P1
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: [FEAT-0254]
estimate: 3
size: M
start_date: 2026-08-23
target_date: 2026-09-20
---

# FEAT-0256 — Close part of a position without closing all of it

## Problem

Cachy can close a position, and that is all it can do to one. The close button
in [`PositionsList.svelte`](../../../src/components/shared/PositionsList.svelte)
sends the full size every time — `handleClosePosition` passes `pos.amount`
straight through — so taking half off the table means leaving Cachy and doing
it at the exchange, which is the manual step this app exists to remove.

The service layer is already further along than the UI. `closePosition` takes
an optional `amount` ([`tradeService.ts:910`](../../../src/services/tradeService.ts))
and has since it was written; nothing has ever passed a partial one. So this
is a missing input, not a missing capability.

Scaling out is not a rare action. It is how a trader realises part of a target
while leaving the rest to run, and it is the normal response to a position that
has moved far enough to be worth de-risking but not far enough to abandon.

## Proposal

A quantity input on the close action, defaulting to the full position, with the
percentage presets a trader actually reaches for.

- **Reuse [`RangeSlider`](../../../src/components/shared/RangeSlider.svelte)** from
  [`FEAT-0254`](FEAT-0254-tpsl-input-range-slider-ux.md), marked at
  0/25/50/75/100 %. This is the reuse that item was built for — the primitive
  already emits `Decimal` and snaps to marks, so nothing here needs a second
  slider implementation.
- **`PartialCloseInput.svelte`** — the slider plus a linked absolute-quantity
  field, both derived from one committed quantity, the same single-source-of-
  truth shape `TpSlPriceInput` uses. Shows the resulting remaining size and the
  realised PnL the close would book at the current mark.
- **Round to the instrument's step size on commit**, not on display, so the
  quantity that reaches `closePosition` is one the exchange can fill.
- **Teach the gate the step size on the reduce path.** `closePosition` builds
  its `displayed` block without one ([`tradeService.ts:955`](../../../src/services/tradeService.ts)),
  and `checkSize`'s reduce branch ([`orderGate.ts:565`](../../../src/services/orderGate.ts))
  checks only *> 0*, *≤ position* and full-close equality. A partial close with
  an unfillable quantity passes the gate today and is refused by the venue.

### Why the step check must exempt a full close

A step-size rule that applies to every reduce would lock a trader out of their
own position. After a partial liquidation, or on an instrument whose step
changed, the exchange can hold a size that is not a whole multiple of the
current step — and the only way out of that position is an order for exactly
that size. The rule therefore applies to partial closes only; a full close is
by definition the size the venue itself reports, and is checked against the
position amount rather than against the step.

## Acceptance criteria

- [ ] The close action offers a quantity between one step and the full position,
      defaulting to full, with 0/25/50/75/100 % presets.
- [ ] Slider and absolute-quantity field stay in sync in both directions; the
      quantity displayed is the quantity submitted.
- [ ] Every emitted quantity is a `Decimal` rounded to the instrument's step
      size, and never exceeds the position size read back fresh.
- [ ] Selecting 100 % submits a full close — the exact position amount, not a
      rounded approximation of it.
- [ ] `closePosition` passes `stepSize` in its `displayed` block; the gate
      refuses a *partial* reduce whose quantity is not a whole multiple of it,
      and does not apply that rule to a full close.
- [ ] The remaining size and the PnL the close would realise are shown before
      commit, computed with `Decimal`.
- [ ] Unit tests cover step rounding, the full-close exemption, the position
      ceiling, and the 100 % path.
- [ ] A component test confirms the displayed quantity is the submitted one.
- [ ] German and English strings for every new label.
- [ ] `npm run check` passes; all styling via CSS variables.

## Out of scope

- **Flash close.** `flashClosePosition` exists in the service
  ([`tradeService.ts:503`](../../../src/services/tradeService.ts)) and is wired to
  nothing; connecting it is worth doing but belongs with the confirmation
  policy in [`FEAT-0024`](FEAT-0024-confirmation-policy.md), not here. Building
  a bespoke confirmation for one button now means building it twice.
- **Adding to a position / recomputing the average entry.** The other half of
  [`FEAT-0023`](FEAT-0023-position-management.md); a different direction, a
  different calculation, and no shared input with this one.
- **Trailing stops.** No verified Bitunix endpoint exists — see
  [`FEAT-0070`](FEAT-0070-bitunix-tpsl-placement.md) and
  [`INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md) §Trade.
- **Capability gating of the control.** Whether a venue supports partial reduce
  at all is [`FEAT-0017`](FEAT-0017-exchange-capability-model.md)'s model to
  answer. Until it lands, the control is offered wherever `closePosition` is.
- **A general step-size rule for the open path.** The open branch uses
  `stepSize` as a sizing tolerance, deliberately. Changing that is a separate
  argument about a working mechanism.

## Open questions

- **Does the percentage act on the original size or the remaining size?** After
  closing 50 % once, does a second 50 % close a quarter of the original or half
  of what is left? Half of the remainder is what exchanges do and what the
  slider naturally expresses, since it is bound to the live position — noting it
  so the decision is deliberate rather than incidental.

## Links

- [`FEAT-0254`](FEAT-0254-tpsl-input-range-slider-ux.md) — the `RangeSlider` this reuses
- [`FEAT-0023`](FEAT-0023-position-management.md) — the epic this was split out of
- [`FEAT-0011`](FEAT-0011-preflight-order-verification.md) — the gate this extends
- [`FEAT-0024`](FEAT-0024-confirmation-policy.md) — where flash close belongs
- [`ADR-0010`](../../adr/0010-estimates-inform-but-never-determine-what-is-sent.md) — displayed-vs-sent discipline
- `src/services/tradeService.ts` — `closePosition`, `flashClosePosition`
- `src/services/orderGate.ts` — `checkSize` reduce branch
- `src/components/shared/PositionsList.svelte`, `PositionsSidebar.svelte` — mount points
