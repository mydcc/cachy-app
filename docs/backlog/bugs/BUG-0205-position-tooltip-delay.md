---
id: BUG-0205
title: Position details hidden behind tooltip delay
type: bug
status: specced
priority: P2
milestone: none
editions: [community]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0205 — Position details hidden behind tooltip delay

## Symptom

When a user views their active positions, critical financial information (like detailed PnL, ROI, and margin details) is hidden inside a hover tooltip (`PositionTooltip.svelte`). The user has to wait for the tooltip to appear to see their money/status. Furthermore, the tooltip design here is questionable and might not be the right UI pattern for this primary information, as it requires active hovering.

## Evidence

*Demonstrated* — Navigating to the positions list in the dashboard requires hovering over a position to see the `PositionTooltip`. This is frustrating, especially for core data. The current implementation uses a fixed pixel calculation in `PositionsList.svelte` rather than robust positioning, leading to flickering and bad UX on both desktop and mobile.

## Cause

Crucial information was moved into a tooltip to save space in the list view, but it creates a UX bottleneck where users have to hunt for their financial status instead of seeing it at a glance or via a click-to-expand mechanism.

## Fix

- Evaluate if the `PositionTooltip` can be removed entirely (as suggested by user).
- Either display the most critical information directly in the position row, or use an accordion/expandable row design for details.
- If a tooltip/popover remains necessary, it should use proper intent delays and click-to-pin functionality (as discussed in UI/UX polishing).

## Acceptance criteria

- [ ] Core financial details of a position are accessible without relying on a hover delay.
- [ ] The position list UX is stable on both mobile and desktop (no flickering tooltips).

## Links
