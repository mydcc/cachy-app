---
id: BUG-0550
title: TP/SL trigger prices are not validated against position direction
type: bug
status: specced
priority: P0
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
---

# BUG-0550 — TP/SL trigger prices are not validated against position direction

## Symptom

A long stop above entry or long take-profit below entry can pass the post-entry TP/SL surfaces. The inverse wrong-side levels can also pass for shorts, allowing a protection or exit plan with the opposite economic meaning to reach paper or live execution.

## Evidence

**Derived.** `src/components/shared/TpSlPriceInput.svelte:203-227` rejects non-positive trigger values but does not compare the trigger with entry and side. `TpSlCreateModal.svelte:137-208`, `TpSlEditModal.svelte`, and `CandleChartView.svelte:726-752` accept positive dragged or typed levels without semantic direction checks. `src/services/orderGate.ts:1569-1642` checks displayed/transmitted equality but not side semantics. `src/services/paperExchange.ts:318-367` and `:410-456` derive trigger direction from the level’s relation to entry, so a contradictory positive level can produce a successful but unintended simulated close.

## Cause

The data model carries price and position identity but has no shared invariant relating TP/SL level to position side and entry price.

## Fix

Add one Decimal-based TP/SL semantic validator shared by calculator, create/edit, chart drag, order gate, paper exchange, and live transport. Require long TP above entry and SL below entry, with inverse rules for short; require positive finite and tick-aligned values, and fail closed when side/entry context is unavailable.

## Acceptance criteria

- [ ] Long TP below entry and long SL above entry are refused.
- [ ] Short TP above entry and short SL below entry are refused.
- [ ] Equal-to-entry, zero, negative, and non-finite levels are refused.
- [ ] Valid levels continue to pass in paper and live modes.
- [ ] Chart drag, entry TP rows, post-entry create/edit, and the gate produce the same refusal.
- [ ] Tests prove no TP/SL request is signed for an invalid direction.

## Out of scope

- Trailing stops.
- Exchange-specific trigger-order behavior beyond side semantics.
- Automatic repair of an already accepted wrong-side order.

## Links

- `src/components/shared/TpSlPriceInput.svelte:203-227`
- `src/components/shared/TpSlCreateModal.svelte:137-208`
- `src/lib/windows/implementations/CandleChartView.svelte:726-752`
- `src/services/orderGate.ts:1569-1642`
- `src/services/paperExchange.ts:318-367`
- `src/services/paperExchange.ts:410-456`
- Existing coverage: BUG-0002, FEAT-0254, BUG-0505; none validates TP/SL semantic direction.
