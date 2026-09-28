---
id: BUG-0562
title: Critical account and pending-order financial details are hover-only
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: A
adr: none
depends_on: []
---

# BUG-0562 — Critical account and pending-order financial details are hover-only

## Symptom

Equity, margin health, and pending-order leverage, margin mode, position mode, and TP/SL details are exposed only through mouse hover. Keyboard and touch users cannot reliably inspect the financial facts before acting on an account or resting order.

## Evidence

**Derived.** `src/components/shared/AccountSummary.svelte:87-119` places equity and margin details in a `group-hover` tooltip on a non-focusable `div`. `AccountTooltip.svelte:47-68` has no keyboard or explicit touch trigger. `src/components/shared/OpenOrdersList.svelte:123-137` exposes order details through mouse enter/leave without tabindex or key handling. `OrderHistoryList.svelte:139-149` and `:327-342` already demonstrate a keyboard-accessible disclosure path.

## Cause

The financial disclosures were implemented as hover affordances rather than focusable, operable disclosure controls.

## Fix

Use an explicit focusable disclosure button for account and pending-order details. On narrow screens, render details inline or in a modal. Ensure all critical financial facts are present in the accessibility tree.

## Acceptance criteria

- [ ] Enter and Space open and close each disclosure.
- [ ] Focus alone exposes the account and order details.
- [ ] A touch tap opens deterministic content and tapping outside closes it.
- [ ] Equity/margin level and order leverage/mode/TP/SL are in the accessibility tree.
- [ ] Escape closes the disclosure and restores focus.

## Out of scope

- Nonfinancial icon tooltips.
- The already-fixed delayed position-tooltip issue.
- Changing the financial data model.

## Links

- `src/components/shared/AccountSummary.svelte:87-119`
- `src/components/shared/AccountTooltip.svelte:47-68`
- `src/components/shared/OpenOrdersList.svelte:123-137`
- `src/components/shared/OrderHistoryList.svelte:139-149`
- Existing coverage: no backlog item records hover-only critical financial details.
