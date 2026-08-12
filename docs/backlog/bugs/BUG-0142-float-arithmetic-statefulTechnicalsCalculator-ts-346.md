---
id: BUG-0142
title: Native float arithmetic used for financial values in statefulTechnicalsCalculator.ts:346
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: core
data_class: none
adr: none
depends_on: []
---

# BUG-0142 — Native float arithmetic used for financial values in statefulTechnicalsCalculator.ts:346

## Symptom

Financial calculations or representations (prices, amounts, balances, etc.) are using native number/f64 arithmetic (`Number()`, `parseFloat()`, `.toFixed()`, `f64` fields) instead of `Decimal.js`. This violates the institutional-grade standard of zero tolerance for floating-point inaccuracies in financial data.

## Evidence

**Derived**, from reading the code.

File: `src/utils/statefulTechnicalsCalculator.ts`
Line: 346

```typescript
private updateRsiGroup(result: TechnicalsData, price: number) {
```

## Cause

The developer used native JavaScript `number` types or WebAssembly `f64` types, or associated methods like `Number()`, `parseFloat()`, or `.toFixed()` for fields that represent money (prices, amounts, balances, fees, costs).

## Fix

Refactor the code to use `Decimal.js` for all financial calculations, types, and formatting.

## Acceptance criteria

- [ ] A test reproduces the defect and fails without the fix
- [ ] The test passes with the fix
- [ ] No native float arithmetic is used for financial values in this location

## Links
