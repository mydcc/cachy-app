---
id: BUG-0555
title: Final live-order confirmation omits TP portions and can imply a zero stop
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

# BUG-0555 — Final live-order confirmation omits TP portions and can imply a zero stop

## Symptom

The final live-order confirmation shows the entry side, quantity, symbol, type, and stop, but omits the take-profit prices and portions that will be sent. An absent stop may also be displayed as a numeric zero instead of an explicit absence.

## Evidence

**Derived.** `src/components/results/PlaceOrderPanel.svelte:238-249` builds the confirmation text without TP prices/portions. The same panel submits positive targets at `:279-281`, while `:223-288` awaits confirmation before placement. The existing stop value is not rendered as a distinct “No stop loss” state when empty or zero.

## Cause

The confirmation was built from a subset of the final plan rather than from one normalized, displayable order-plan fact set.

## Fix

Render the exact normalized entry plan at confirmation: account, entry type, all TP prices/portions, stop state, leverage, and margin mode. Use explicit “No stop loss” for absence and derive facts from the same final plan object sent to the service.

## Acceptance criteria

- [ ] Zero through four TP legs show the same prices and portions sent to the service.
- [ ] Missing stop renders explicitly as no stop loss, never as an ambiguous zero.
- [ ] Confirmation facts are derived from the final normalized plan, not independently re-read inputs.
- [ ] Leverage and margin mode are included where applicable.
- [ ] Paper and live confirmation variants have complete, test-addressable facts.

## Out of scope

- Adding active account names, already owned by FEAT-0378.
- Double-submission handling covered by BUG-0507.
- Changing the order payload format.

## Links

- `src/components/results/PlaceOrderPanel.svelte:223-249`
- `src/components/results/PlaceOrderPanel.svelte:279-288`
- Existing coverage: FEAT-0378, BUG-0507; neither covers complete TP/portion confirmation facts.
