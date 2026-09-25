---
id: BUG-0554
title: Reducing isolated margin submits without showing the liquidation consequence
type: bug
status: done
assignee: opencode
branch: fix/bug-0554-margin-liquidation-preview
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
---

# BUG-0554 — Reducing isolated margin submits without showing the liquidation consequence

## Symptom

An isolated-position margin withdrawal can move liquidation materially closer while the dialog still displays only the pre-write liquidation price. The user can submit a risk-increasing change without seeing the resulting consequence.

## Evidence

**Derived.** `src/components/shared/AdjustMarginModal.svelte:65-91` computes only a margin-ceiling check and `:99-105` sends a negative amount for withdrawal. The dialog displays current margin and liquidation price at `:138-155` but does not project the new liquidation price, and `:202-222` submits without a consequence confirmation.

## Cause

The operation was implemented as a balance ceiling and submission flow without a risk-projection or read-back gate for the resulting isolated position.

## Fix

Show current and projected liquidation price/distance for add and reduce operations. Require a direction-specific confirmation when liquidation moves closer, and reconcile exchange state after success. If the venue model cannot be projected, state that explicitly rather than presenting the old value as the only consequence.

## Acceptance criteria

- [ ] Long and short isolated examples show the expected new liquidation level after add and reduce.
- [ ] A margin reduction cannot submit without confirmation of current margin, new margin, and liquidation consequence.
- [ ] Missing projection inputs produce an explicit unmeasurable state.
- [ ] Success triggers exchange-state reconciliation and failure never reports success from the local draft.
- [ ] Tests cover both sides and both operation directions.

## Out of scope

- Cross-margin adjustment.
- Asset-mode changes.
- Inventing a maintenance-margin model when venue calibration is unavailable.

## Links

- `src/components/shared/AdjustMarginModal.svelte:65-105`
- `src/components/shared/AdjustMarginModal.svelte:138-155`
- `src/components/shared/AdjustMarginModal.svelte:202-222`
- Existing coverage: FEAT-0068; it requires the operation and reconciliation, not a liquidation consequence preview.
