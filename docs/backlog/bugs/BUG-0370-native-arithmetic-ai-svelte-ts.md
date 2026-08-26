---
id: BUG-0370
title: Native arithmetic usage found in src/stores/ai.svelte.ts
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: ai
data_class: none
adr: none
depends_on: []
---

# BUG-0370 — Native arithmetic usage found in src/stores/ai.svelte.ts

## Symptom

During a weekly audit for native `number`/`f64` arithmetic on prices, amounts, or balances, usage of native arithmetic was found. Financial values must be computed and formatted using `decimal.js` (or safe equivalents) to avoid precision errors.

## Evidence

derived, from reading the code

- **Location**: `src/stores/ai.svelte.ts:622`

## Cause

Native arithmetic functions (`Number()`, `parseFloat()`, `.toFixed()`, or `f64` fields) are used for handling financial values, which violates the architectural constraint requiring safe big number/decimal logic.

## Fix

Replace the identified usage of native arithmetic at `src/stores/ai.svelte.ts:622` with safe decimal arithmetic (e.g. `Decimal`, `rust_decimal`).

## Acceptance criteria

- [ ] The identified usage of native arithmetic at `src/stores/ai.svelte.ts:622` is replaced with safe decimal arithmetic
- [ ] No regressions in functionality
