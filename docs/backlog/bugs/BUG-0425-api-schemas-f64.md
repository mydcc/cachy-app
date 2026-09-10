---
id: BUG-0425
title: Financial values in API schemas allow f64 numbers
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: backend
data_class: none
adr: none
depends_on: []
---

# BUG-0425 — Financial values in API schemas allow f64 numbers

## Symptom

Prices, amounts, and other financial balances processed through API schemas allow native `number` types (f64 representation), which can lead to silent precision loss before values are properly mapped to `Decimal`.

## Evidence

**Derived**, from reading the code.

In `src/types/apiSchemas.ts`, financial fields are validated using a union that allows both strings and native numbers. For instance, `PriceLike` on line 250 is defined as:
```typescript
const PriceLike = z.union([z.string(), z.number()]);
```
And similarly for amount and size fields, like on line 187:
```typescript
size: z.union([z.string(), z.number()]).optional(),
```

Native numbers (f64) cannot perfectly represent all financial decimals, and permitting them in schemas allows precision loss to slip in during data ingestion from external APIs.

## Cause

The generic API schemas were originally defined with permissive types (`z.union([z.string(), z.number()])`) instead of strictly requiring string-encoded numbers for all financial payloads.

## Fix

Update the Zod schemas in `src/types/apiSchemas.ts` to strictly require strings for financial data (`PriceLike`, `size`, `amount`, `unrealizedPNL`, etc.). Do not modify logic involving `Decimal` computations, only the boundary validations.

## Acceptance criteria

- [ ] A test reproduces the defect by supplying an unrepresentable f64 value in an API schema validation and observing precision loss.
- [ ] Financial fields in `src/types/apiSchemas.ts` are strictly enforced as strings.
- [ ] The test passes with the fix (raw numbers are safely handled as strings or rejected without data loss).

## Links
