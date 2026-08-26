---
id: BUG-0369
title: Native arithmetic usage found in src/utils/storageHelper.ts
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: utils
data_class: none
adr: none
depends_on: []
---

# BUG-0369 — Native arithmetic usage found in src/utils/storageHelper.ts

## Symptom

During a weekly audit for native `number`/`f64` arithmetic on prices, amounts, or balances, usage of native arithmetic was found. Financial values must be computed and formatted using `decimal.js` (or safe equivalents) to avoid precision errors.

## Evidence

derived, from reading the code

- **Location**: `src/utils/storageHelper.ts:77`

## Cause

Native arithmetic functions (`Number()`, `parseFloat()`, `.toFixed()`, or `f64` fields) are used for handling financial values, which violates the architectural constraint requiring safe big number/decimal logic.

## Fix

Replace the identified usage of native arithmetic at `src/utils/storageHelper.ts:77` with safe decimal arithmetic (e.g. `Decimal`, `rust_decimal`).

## Acceptance criteria

- [ ] The identified usage of native arithmetic at `src/utils/storageHelper.ts:77` is replaced with safe decimal arithmetic
- [ ] No regressions in functionality
