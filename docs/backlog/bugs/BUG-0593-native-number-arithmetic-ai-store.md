---
id: BUG-0593
title: Native number arithmetic used for financial values in ai.svelte.ts
type: bug
status: done
assignee: opencode
branch: fix/bug-0592-0593-decimal-sort-ai
priority: P1
milestone: none
editions: [community, pro, private]
area: ai
data_class: none
adr: none
depends_on: []
---

# BUG-0593 — Native number arithmetic used for financial values in ai.svelte.ts

## Symptom

Financial values (like PNL) are converted to native `number` types. Native IEEE-754 `number` arithmetic is lossy for financial values and prohibited outside of read-only UI display boundaries (like canvas charts) to prevent precision artifacts.

## Evidence

**Derived**, from reading the code.

The file `src/stores/ai.svelte.ts` uses `.toNumber()` on financial `Decimal` values:
- `src/stores/ai.svelte.ts`: Line 904 (`const pnlNum = new Decimal(t.totalNetProfit || 0).toNumber();`)

*(Note: The use of `.toNumber()` at line 1050 for bidRatio formatting is considered safe as it is a percentage/ratio display.)*

## Cause

The store converts the high-precision `Decimal` representing a journal entry's total net profit into a native number.

## Fix

Keep the value as a `Decimal` or convert it to a string for serialization/display, avoiding the `.toNumber()` conversion.

## Acceptance criteria

- [x] A test reproduces the defect and fails without the fix
- [x] The test passes with the fix
- [ ] No `toNumber()` or other native number conversions are used for financial calculations/comparisons in this file
  (one `.toNumber()` remains at the bidRatio display formatter — the ticket's
  own carve-out: percentage/ratio percent-string, not a financial value)
