## 2025-02-12 - Disable aria-live on ticking market data
**Learning:** Live-updating market data (like ticking prices and PnL) constantly updates the DOM. Without explicitly turning off `aria-live`, screen readers might read out every single tick change, overwhelming users.
**Action:** Added `aria-live="off"` to the elements containing ticking mark prices and unrealized PnL in `MarketOverview.svelte` and `PositionsList.svelte`.
