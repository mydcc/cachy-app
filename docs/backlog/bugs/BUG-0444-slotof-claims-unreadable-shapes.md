---
id: BUG-0444
title: slotOf() claims shapes readers cannot round-trip (visit-time wipe)
type: bug
status: idea
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: [BUG-0443]
size: M
estimate: 3
---

# BUG-0444 — slotOf() claims shapes readers cannot round-trip

## Symptom

The slot model (BUG-0443) prevents cross-tab condition wipes by keeping conditions in place during tab switches. However, visit-time wipes remain:

- An indicator condition with window/volume RHS or price RHS with `source: "mark"` is claimed by `slotOf` as belonging to the indicators slot, but `indicatorConditionForm` rejects it via `referenceFor()`, so it hydrates blank and gets deleted on mount.
- A price condition with `percent_change` and an operator other than `gte`/`lte` is claimed by `slotOf` as belonging to the price slot, but `readPriceForm` cannot render it, so it hydrates blank and gets deleted.

The member is then written as `null` by `setSlotCondition`, removing it from the group.

## Root Cause

`slotOf()` derives slot ownership from operand shapes (`subject.kind`, `kind`, `right.kind`) but does not check the operator constraints that each reader imposes. It claims ownership of shapes that the reader cannot fully round-trip (hydrate, render, edit, write back).

The slot model correctly prevents wipes during tab switches, but it assumes every shape a reader could claim is one the reader can handle. This assumption breaks for:

- Indicators: `referenceFor()` in `indicatorConditionForm.ts` restricts RHS to specific operand types and sources
- Price: `readPriceForm` only round-trips `gte` and `lte` operators

## Acceptance Criteria

- [ ] `slotOf()` mirrors reader constraints (`referenceFor`-equivalent for indicators, `gte`/`lte` check for price), OR
- [ ] `setSlotCondition` skips clearing members the slot's reader cannot rehydrate (checked via a dry-run hydration)
- [ ] Reproduction case (store a window indicator in draft, open Indicators tab) keeps the member in the group
- [ ] New test case covers at least one edge case (e.g., window RHS indicator)
- [ ] No existing test's expectation changes
- [ ] Blocks FEAT-0030 (Combo tab) from depending on `slotOf` for multi-condition handling until resolved

## Test Plan

Before fix:
```
draft.conditions = group([
  compare{
    left: indicator(rsi),
    op: "gt",
    right: window{ … },
    …
  }
])
alertPanelState.activeTab = "indicators"
// member is gone from conditions after hydration
```

After fix: member survives the tab switch.

## Related

- Code review feedback on PR #3209 (BUG-0443)
- Blocks: FEAT-0030 (combined alerts, Combo tab)
- Dependency: BUG-0443 (slot model, cross-tab wipe fix)
