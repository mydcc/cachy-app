---
id: BUG-0506
title: The gate's size tolerance is symmetric while the rounding it exists to absorb is one-directional, so an order up to a full step oversized passes
type: bug
status: done
branch: fix/gate-kern-paket-c
priority: P2
milestone: none
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
assignee: opencode
---

# BUG-0506 — The size window accepts an oversize no producer can generate

## Symptom

The gate re-derives the position size from account size, risk and stop distance
and refuses a payload that differs by more than a tolerance. The tolerance
exists to absorb the step-size rounding the venue forces.

That rounding only ever makes a size *smaller*. The tolerance is applied in
both directions, so the window also accepts sizes above the intended one — up
to a full step size above it.

On an instrument whose step is coarse relative to the position, that is a large
number. A trader whose configured risk produces 2.4 contracts on an instrument
with a step of 1 has orders of up to 3.4 contracts accepted: 42 % more risk than
they set, passed by the check whose entire job is to hold the size to the risk
they set.

## Evidence

**Derived, from reading the code.** The producer rounds in one direction; the
check accepts both.

**The producer only ever rounds down.** `calculateBaseMetrics` returns the raw
quotient — `src/lib/calculators/core.ts:138`:

```typescript
const riskAmount = values.accountSize.times(values.riskPercentage.div(100));
const riskPerUnit = values.entryPrice.minus(values.stopLossPrice).abs();
if (riskPerUnit.isZero()) return null;

const positionSize = riskAmount.div(riskPerUnit);
```

Fees never enter it — `deriveMoneyMetrics` applies them to `requiredMargin` and
`netLoss`, not to the size. `calculatorService.performCalculation` then rounds
that number to the instrument's precision with `Decimal.ROUND_DOWN`
(`src/services/calculatorService.ts:276`), which is the conservative direction
and correct.

So every quantity the calculator can produce lies in `(expected − step, expected]`.

**The gate re-derives exactly the same number.** `src/services/orderGate.ts:1032`:

```typescript
const expected = accountSize.times(riskPercentage.div(100)).div(riskPerUnit);
const tolerance = this.sizeTolerance(expected, displayed.stepSize);

if (payloadQty.minus(expected).abs().gt(tolerance)) {
```

`.abs()` makes the window symmetric: `[expected − tolerance, expected + tolerance]`.

**The tolerance is a whole step.** `src/services/orderGate.ts:1178`:

```typescript
private sizeTolerance(expected: Decimal, stepSize?: Decimal): Decimal {
    const relative = expected.abs().times(SIZE_TOLERANCE_RELATIVE);
    if (stepSize === undefined || !stepSize.isFinite() || stepSize.lte(0)) {
        return relative;
    }
    return Decimal.max(stepSize, relative);
}
```

with `SIZE_TOLERANCE_RELATIVE = 0.001` (`:447`).

Putting the three together: the accepted window's lower half,
`[expected − step, expected]`, is exactly the set of legitimate roundings. Its
upper half, `(expected, expected + step]`, contains **no value the producer can
generate** — every point in it is an oversize, and every point in it passes.

The overshoot is bounded by `max(step, 0.1 % of expected)`, so it is immaterial
on a fine-step instrument and proportionally largest on a coarse-step one with a
small position — a beginner's position size on a contract-denominated
instrument.

**The doc comment describes the opposite of the code.** `orderGate.ts:1176`
reads "one step … with a 0.1 % relative floor for instruments whose step is
coarser than the position itself". `Decimal.max` makes the relative value the
floor when the step is *finer* than 0.1 % of the position, not coarser. The
sentence is how the next reader gets the direction wrong.

## Cause

The tolerance was derived from the right observation — an exact match would
refuse valid orders, because the venue's step forces rounding — and then
expressed with `.abs()`, which is the reflex for "within tolerance" and throws
away the one fact that makes the tolerance safe: rounding has a direction.

A symmetric window around a one-sided perturbation is always twice as wide as it
needs to be, and the half it adds is the unsafe half.

## Fix

Make the window one-sided, in the direction the rounding actually goes.

1. **Accept `expected − tolerance ≤ qty ≤ expected`**, replacing the symmetric
   `.abs()` comparison.
2. **Keep a small upward allowance for representation only** — a step-rounded
   quotient can land a few ulps above `expected` through decimal arithmetic. The
   relative floor (0.1 %) is the natural size for that, and is already computed.
   The upward allowance must not scale with the step.
3. **Fix the doc comment** so it says which side the floor applies to.
4. **Cover the asymmetry with tests**: a payload one step below `expected`
   passes; a payload one step above it is refused; both on an instrument whose
   step is a large fraction of the position, which is where the difference is
   visible.

This changes only which inputs are allowed to declare a size correct. It
tightens nothing the calculator can legitimately produce, so no valid order
becomes refusable — that is the property the tests must pin down.

Nothing in the current code produces an oversized payload, so this is a hole in
a cross-check rather than a live miscalculation. That is also the whole point of
the cross-check: it is the only thing standing between a defect elsewhere and
the trader's configured risk, and `checkMargin` and `checkVolumeLimits` bound
margin and venue limits, never risk.

## Acceptance criteria

- [ ] A payload one step *above* the derived size is refused
- [ ] The test fails without the fix
- [ ] A payload one step *below* the derived size is still approved
- [ ] The upward allowance does not scale with `stepSize`
- [ ] The existing size cases in `orderGate.test.ts` still pass unchanged
- [ ] `sizeTolerance`'s comment states which side the relative floor applies to

## Links

- BUG-0505 — the other half of `checkSize`: the branch that cannot run at all
- BUG-0501 — an absent input degrading a size guard to no guard
- FEAT-0011 — the gate scope this check belongs to
