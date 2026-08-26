---
id: BUG-0356
title: Native arithmetic usage found in src/components/shared/backgrounds/TradeFlowBackground.svelte
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

# BUG-0356 — Native arithmetic usage found in src/components/shared/backgrounds/TradeFlowBackground.svelte

## Symptom

During a weekly audit for native `number`/`f64` arithmetic on prices, amounts, or balances, usage of native arithmetic was found. Financial values must be computed and formatted using `decimal.js` (or safe equivalents) to avoid precision errors.

## Evidence

derived, from reading the code

- **Location**: `src/components/shared/backgrounds/TradeFlowBackground.svelte:148`

## Cause

Native arithmetic functions (`Number()`, `parseFloat()`, `.toFixed()`, or `f64` fields) are used for handling financial values, which violates the architectural constraint requiring safe big number/decimal logic.

## Fix

Replace the identified usage of native arithmetic at `src/components/shared/backgrounds/TradeFlowBackground.svelte:148` with safe decimal arithmetic (e.g. `Decimal`, `rust_decimal`).

## Acceptance criteria

- [ ] The identified usage of native arithmetic at `src/components/shared/backgrounds/TradeFlowBackground.svelte:148` is replaced with safe decimal arithmetic
- [ ] No regressions in functionality
