---
id: BUG-0248
title: Candlestick chart and position live price updates freeze due to Svelte 5 reactivity gap
type: bug
status: done
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

### Layer 1 — Svelte 5 reactivity gap (fixed in #2096/#2104)

1. **In-place array mutation in `klineBuffers.ts`**:
   When live WebSocket ticks arrive for the currently forming candle, `KlineBufferManager.applySymbolKlines` updates the last candle in-place (`existingHistory[lastIdx] = updatedKline`) to avoid unnecessary allocations.
2. **Svelte 5 `$effect` dependency tracking gap**:
   In `CandleChartView.svelte`, the `$effect` only accesses `marketState.data[normalized]?.klines?.[timeframe]`. Because the array reference `klines` does not change during in-place mutation and `marketData?.lastUpdated` is not referenced within the effect, Svelte 5's reactivity engine does not detect changes to the current candle. The component's Fast Path (`candleSeries.update()`) never executes on live WebSocket flushes.
3. **Timeframe switch workaround**:
   Switching timeframes forces a REST history fetch that reassigns the array reference, triggering `$effect` exactly once for the initial render before freezing again.

### Layer 2 — Bitunix WS kline timestamp missing (fixed in fix/BUG-0248-ws-kline-time)

Even after Layer 1 was patched, live candles still did not move because the WS tick itself was silently discarded:

1. The Bitunix `market_kline_*` WebSocket push format is `{ ch, symbol, ts, data: {o,h,l,c,b,q} }` — the `data` object carries **no timestamp**; `ts` is at message level only.
2. `messageParser.parseMessage` forwarded only `data` in the `fast_kline` outcome; `ts` was dropped.
3. `mdaService.normalizeKlines` reads `k.time || k.t || k.ts || k.timestamp` — all `undefined` for WS pushes → `time: NaN`.
4. `KlineBufferManager.applySymbolKlines` compares `newRaw.time === lastKline.time` → `NaN !== realTime` → in-place update skipped; a NaN-kline is appended.
5. `CandleChartView.svelte` slow path filters `!isNaN(Number(k.time)) && > 0` → NaN candle discarded.

**Result**: WS ticks arrived but were never rendered. Only the ~10 s REST polling produced visible chart movement.

## Proposal

### Layer 1
1. **Reactivity binding in `CandleChartView.svelte`**:
   Reference `marketData?.lastUpdated` (or an explicit tick sequence counter) in the reactive `$effect` so every buffered WebSocket flush triggers the update.
2. **Ensure Fast Path Execution**:
   Verify that `candleSeries.update(update)` receives valid live candle data on every tick without triggering full series recreation.
3. **Regression Tests**:
   Add a component test in `CandleChartView.component.test.ts` verifying that in-place updates to `marketState.data[symbol].klines` trigger `candleSeries.update()` with the updated candle.

### Layer 2
4. **Propagate message-level `ts`** through `fast_kline` outcome (`messageParser.ts`).
5. **`withKlineTime` helper** in `channelDispatch.ts`: if `data` lacks any timestamp field, derive the candle open-time by floor-aligning `ts` to the timeframe interval (`Math.floor(ts / intervalMs) * intervalMs`). Both the `fast_kline` fast path and the `validated` slow path use this helper.

## Acceptance criteria

- [x] Live candle ticks for the currently forming candle update the chart in real-time without requiring timeframe switches or page reloads. *(Layer 2 fix eliminates NaN timestamp; Layer 1 fix ensures the reactivity path fires — both proven by unit + component tests)*
- [x] In-place updates to `marketState.data[symbol].klines` trigger the fast path `candleSeries.update()` on every flush. *(proven by `CandleChartView.component.test.ts`)*
- [x] Initial history load and timeframe switching continue to perform full series rendering cleanly. *(proven by `CandleChartView.component.test.ts`)*
- [x] Regression test proves that updating a candle in `marketState` triggers the chart series update.
- [x] `withKlineTime` correctly aligns message-level `ts` to the candle open time for every supported timeframe. *(proven by `channelDispatch.test.ts`)*
- [x] A candle that already carries a timestamp in `data` is never overwritten by the derived value. *(proven by `channelDispatch.test.ts`)*

## Fix

### Layer 1 — Branch `fix/BUG-0248-chart-fast-path-arm` (PR #2096 + #2104)

1. **Fast-path arming hardened** (`CandleChartView.svelte`): `isInitialLoad = false`, `lastRenderedTime` and `lastRenderedCount` are now set immediately after `candleSeries.setData(unique)` succeeds, before the indicator step. Previously they were armed at the end of the `try` block, so any slow-path failure (e.g. EMA computation, visibility options) permanently disarmed the fast path — the chart rendered once and then froze, which matches the reported symptom. The `catch` block now also resets `lastRenderedTime`/`lastRenderedCount` so a failed render is retried on the next cycle.
2. **Regression tests** (`CandleChartView.component.test.ts`, `marketState.helper.svelte.ts`): mount the real component against a real Svelte 5 `$state` store proxy and prove the fast path fires on in-place kline updates, on a bare `lastUpdated` bump (reactivity binding from #2096), on new candles, and stays armed even when the slow-path indicator step throws.

### Layer 2 — Branch `fix/BUG-0248-ws-kline-time`

1. **`messageParser.ts`**: `fast_kline` outcome now includes `ts?: number` (the message-level Unix-ms timestamp).
2. **`channelDispatch.ts`**: new `withKlineTime(data, ts, timeframe)` helper floor-aligns `ts` to the timeframe boundary and injects `data.time` before passing the kline to `mdaService.normalizeKlines`. Both the `fast_kline` fast path and the `validated market_kline_*` slow path are covered.
3. **`channelDispatch.test.ts`**: three new unit tests covering the NaN-elimination, the no-overwrite guard, and the validated-path alignment.

## Verification Strategy

- `npx vitest run src/services/bitunixWs/channelDispatch.test.ts`
- `npm test src/lib/windows/implementations/CandleChartView.component.test.ts`
- `npm run check`

## Links

- `src/lib/windows/implementations/CandleChartView.svelte`
- `src/stores/market/klineBuffers.ts`
- `src/stores/market.svelte.ts`
- `src/services/bitunixWs/messageParser.ts`
- `src/services/bitunixWs/channelDispatch.ts`
- `src/services/bitunixWs/channelDispatch.test.ts`
- `src/services/mdaService.ts`

## What shipped

Shipped in 1.6.0-beta.85.
