---
id: BUG-0549
title: An entry with insufficient displayed margin remains orderable
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
---

# BUG-0549 — An entry with insufficient displayed margin remains orderable

## Symptom

The calculator can display a margin-exceeded warning while the order panel still permits placement. A user can therefore knowingly confirm and submit an entry whose required margin exceeds the displayed account balance.

## Evidence

**Derived.** `src/services/calculatorService.ts:347-355` computes `isMarginExceeded` as a result flag. The `ready` condition in `src/components/results/PlaceOrderPanel.svelte:167-177` does not include that flag, and the submit button at `:421-425` depends on `ready` rather than fail-closed margin state. `src/services/orderGate.ts:1035-1042` runs available-margin validation only for `kind === "add"`. `src/services/tradeService.ts:1583-1655` sends the calculated open order without a final open-intent balance refusal.

## Cause

The known margin failure is treated as presentation state, and the execution gate’s margin check is restricted to add intents.

## Fix

Make the open intent fail closed when the required margin exceeds the available balance. Disable the live/paper place control and retain the gate as the final authority. Keep the distinct unreadable-balance behavior owned by BUG-0511.

## Acceptance criteria

- [ ] An open with required margin above available balance is refused locally.
- [ ] The refusal identifies the required margin and available balance.
- [ ] The Place Order control is disabled for the same state.
- [ ] A funded open remains unaffected.
- [ ] Paper mode uses the paper account balance consistently.
- [ ] Tests prove that no signed request is sent for an over-margin open.

## Out of scope

- Venue-specific maintenance-margin tiers.
- Exchange-side rejection behavior.
- The add-intent unmeasurable-balance case in BUG-0511.

## Links

- `src/services/calculatorService.ts:347-355`
- `src/components/results/PlaceOrderPanel.svelte:167-177`
- `src/components/results/PlaceOrderPanel.svelte:421-425`
- `src/services/orderGate.ts:1035-1042`
- `src/services/tradeService.ts:1583-1655`
- Existing coverage: BUG-0252, BUG-0511; neither covers demonstrably over-funded open readiness.
