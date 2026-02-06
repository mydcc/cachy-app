# Institutional Grade Analysis Report & Hardening Plan

## Status: Analysis Complete

### 🔴 CRITICAL: Risk of Financial Loss or Crash

1.  **Zombie Process in `MarketWatcher` (Resource Leak)**
    *   **Location**: `src/services/marketWatcher.ts`, method `ensureHistory`.
    *   **Issue**: The backfill logic uses a `while` loop that awaits API calls up to 30 times. This loop lacks a cancellation check (`!this.isPolling`). If a user navigates away or the component is destroyed, the loop continues to fire network requests in the background.
    *   **Impact**: Wastes API rate limits, consumes client bandwidth, and can lead to "Zombie" updates trying to modify state after destruction.
    *   **Fix**: Add explicit polling state check in the loop and implement strict `AbortController` signals.

2.  **Potential Precision Loss in `MarketManager`**
    *   **Location**: `src/stores/market.svelte.ts`, method `applyUpdate`.
    *   **Issue**: The store accepts `number | string | Decimal` for price updates. While the API service currently returns Decimals, the permissive signature allows `number` (float) to be passed, which would bypass the high-precision `Decimal` logic.
    *   **Impact**: Floating point errors (e.g., `0.1 + 0.2 = 0.30000000000000004`) could corrupt price display or calculations if a future data source uses native numbers.
    *   **Fix**: Add strict type guards and developer warnings in DEV mode to enforce `Decimal` usage.

### 🟡 WARNING: Performance & UX

1.  **Memory/Promise Leak in `newsService`**
    *   **Location**: `src/services/newsService.ts`.
    *   **Issue**: `pendingNewsFetches` maps keys to Promises for deduplication. There is no timeout mechanism. If a fetch promise hangs (network zombie), the map entry is never deleted.
    *   **Impact**: The app stops updating news for that specific symbol until a full page reload.
    *   **Fix**: Wrap fetches in a `Promise.race` with a strict timeout and ensure cleanup in `finally`.

2.  **Fragile Key Handling in `TradeService`**
    *   **Location**: `src/services/tradeService.ts`.
    *   **Issue**: Methods like `fetchTpSlOrders` manually construct JSON bodies with `apiKey` using `JSON.stringify`.
    *   **Impact**: Increases the risk of accidental logging of credentials if developers modify this code without caution.
    *   **Fix**: Centralize payload construction in a `secureFetch` helper.

### 🔵 REFACTOR: Technical Debt

1.  **Inconsistent Error Handling in UI**
    *   **Issue**: Error messages flow from `TradeService` as raw strings (e.g., `dashboard.alerts.noApiKeys`). While `TpSlList.svelte` handles this, a more unified error handler would be preferable long-term.
    *   **Decision**: Postponed (Cosmetic). Focus on functional hardening first.

---

## Action Plan (Summary)

The following fixes are queued for immediate implementation:
1.  **MarketWatcher**: Fix infinite loop in backfill.
2.  **MarketManager**: Add type guards for precision.
3.  **NewsService**: Add timeouts to prevent lockups.
4.  **TradeService**: Refactor key serialization for safety.
