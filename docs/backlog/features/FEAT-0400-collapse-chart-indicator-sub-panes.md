---
id: FEAT-0398
title: Collapse chart indicator sub-panes to header strips
type: feature
status: in-progress
assignee: claude
branch: feat/chart-pane-collapse
priority: P2
milestone: M3
editions: [community, pro, private]
area: chart
data_class: none
adr: none
depends_on: []
estimate: 2
size: S
target_date: 2026-09-18
start_date: 2026-09-04
---

# FEAT-0398 — Collapse chart indicator sub-panes to header strips

GitHub issue: #2658

## Problem

Indicator sub-panes below the price chart always occupy their full height.
With several indicators enabled, the price pane gets squeezed and there is no
way to temporarily hide a pane without disabling the indicator entirely
(which also stops the calculation).

## Proposal

Add a chevron toggle in each indicator sub-pane header that collapses the
pane to a slim header strip (title + params stay visible). Collapsing only
affects chart display — the indicator keeps calculating. State persists
across sessions.

## Acceptance Criteria

- [x] Chevron button in every indicator sub-pane header toggles collapse/expand.
- [x] Collapsed pane shrinks to a header strip; other panes redistribute space.
- [x] Collapse state is chart-display only (`visible`), separate from indicator `enabled`.
- [x] State persists via the indicator store.
- [x] i18n labels (DE/EN) for collapse/expand.

## Out of Scope

- Changing indicator calculation when collapsed (stays active).
- Reordering panes or drag handles.
