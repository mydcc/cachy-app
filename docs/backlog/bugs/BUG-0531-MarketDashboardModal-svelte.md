---
id: BUG-0531
title: Native number arithmetic used for financial value in MarketDashboardModal.svelte
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

# BUG-0531 — Native number arithmetic used for financial value in MarketDashboardModal.svelte

## Symptom

Loss of precision or rounding errors can occur when dealing with financial values (prices, amounts, balances, PnL) due to native number/f64 usage.

## Evidence

**derived, from reading the code**

Found in `./src/components/shared/MarketDashboardModal.svelte` at line 261:
```typescript
const p = typeof price === "string" ? parseFloat(price) : price;
```
Native number/f64 arithmetic or conversion (like `Number()`, `parseFloat()`, or `f64` structs) is used here for a financial value, which violates the strict rule to use `decimal.js`.

## Cause

Native IEEE-754 number or f64 arithmetic is lossy for financial amounts.

## Fix

Replace the native number arithmetic or conversion with `decimal.js` operations.

## Acceptance criteria

- [ ] A test reproduces the defect and fails without the fix
- [ ] The test passes with the fix
- [ ] Native number arithmetic is no longer used for this financial value
