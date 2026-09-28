---
id: BUG-0552
title: Paper configuration accepts ranges that break fill quantity and price invariants
type: bug
status: done
assignee: opencode
branch: fix/bug-0552-paper-fill-invariants
priority: P2
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
---

# BUG-0552 — Paper configuration accepts ranges that break fill quantity and price invariants

## Symptom

Paper trading can fill more than the requested quantity or produce a non-positive simulated fill price when configuration values are outside their semantic ranges. A ratio of zero currently falls back to a full fill instead of a defined no-fill result.

## Evidence

**Derived.** `src/stores/paperTrading.svelte.ts:364-380` validates only finite and non-negative values, while `src/components/settings/PaperTradingSettings.svelte:39-75` and `:157-175` expose free numeric fields. `src/services/paperExchange.ts:646-650` multiplies quantity by the ratio and falls back to the requested quantity when the result is zero. `fillPrice()` at `:640-644` subtracts slippage without a positivity check, and `applyOpen()` at `:659-724` accepts the resulting price.

## Cause

The generic paper config validator has no field-specific bounds, and the simulator lacks defensive clamps at the point of calculation.

## Fix

Validate each field at persistence and calculation boundaries. Require `partialFillRatio` to be between zero and one with an explicit zero behavior, and reject slippage settings that can produce a non-positive price. Preserve the existing fee-validation behavior in FEAT-0328.

## Acceptance criteria

- [ ] Ratios above one are rejected.
- [ ] Ratio zero follows the documented no-fill behavior and never fills the full request.
- [ ] Slippage that would produce zero or a negative fill price is rejected.
- [ ] `fillQuantity()` never exceeds the requested quantity.
- [ ] `fillPrice()` never returns zero or a negative price.
- [ ] UI validation and direct simulator calls are both covered by tests.

## Out of scope

- Real-money exchange fill models.
- Venue-specific slippage calibration.
- Fee validation already tracked by FEAT-0328.

## Links

- `src/stores/paperTrading.svelte.ts:364-380`
- `src/components/settings/PaperTradingSettings.svelte:39-75`
- `src/services/paperExchange.ts:640-650`
- `src/services/paperExchange.ts:659-724`
- Existing coverage: FEAT-0328; no existing item records partial-fill or slippage range invariants.
