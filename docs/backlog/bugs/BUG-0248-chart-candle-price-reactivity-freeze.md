---
id: BUG-0248
title: Candlestick chart and position live price updates freeze due to Svelte 5 reactivity gap
type: bug
status: specced
priority: P1
milestone: M3
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
estimate: 2
size: S
target_date: 2026-11-05
start_date: 2026-08-19
---

# BUG-0248 — Candlestick chart and position live price updates freeze due to Svelte 5 reactivity gap

## Problem

Traders report that candlestick charts in Cachy stop updating after a short time and appear completely frozen. When switching between timeframes or reloading, new candles suddenly appear, but live ticks for the current forming candle stop rendering shortly afterwards. Similarly, live position mark prices lag behind or stall.

## Root Cause

1. **In-place array mutation in `klineBuffers.ts`**:
   When live WebSocket ticks arrive for the currently forming candle, `KlineBufferManager.applySymbolKlines` updates the last candle in-place (`existingHistory[lastIdx] = updatedKline`) to avoid unnecessary allocations.
2. **Svelte 5 `$effect` dependency tracking gap**:
   In `CandleChartView.svelte`, the `$effect` only accesses `marketState.data[normalized]?.klines?.[timeframe]`. Because the array reference `klines` does not change during in-place mutation and `marketData?.lastUpdated` is not referenced within the effect, Svelte 5's reactivity engine does not detect changes to the current candle. The component's Fast Path (`candleSeries.update()`) never executes on live WebSocket flushes.
3. **Timeframe switch workaround**:
   Switching timeframes forces a REST history fetch that reassigns the array reference, triggering `$effect` exactly once for the initial render before freezing again.

## Proposal

1. **Reactivity binding in `CandleChartView.svelte`**:
   Reference `marketData?.lastUpdated` (or an explicit tick sequence counter) in the reactive `$effect` so every buffered WebSocket flush triggers the update.
2. **Ensure Fast Path Execution**:
   Verify that `candleSeries.update(update)` receives valid live candle data on every tick without triggering full series recreation.
3. **Regression Tests**:
   Add a component test in `CandleChartView.component.test.ts` verifying that in-place updates to `marketState.data[symbol].klines` trigger `candleSeries.update()` with the updated candle.

## Acceptance criteria

- [ ] Live candle ticks for the currently forming candle update the chart in real-time without requiring timeframe switches or page reloads.
- [ ] In-place updates to `marketState.data[symbol].klines` trigger the fast path `candleSeries.update()` on every flush.
- [ ] Initial history load and timeframe switching continue to perform full series rendering cleanly.
- [ ] Regression test proves that updating a candle in `marketState` triggers the chart series update.

## Verification Strategy

- `npm test src/lib/windows/implementations/CandleChartView.component.test.ts`
- `npm run check`

## Links

- `src/lib/windows/implementations/CandleChartView.svelte`
- `src/stores/market/klineBuffers.ts`
- `src/stores/market.svelte.ts`
