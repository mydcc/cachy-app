---
id: BUG-0252
title: Summary's Required Margin, Max Net Loss and Entry Fee ignore the position-size rounding shown right below them
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: calculator
data_class: none
adr: none
depends_on: []
---

# BUG-0252 — Summary's Required Margin, Max Net Loss and Entry Fee ignore the position-size rounding shown right below them

## Symptom

A user placing a small SOLUSDT short position saw `Margin: 7.15` under "Place
This Position" but `Required Margin: 7.24` under "Summary" — a 9-cent, ~1.3%
gap on a position sized in cents. The same gap applies to Max Net Loss and
Entry Fee, since all three scale with position size.

## Evidence

*Demonstrated* — reported live with a screenshot showing `SIZE 0.76` /
`MARGIN 7.15` in the order panel against `Required Margin: 7.24` in Summary
for the same order. `deriveMoneyMetrics`'s new test
("scales requiredMargin/netLoss/entryFee down when re-derived from a
rounded-down position size", `src/lib/calculators/core.test.ts`) reproduces
the underlying mismatch directly.

## Cause

`calculatorService.ts`'s `calculateAndDisplay()` called
`calculator.calculateBaseMetrics()` — which derives `requiredMargin`,
`netLoss` and `entryFee` from the raw, unrounded `positionSize` — and only
*afterwards* rounded `baseMetrics.positionSize` down to the symbol's
`basePrecision` (line ~264, `Decimal.ROUND_DOWN`) for display and for what
the order panel actually sends. The three money fields were never
re-derived from that rounded size, so Summary showed figures for a slightly
larger (pre-rounding) position than the one that would actually be ordered.

## Fix

Extracted the size-dependent part of `calculateBaseMetrics` into
`deriveMoneyMetrics(positionSize, values, riskAmount)` (`core.ts`) and call
it again in `calculatorService.ts` after rounding `positionSize`, replacing
`baseMetrics.requiredMargin`/`netLoss`/`entryFee` with the re-derived values
whenever rounding actually changed the size. `breakEvenPrice` and
`liquidationPrice` are unaffected — neither depends on position size.

## Acceptance criteria

- [x] A test reproduces the defect (unrounded vs. rounded-size money
      metrics disagreeing) and fails without the fix.
- [x] The test passes with the fix.
- [x] Required Margin, Max Net Loss and Entry Fee in Summary always reflect
      the same position size shown in the order panel below them.

## Verification Strategy

- `npx vitest run src/lib/calculators/core.test.ts`
- `npm run check`

## Links

- `src/lib/calculators/core.ts` (`deriveMoneyMetrics`, `calculateBaseMetrics`)
- `src/services/calculatorService.ts`
