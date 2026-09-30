---
id: BUG-0592
title: Native number arithmetic used for financial values in journalSort.ts
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0592 — Native number arithmetic used for financial values in journalSort.ts

## Symptom

Financial values (like PNL, balances, prices, or amounts) are converted to native `number` types. Native IEEE-754 `number` arithmetic is lossy for financial values and prohibited outside of read-only UI display boundaries (like canvas charts) to prevent precision artifacts.

## Evidence

**Derived**, from reading the code.

The file `src/lib/journalSort.ts` uses `.toNumber()` on financial `Decimal` values:
- `src/lib/journalSort.ts`: Line 82 (`if (val instanceof Decimal) val = val.toNumber();`)
- `src/lib/journalSort.ts`: Line 152 (`val = atr.isZero() ? -1 : entryPrice.minus(stopLoss).abs().div(atr).toNumber();`)
- `src/lib/journalSort.ts`: Line 155 (`val = val.toNumber();`)

## Cause

The implementation attempts to simplify sorting logic by converting high-precision `Decimal` objects to native JavaScript numbers.

## Fix

Replace the `.toNumber()` conversion and the subsequent native number sorting with `Decimal`-native comparisons (e.g., using `.cmp()` or `.lt()`, `.gt()`) when sorting these values.

## Acceptance criteria

- [ ] A test reproduces the defect and fails without the fix
- [ ] The test passes with the fix
- [ ] No `toNumber()` or other native number conversions are used for financial calculations/comparisons in this file
