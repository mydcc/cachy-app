---
id: BUG-0444
title: slotOf() claims shapes readers cannot round-trip (visit-time wipe)
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: [BUG-0443]
assignee: claude-code
branch: fix/bug-0444-price-round-trip
start_date: 2026-09-14
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

- [x] `slotOf()` mirrors reader constraints (`referenceFor`-equivalent for indicators, `gte`/`lte` check for price), OR
- [ ] `setSlotCondition` skips clearing members the slot's reader cannot rehydrate (checked via a dry-run hydration) — not needed: the first option was taken, with the dry run moved into the claim itself
- [x] Reproduction case (store a window indicator in draft, open Indicators tab) keeps the member in the group
- [x] New test case covers at least one edge case (e.g., window RHS indicator)
- [x] No existing test's expectation changes — except the three `known gap (BUG-0444)` assertions, which said they would flip
- [x] Blocks FEAT-0030 (Combo tab) from depending on `slotOf` for multi-condition handling until resolved

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

## Progress

- 2026-09-13: the "id not in the catalogue" case of this class is closed with
  BUG-0451. `slotOf()` claims an indicator condition only while `catalogueEntry()`
  resolves its id, so a condition on an id the panel stopped offering stays
  unclaimed and survives a tab switch. The window/mark-RHS and `percent_change`
  operator cases above are still open; the AC below stay for those.
- 2026-09-13: the indicators half is closed with FEAT-0446 group 4 (OBV). `slotOf()`
  now claims an indicator condition exactly when `indicatorFormOf()` — the parser
  `readIndicatorForm()` itself uses, in `indicatorFormLeaf.ts` — can read it, so the
  window-over-another-operand and mark-source-price RHS cases are unclaimed, and so is
  OBV against anything but its own window. The `percent_change` operator case in the
  price builder is still open, and still pinned in `conditionSlots.test.ts`.
- 2026-09-14: the price half is closed. `priceFormLeaf.ts` holds the price reader
  and the price builder together; `priceReadingOf()` reads a candidate form and
  claims the condition only when `buildPriceCondition()` writes that exact
  condition back (constants compared as numbers). `slotOf()` and `readPriceForm()`
  both call it. Beyond the `gt` operator, this unclaims a percentage whose sign
  does not match its operator, a zero or unparseable level, a fractional lookback,
  and an explicit `source: "last"`.
- 2026-09-14: a second loss of the same class, found on the way: the tab did not
  read the OHLC field or the series back, so a chart click seeded with `mark`
  (and `high`) was rewritten on mount to `last`/`close`, because `seed()` resets
  both panel defaults. The tab now hydrates `priceField` and `priceSeries` from
  the claimed condition.
- Not in scope, on purpose: every builder writes the draft's `trigger_timeframe`
  into its condition, so a claimed condition on another timeframe follows the
  trigger on mount. That is the builders' shared design (`PriceTab`,
  `IndicatorsTab`, `CandlesticksTab`, `ComboTab`), not a reader gap.

## Related

- Code review feedback on PR #3209 (BUG-0443)
- Blocks: FEAT-0030 (combined alerts, Combo tab)
- Dependency: BUG-0443 (slot model, cross-tab wipe fix)
- Closed in part by: BUG-0451 (the id-not-in-catalogue case)
