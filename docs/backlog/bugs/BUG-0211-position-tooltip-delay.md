---
id: BUG-0211
title: Position details hidden behind tooltip delay
type: bug
status: ready
priority: P2
milestone: none
editions: [community]
area: ui
data_class: none
adr: none
depends_on: []
start_date: 2026-08-15
size: XS
estimate: 1
---


# BUG-0211 — Position details hidden behind tooltip delay

## Symptom

When a user views their active positions, critical financial information (like detailed PnL, ROI, and margin details) is hidden inside a hover tooltip (`PositionTooltip.svelte`). The user has to wait for the tooltip to appear to see their money/status. Furthermore, the tooltip design here is questionable and might not be the right UI pattern for this primary information, as it requires active hovering.

## Evidence

*Demonstrated* — Navigating to the positions list in the dashboard requires hovering over a position to see the `PositionTooltip`. This is frustrating, especially for core data. The current implementation uses a fixed pixel calculation in `PositionsList.svelte` rather than robust positioning, leading to flickering and bad UX on both desktop and mobile.

## Cause

Crucial information was moved into a tooltip to save space in the list view, but it creates a UX bottleneck where users have to hunt for their financial status instead of seeing it at a glance or via a click-to-expand mechanism.

## Fix

- Remove hover-triggered `PositionTooltip` in `PositionsList.svelte` entirely.
- Display all critical position details inline directly within the `detailed` position card:
  - Add `liquidationPrice` (with warning styling if present) and `marginMode` (e.g. cross/isolated badge) inline alongside existing margin and size details.
- Clean up or deprecate `PositionTooltip.svelte` if it has no other consumers.

## Acceptance criteria

- [ ] Core financial details of a position (size, entry, mark, margin, liquidation price, margin mode, realized/unrealized PnL) are accessible directly in the card without relying on a hover delay.
- [ ] Hover-triggered tooltip for position items in `PositionsList.svelte` is removed.
- [ ] The position list UX renders stably and responsively on both mobile and desktop (no flickering tooltips or mouse coordinate popovers).

## Out of scope

- Popover or modal sheets for positions (inline layout per Option A suffices).
- Changes to order tooltips (`OrderDetailsTooltip`) or chart tooltips.

## Links
