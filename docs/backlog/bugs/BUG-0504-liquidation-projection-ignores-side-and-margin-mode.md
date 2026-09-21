---
id: BUG-0504
title: The liquidation projection guesses the position side and assumes isolated margin, so it shows a confident wrong number for cross-margin positions
type: bug
status: done
assignee: opencode
branch: fix-pkg-e-0504-0512
priority: P1
milestone: none
editions: [community, pro, private]
area: calculation
data_class: none
adr: none
depends_on: []
---

# BUG-0504 — The leverage change shows a liquidation price derived from the wrong model

## Symptom

A trader changes the leverage on an open position. Cachy shows where the
liquidation price will move to, and whether the new level is tighter than the
current one.

For a cross-margin position that number is derived from a formula that does not
describe cross margin. It is presented with the same confidence as the isolated
case — a concrete price and a tighter/looser verdict — with nothing marking it
as an approximation or as inapplicable.

The trader is choosing leverage on a live position using this figure. It is the
one number that answers "how much room do I have left", and on cross margin it
is not the venue's answer.

## Evidence

**Derived, from reading the code.** The function takes four numbers and needs
six facts.

`src/lib/calculators/liquidation.ts:20`:

```typescript
export function projectLiquidation(
  entry: Decimal,
  liquidation: Decimal,
  currentLeverage: Decimal,
  newLeverage: Decimal,
): { from: Decimal; to: Decimal; tighter: boolean } | null {
```

Both production call sites pass exactly those four, from a position object that
carries more — `src/components/inputs/ExchangeAccountControls.svelte:489`:

```typescript
? projectLiquidation(openPosition.entryPrice, openPosition.liquidationPrice, openPosition.leverage, desired)
```

and `src/components/shared/LeverageModal.svelte:136`:

```typescript
return projectLiquidation(p.entryPrice, p.liquidationPrice, p.leverage, next);
```

**The side is guessed rather than read.** `liquidation.ts:42`:

```typescript
const isLong = liquidation.lt(entry);
```

`side` is on the position at both call sites and is not passed. The inference is
usually right — a long does liquidate below entry — but it is a re-derivation of
a known fact, and it has a boundary: when `liquidation` equals `entry` the
comparison is false and a long is processed as a short, taking the opposite
branch of both the MMR solve and the projection.

**The margin model is assumed, never checked.** The algebra is the isolated
formula, solved for the maintenance margin rate and re-applied:

```typescript
const mmr = isLong
  ? ratio.minus(1).plus(invOld)
  : new Decimal(1).plus(invOld).minus(ratio);

const projected = isLong
  ? entry.times(new Decimal(1).minus(invNew).plus(mmr))
  : entry.times(new Decimal(1).plus(invNew).minus(mmr));
```

That is internally consistent — for a long, `liq = entry × (1 − 1/L + mmr)`
inverts to exactly the `mmr` above, and calibrating the rate from the venue's
own triple is a sound way to absorb the venue's tier and fee conventions. It is
sound *for isolated margin*, where liquidation is a function of this position's
leverage and nothing else.

Under cross margin, liquidation is a function of total account equity: every
other position's unrealized PnL and the free balance move it. Changing one
position's leverage does not move its liquidation price along this curve, so
the projected price is not an imprecise version of the venue's answer — it
answers a different question. `marginMode` is available on the position and is
never consulted, here or at either call site.

**`tighter` inherits the error.** `liquidation.ts:60`:

```typescript
const tighter = projected.minus(entry).abs().lt(liquidation.minus(entry).abs());
```

The verdict shown to the trader is computed from `projected`, so a wrong
projection yields a wrong safety verdict — including the case where it reports
more room than the trader will actually have.

**The guards are real but orthogonal.** Non-finite, zero and negative inputs all
return `null`, and the `try/catch` returns `null`. None of them can detect the
model mismatch, because a cross-margin position's inputs are all perfectly
valid numbers.

`src/lib/calculators/liquidation.test.ts` covers six happy paths and four
null-guard cases. There is no test for cross margin, and none for
`liquidation === entry`.

## Cause

The function was written against the isolated-margin case and its restriction
was never expressed anywhere a caller could see it — not in the signature, not
in a type, not in a guard. An assumption that only exists in the author's head
is not a precondition; it is a latent defect waiting for the first caller with
different data.

The side inference is the same shape in miniature: a fact the caller already
holds, reconstructed from geometry because the parameter list did not ask for
it.

## Fix

Make the two missing facts parameters, and refuse rather than guess.

1. **Take `side` from the position.** Both call sites already have it. This
   removes the `liquidation === entry` boundary and the whole class of
   geometry-inference errors.
2. **Take `marginMode` and act on it.** For `isolated`, keep today's formula
   unchanged — it is correct there. For `cross`, do not return a projected
   price from this formula.
3. **Say so in the UI rather than showing nothing.** A cross-margin position
   should get an explicit "liquidation depends on account equity, not on this
   position's leverage alone" note in place of the number. Returning `null` and
   silently hiding the row would leave the trader without the reason, which is
   the information that actually matters for the decision.
4. **Suppress `tighter` wherever the projection is suppressed.** The safety
   verdict must not outlive the number it is derived from.
5. **Cover the boundary and the model.** Add tests for `liquidation === entry`,
   for a short whose side is passed explicitly, and for a cross-margin position
   asserting no projected price is produced.

A genuine cross-margin projection would need account equity, every other
position's unrealized PnL and the venue's tier table. That is a feature, not
this fix. The fix here is to stop presenting an isolated-margin answer as if it
were the cross-margin one.

Which margin mode Cachy's users predominantly run, and therefore how often this
is on screen, this analysis did not establish. It changes the urgency, not the
correctness.

## Acceptance criteria

- [x] `projectLiquidation` takes the position side explicitly and no longer
      infers it from `liquidation.lt(entry)`
- [x] A test with `liquidation` equal to `entry` produces the long result for a
      long, and fails without the fix
- [x] `projectLiquidation` takes the margin mode and produces no projected price
      for a cross-margin position
- [x] The leverage UI shows an explicit reason in that case rather than an empty
      row
- [x] `tighter` is never shown without a projection behind it
- [x] Isolated-margin projections are unchanged, verified by the existing six
      cases still passing

## Links

- BUG-0502, BUG-0503 — the order-path half of this audit
- BUG-0501 — the same shape in the size guards: an assumption that degrades to
  "no check" instead of "no number"
