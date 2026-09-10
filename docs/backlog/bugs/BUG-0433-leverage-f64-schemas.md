---
id: BUG-0433
title: Raw leverage fields in Zod schemas accept native numbers
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: backend
data_class: none
adr: none
depends_on: []
---

# BUG-0433 — Raw leverage fields in Zod schemas accept native numbers

## Symptom

A handful of leverage fields cross validator boundaries as native `number`
instead of going through the same money-boundary normalizer the rest of the
schemas now use (BUG-0424, BUG-0425). Leverage is a small integer, so no
precision is actually lost today — this is a consistency/audit item, not a
live money defect. It is split out of BUG-0424 so the Bitunix fix stays
scoped.

## Evidence

**Derived**, from reading the code.

Sibling audit for BUG-0424 found three raw numeric leverage sites:

- `src/types/accountSchemas.ts:30` — `AccountRequestSchema.params.leverage:
  z.union([z.string(), z.number()])`. Reached by
  `src/routes/api/account/+server.ts:39`.
- `src/types/apiSchemas.ts:115-117` — `BitunixTradingPairSchema.minLeverage`,
  `maxLeverage`, `defaultLeverage: z.number()`.
- `src/types/apiSchemas.ts:136` — `BitunixPositionTierSchema.leverage:
  z.number()`.

## Cause

These fields were typed for convenience before the `SafeString`/`MoneyLike`
boundary convention existed. Leverage values are integers, and every integer
up to 2^53 is exactly representable as f64, so there is no observable bug —
only an inconsistency with the stated "financial values leave the schema as
strings" contract.

## Fix

Decide per site and make the decision explicit in code:

- For the raw unions, route them through the existing `SafeString`/`MoneyLike`
  normalizer **or** leave them numeric with a one-line comment stating they are
  integers and deliberately numeric.
- Leave the two coercion sites alone — they are intentional and documented:
  `BitunixLeverageMarginModeSchema` (`apiSchemas.ts:161`,
  `z.coerce.number().min(1)`, rationale at the BUG-0409 comment) and
  `ChangeLeverageSchema` (`accountSettingsSchemas.ts:65`,
  `z.coerce.number().int().min(1).max(500)`). The venue takes an integer and
  the all-or-nothing read must not regress.

Do not change any order/PnL math.

## Acceptance criteria

- [ ] Each of the three raw leverage sites is either normalized to a string at
      the boundary or carries a comment stating it is intentionally numeric.
- [ ] A test covers `AccountRequestSchema` leverage with both string and number
      input and asserts the chosen contract.
- [ ] `BitunixLeverageMarginModeSchema` and `ChangeLeverageSchema` are unchanged
      and their rationale comments remain.

## Out of scope

- The two intentional `z.coerce.number()` sites named above.
- Margin-mode / position-mode enums and any non-leverage field.
- Any change to leverage arithmetic or exchange request signing.

## Links

<!-- backlog-id: BUG-0433 -->
