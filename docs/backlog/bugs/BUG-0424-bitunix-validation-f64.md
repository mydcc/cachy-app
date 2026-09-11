---
id: BUG-0424
title: Financial values in Bitunix validation schemas allow f64 numbers
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: backend
data_class: none
adr: none
depends_on: []
---

# BUG-0424 — Financial values in Bitunix validation schemas allow f64 numbers

## Symptom

Financial values like prices and amounts may be parsed and held as native `number` (f64) rather than safely remaining as decimal strings. This risks silent precision loss during Zod schema validation before `Decimal` arithmetic can be correctly applied.

## Evidence

**Derived**, from reading the code.

In `src/types/bitunixValidation.ts`, multiple financial fields are defined using `z.union([z.string(), z.number()])`. For example, on line 18:
```typescript
mp: z.union([z.string(), z.number()]).optional(), // Mark Price
```
And on line 93:
```typescript
price: z.union([z.string(), z.number()]).optional(),
```

Using `z.number()` allows APIs to transmit precise financial values as raw floats, losing precision upon ingestion.

## Cause

The Zod schemas for Bitunix API data validation permit native numbers instead of strictly enforcing strings for fields that represent prices and quantities, likely due to a permissive type setup in the early implementation.

## Fix

Update the Bitunix validation schemas in `src/types/bitunixValidation.ts` to require strings for financial fields (`mp`, `ip`, `price`, `amount`, `size`, `dealAmount`, etc.). Reject raw numeric formats or use a transformation that avoids f64 conversion. Do not change actual logic that performs math.

Applied: the three to-be-hardened schemas (`BitunixTickerDataSchema`,
`BitunixOrderSchema`, `BitunixPositionSchema`) now route every money field
through the existing `SafeString` normalizer — the same contract BUG-0425
established for `BitunixPriceDataSchema`/`StrictPriceDataSchema`. Numbers are
accepted but leave the schema as their shortest round-trip string, so no f64
widening occurs downstream. `ctime` (timestamp) stays a raw union.

Follow-up: those three schemas turned out to be unused (BUG-0437) and were
removed rather than wired. The money boundary stays enforced by the live
`BitunixPriceDataSchema` and the `Strict*` variants the WS parser executes.

## Acceptance criteria

- [x] A test reproduces the defect by validating an API payload with an unrepresentable f64 value that loses precision.
- [x] The Bitunix validation schemas strictly enforce string types for financial fields.
- [x] The test passes with the fix (API payload is either rejected or correctly preserved as a string).

## Links
