---
id: BUG-0567
title: Shrinking modify with widened stop escapes the loss-per-trade ceiling
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: [BUG-0548]
---

# BUG-0567 — Shrinking modify with widened stop escapes the loss-per-trade ceiling

## Symptom

A pending order amended to a smaller quantity returns from the modify
branch before `checkLossPerTrade` runs — so widening the stop on the way
down can push the resulting loss past `maxLossPerTradeUsdt` without a
refusal. Example: 1 → 0.9 with the stop distance widened 500 → 5000
measures a 4500 loss and still passes. The direction check still holds
(the stop stays on the right side), but the dollar ceiling does not.

## Evidence

**Derived** — `rmsService` returns non-increasing modifies before the loss
check (`isQuantityIncreasingModify` gates the whole modify branch), while
the loss math only ever sees increasing ones. BUG-0548's acceptance
criteria demanded quantity-increasing coverage only, so this path was
never in scope — the defect is the exemption coupling quantity to loss,
not the ACs.

## Cause

The modify exemption is quantity-shaped: shrink/price-only skips every
limit, including the loss measurement, which does not depend on the
quantity growing.

## Fix

Decouple the exemption from the measurement: shrinking modifies stay
exempt from the size caps but still measure the resulting position and
stop against `maxLossPerTradeUsdt`. Price-only and TP/SL-only amendments
keep their full exemption (no new exposure to measure).

## Acceptance criteria

- [ ] A test reproduces the defect (shrink + widened stop past the loss ceiling) and fails without the fix
- [ ] The test passes with the fix
- [ ] Increasing, price-only and TP/SL-only modifies keep their exact behaviour (regression tests)

## Links

- `src/services/rmsService.ts` (modify branch before `checkLossPerTrade`)
- BUG-0548 (quantity-increasing modify ceilings)
