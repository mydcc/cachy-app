---
id: FEAT-0508
title: "Palette: Disable aria-live on ticking market data"
type: feature
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
assignee: Palette
---

## Problem
Live-updating market data (like ticking prices and PnL) constantly updates the DOM. Without explicitly turning off `aria-live`, screen readers might read out every single tick change, overwhelming users and making the UI unusable for accessibility users.

## Fix
Added `aria-live="off"` to the elements containing the ticking mark price and unrealized PnL in `MarketOverview.svelte` and `PositionsList.svelte`. This prevents assistive technologies from aggressively announcing the frequent DOM changes.

## Acceptance criteria
- [x] Ticking prices in Market Overview have `aria-live="off"`.
- [x] Ticking PnL in Positions List (both layouts) have `aria-live="off"`.
