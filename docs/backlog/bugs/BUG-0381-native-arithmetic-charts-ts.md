---
id: BUG-0381
title: Native arithmetic usage found in src/lib/calculators/charts.ts
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: calculators
data_class: none
adr: none
depends_on: []
---

# BUG-0381 — Native arithmetic usage found in src/lib/calculators/charts.ts

## Symptom

During a weekly audit for native `number`/`f64` arithmetic on prices, amounts, or balances, usage of native arithmetic was found. Financial values must be computed and formatted using `decimal.js` (or safe equivalents) to avoid precision errors.

## Evidence

derived, from reading the code

- **Location**: `src/lib/calculators/charts.ts:429`

## Cause

Native arithmetic functions (`Number()`, `parseFloat()`, `.toFixed()`, or `f64` fields) are used for handling financial values, which violates the architectural constraint requiring safe big number/decimal logic.

## Fix

Replace the identified usage of native arithmetic at `src/lib/calculators/charts.ts:429` with safe decimal arithmetic (e.g. `Decimal`, `rust_decimal`).

## Acceptance criteria

- [ ] The identified usage of native arithmetic at `src/lib/calculators/charts.ts:429` is replaced with safe decimal arithmetic
- [ ] No regressions in functionality
