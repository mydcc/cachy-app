---
id: BUG-0484
title: Native number arithmetic on financial value in charts.ts
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: calculator
data_class: none
adr: none
depends_on: []
---

# BUG-0484 — Native number arithmetic on financial value in charts.ts

## Symptom

Financial values (prices, amounts, or balances) are being processed using native number/f64 arithmetic or conversions (Number(), parseFloat(), toFixed() without arguments returning strings from number, or f64 fields in Rust structs) instead of Decimal. This can lead to precision loss and floating-point errors in financial calculations.

## Evidence

**Derived**, from reading the code.

File: `src/lib/calculators/charts.ts`
Line: 750

## Cause

Native floating-point types (number in TS, f64 in Rust) cannot represent decimal fractions exactly, which is required for financial calculations to prevent cumulative errors.

## Fix

Replace the native number operation with decimal.js (or rust_decimal::Decimal in WASM). For display boundaries where strings are needed, ensure the value is formatted directly from a Decimal instance rather than passing through a native number. For Rust structs, change the field type to Decimal.

## Acceptance criteria

- [ ] The identified line no longer uses native number/f64 operations for financial values.
- [ ] Precision is maintained through the calculation/conversion.
