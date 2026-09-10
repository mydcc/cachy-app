---
id: BUG-0426
title: Stateful technicals calculator uses toNumber on tick close
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: technicals
data_class: none
adr: none
depends_on: []
---

# BUG-0426 — Stateful technicals calculator uses toNumber on tick close

## Symptom

Financial price data loses precision when passing through the stateful technicals calculator because `Decimal` instances are converted down to native Javascript numbers.

## Evidence

**Derived**, from reading the code.

In `src/utils/statefulTechnicalsCalculator.ts`, at line 77, the incoming tick's close price is immediately converted to a native number (f64):
```typescript
const currentPrice = tick.close.toNumber();
```

While floating-point may be acceptable in isolated environments such as indicator line graphs or WebGPU compute, extracting financial prices like `tick.close` into a generic native number opens the risk of downstream logic depending on these values, breaking the strict "no f64 arithmetic on money" policy.

## Cause

The implementation attempts to simplify technical indicator updates (EMA, RSI, SMA) by holding intermediate arrays of primitive floats rather than persisting `Decimal` references throughout the calculation graph.

## Fix

Review the boundary where financial prices enter the technicals calculation (`currentPrice = tick.close.toNumber()`). If the target calculations strictly do not govern financial accounting/PNL margins and are purely for display indicators, document this boundary properly. Otherwise, migrate the required technicals graph to handle string decimals or `Decimal` objects natively. Do not apply the fix now, just track the required audit.

## Acceptance criteria

- [ ] A test verifies that no f64 precision loss leaks into actual financial arithmetic from the stateful technicals pipeline.
- [ ] The usage of `toNumber()` on `tick.close` is safely eliminated or securely bounded.
- [ ] The test passes with the fix applied.

## Links
