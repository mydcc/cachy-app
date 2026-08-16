---
id: BUG-0218
title: Open position live mark price updates unreliably or stalls until page reload
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: []
---

# BUG-0218 — Open position live mark price updates unreliably or stalls until page reload

## Symptom

When a user has open positions, the mark price (`→ Mark Price`), live unrealized PnL, and ROI percentage in `PositionsSidebar.svelte` / `PositionsList.svelte` update inconsistently:
- Prices update for a while, then freeze or update only intermittently.
- In some cases, the mark price shows `?` or stays stuck at the entry price / initial snapshot.
- The user must press F5 to reload the page to get current position prices and PnL values.

## Evidence

*Demonstrated* — Several factors contribute to position price stalls:
1. **REST Polling Gap for `markPrice`**:
   In `src/services/marketWatcher/historyFetcher.ts` (`pollSymbolChannel`), fallback polling for `channel === "price" || channel === "ticker"` calls `apiService.fetchTicker24h(...)`. It updates `lastPrice`, `highPrice`, `lowPrice`, `volume`, `priceChangePercent`, `quoteVolume` — but **never** updates `markPrice`:
   ```ts
   // historyFetcher.ts lines 335-342
   marketState.updateSymbol(symbol, {
     lastPrice: data.lastPrice,
     highPrice: data.highPrice,
     lowPrice: data.lowPrice,
     volume: data.volume,
     priceChangePercent: data.priceChangePercent,
     quoteVolume: data.quoteVolume,
     // markPrice is MISSING here!
   });
   ```
   Because `PositionsSidebar.svelte` (`resolveMarkPrice`) specifically searches for `marketState.data[symbol]?.markPrice`, when WebSocket is throttled or drops to REST polling, `markPrice` never updates via REST fallback!
2. **Channel Subscription Mismatch**:
   `PositionsSidebar.svelte` registers `marketWatcher.register(sym, "price", "stateless")`. If the exchange payload only pushes `ticker` or fast ticker updates, or if `resolveMarkPrice` falls back to `p.markPrice` (which Bitunix REST/WS position endpoints never populate, see `BUG-0055`), the position PnL computation becomes decoupled from the live `lastPrice` stream unless `lastPrice` is also used as a fallback.
3. **Symbol Normalization & Dual Component Instances**:
   - `PositionsSidebar.svelte` normalizes symbol via `normalizeSymbol(p.symbol, "bitunix")`, but if the active provider is Bitget or if symbols differ between account positions and market store keys, updates miss the store entry.
   - `+page.svelte` mounts two `<PositionsSidebar />` instances (one inside the desktop sidebar and one inside the mobile drawer), causing duplicate `marketWatcher.register` and potential unregister race conditions when responsive breakpoints toggle.

## Cause

1. `HistoryFetcher.pollSymbolChannel` does not populate `markPrice` from REST ticker/mark-price endpoints during fallback polling.
2. `resolveMarkPrice` in `PositionsSidebar.svelte` does not fall back to `marketState.data[symbol]?.lastPrice` when `markPrice` is not provided or unavailable.
3. Tab throttling / reconnection drops the public WebSocket `price` channel without resubscribing open position symbols properly.

## Fix

1. **REST Fallback `markPrice` Support**:
   - In `HistoryFetcher.pollSymbolChannel`, ensure `markPrice` is updated when polling tickers/prices (or derive it / fallback to `lastPrice` when `markPrice` is absent).
2. **Robust `resolveMarkPrice` in `PositionsSidebar.svelte`**:
   - Update `resolveMarkPrice` to check `marketState.data[symbol]?.markPrice` first, and if undefined or zero, fall back to `marketState.data[symbol]?.lastPrice` or `tradeState.symbol` ticker price.
3. **Continuous Subscription Verification**:
   - Ensure `PositionsSidebar` registers both `"price"` and `"ticker"` requirements for open positions, or ensure `marketWatcher.resync()` is triggered whenever positions change or connection recovers.
4. **De-duplicate Mobile/Desktop Sidebar Registrations**:
   - Guard against duplicate registration side-effects between desktop and mobile instances of `PositionsSidebar`.

## Acceptance criteria

- [ ] Open positions in the sidebar continuously reflect live mark price (or last price fallback) and recalculate live unrealized PnL and ROI.
- [ ] During WebSocket fallback or REST polling mode, open position mark prices continue to update without requiring F5.
- [ ] Switching between desktop and mobile views does not unregister or stall price feeds for open positions.
- [ ] Position rows never display `?` for mark price when market data is available for that symbol.

## Out of scope

- Direct exchange order execution logic (covered by OMS/RMS).
- Historical PnL reporting (handled by Journal).
