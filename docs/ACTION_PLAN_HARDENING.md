# Action Plan: Hardening & Maintenance (cachy-app)

## 1. CRITICAL: Stability & Data Integrity

### 1.1 Fix "Ghost Order" Risk in TradeService
**Problem:** `flashClosePosition` calls `omsService.removeOrder` upon API failure. If the API call actually succeeded (but timed out), the UI shows no order while the exchange has an open order ("Ghost Order").
**Solution:**
- **Defensive State:** Instead of removing, mark order as `_isUnconfirmed: true`.
- **Recovery Mechanism:** Implement a robust `ReconciliationService` or enhance `TradeService` to periodically poll for status of unconfirmed orders until resolved.
- **Test Case:**
  - Mock API to delay response > timeout.
  - Verify Order is NOT removed from Store.
  - Verify Order is marked `unconfirmed`.
  - Trigger "Sync" -> Verify Order status updates.

### 1.2 Fix Blocking Logging in WebSocket Service
**Problem:** `src/services/bitunixWs.ts` uses `JSON.stringify(message)` inside a catch block. If `message` is a massive garbage payload, this blocks the Event Loop.
**Solution:**
- Implement `safeLogString(obj, maxLength)` utility.
- Use this utility in all catch blocks handling external data.
- **Verification:** Unit test passing a circular object and a 10MB string to the handler.

## 2. WARNING: UX & Resource Management

### 2.1 Complete i18n for Input Components
**Problem:** Hardcoded strings in `PortfolioInputs.svelte`.
**Solution:**
- Extract strings: "Fetch Balance", "e.g. 100".
- Add keys to `src/locales/locales/en.json` (e.g., `dashboard.portfolioInputs.fetchBalance`, `dashboard.portfolioInputs.exampleAmount`).
- Replace hardcoded strings with `$t(...)`.

### 2.2 Prevent Log Flooding in ApiService
**Problem:** `fetchBitgetKlines` logs a warning for *every* invalid candle.
**Solution:**
- Implement a "Throttle Logger" or "Batch Summary Logger".
- E.g., `Dropped ${count} invalid klines in this batch` (log once per batch).

### 2.3 Fix Potential Memory Leak in MarketWatcher
**Problem:** `staggerTimeouts` Set is not guaranteed to be cleared if a callback throws or if logic creates orphans.
**Solution:**
- Ensure `delete(id)` is called in a `finally` block or strictly managed wrapper.

## 3. REFACTOR: Technical Debt (Low Priority)

### 3.1 Hardening "Fast Path" Types
**Problem:** `bitunixWs.ts` uses `any` for performance.
**Solution:**
- Introduce `LightweightInterface` for Price/Ticker data.
- Use explicit type guards that are cheaper than Zod but safer than `any`.

## Execution Order
1. **Critical Fixes** (TradeService, BitunixWs Logging)
2. **i18n & UX** (PortfolioInputs)
3. **Resource Hardening** (Log Flooding, MarketWatcher)
