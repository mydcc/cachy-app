---
id: BUG-0212
title: Market Overview modal and favorite tiles reload in a loop
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0212: Market Overview Modal and Favorite Tiles Infinite Reload Loop

## Description
The user reported a severe bug: opening the "Market Overview" window triggers an error that causes all favorite tiles (MarketOverview cards) and the Market Overview window itself to continuously reload. Additionally, the klines (candlesticks) in the chart continuously reload or disappear. 
The user suspected a naming conflict because the favorite tiles have the class `market-overview-card` and the window is also named "Market Overview", or a regression from a recent refactoring.

## Initial Investigation
- **Naming Conflict**: Investigated the components (`MarketOverview.svelte` and `MarketDashboardModal.svelte`) and CSS (`market-overview-card`). No DOM `id` or CSS conflicts were found. The issue is NOT caused by similar naming.
- **WebSocket / MarketWatcher Leak**: `MarketDashboardModal.svelte` registers `price` and `ticker` for all favorites. It has a confirmed bug where it unregisters `ticker` but forgets to unregister `price` upon cleanup/symbol change, leaking the `price` subscription count.
- **Chart Klines Reloading**: `CandleChartView.svelte` triggers a slow-path full chart redraw `candleSeries.setData(unique)` when the `klines` array is fully replaced. If `ensureHistory` is called repeatedly (e.g. by a loop in `$effect` or `register`), it continuously replaces the `klines` array, which explains the "klines reloading or disappearing" symptom.
- **Svelte 5 `$effect` Loops**: `MarketDashboardModal.svelte` accesses `marketState.data` dynamically and sets `previousSymbols = currentSymbols` in an `$effect`. Although it seems stable, exceptions during the `$effect` or rendering snippet (`ModalFrame` untrack issue) could cause Svelte to catch errors and bubble them to `handleGlobalError`, which alters `uiState` and might trigger further layout shifts or reloads.

## Acceptance Criteria
- [ ] Fix the subscription leak in `MarketDashboardModal.svelte` (ensure `price` is unregistered).
- [ ] Investigate and resolve the root cause of the infinite reload loop triggered when the Market Overview modal is opened.
- [ ] Ensure that `CandleChartView.svelte` does not continuously reload/flash when the modal is open.
- [ ] Verify that opening the Market Overview window does not disrupt the favorite tiles in the sidebar.

## Out of Scope
- Major architectural changes to `MarketWatcher` or `SubscriptionRegistry` (these should remain as they are unless fundamentally broken).
