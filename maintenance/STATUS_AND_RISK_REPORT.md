# Status & Risk Report (Step 1)

**Date:** 2026-05-20
**Project:** cachy-app (Institutional Grade Hardening)
**Role:** Senior Lead Developer & Systems Architect

## 1. Executive Summary
The codebase demonstrates a high level of sophistication with features like "Fast Path" WebSocket processing, worker-based technical analysis, and extensive use of `Decimal.js` for financial calculations. However, critical risks exist in data integrity (large integer handling), resource management (potential memory retention in stores), and UI resilience.

## 2. Prioritized Findings

### 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1.  **Bitunix WebSocket "Fast Path" Integer Safety**
    *   **Location:** `src/services/bitunixWs.ts` (Lines ~488-608)
    *   **Issue:** The "Fast Path" optimization manually casts `number` fields (like `orderId`, `price`) to strings *after* they have been parsed by `JSON.parse` (via `safeJsonParse`).
    *   **Risk:** While `safeJsonParse` attempts to wrap large integers in strings using Regex, if the Regex fails or misses a context (e.g., a new API field format), the value is passed to `JSON.parse` as a number. If it exceeds `MAX_SAFE_INTEGER` (2^53 - 1), precision is lost *before* the Fast Path code can cast it to a string. The `orderId > 9007199254740991` check in the code confirms this is a known risk, but it's a "detection after failure" rather than prevention.
    *   **Impact:** corrupted Order IDs leading to inability to cancel/modify orders.

2.  **TradeService "Panic" Logic**
    *   **Location:** `src/services/tradeService.ts` (`flashClosePosition`)
    *   **Issue:** The method attempts to `cancelAllOrders` before closing a position. If this fails, it logs a CRITICAL error but *proceeds* to close the position.
    *   **Risk:** Leaving "naked" Stop Loss or Take Profit orders active after the position is closed. If the market moves, these orders could trigger, opening a *new* unintended position.
    *   **Recommendation:** The user must be explicitly notified if cancellation fails, or the close should be aborted/retried with high urgency.

### 🟡 WARNING (Performance issue, UX error, missing i18n)

3.  **MarketWatcher vs. MarketState Cache Eviction**
    *   **Location:** `src/services/marketWatcher.ts` vs `src/stores/market.svelte.ts`
    *   **Issue:** `MarketState` implements an LRU cache (`enforceCacheLimit`) to evict stale data. However, `MarketWatcher` manages WebSocket subscriptions independently. If `MarketState` evicts a symbol but `MarketWatcher` keeps the subscription active (e.g., because a component didn't unmount correctly or `activeTechnicalsManager` logic glitch), `MarketState` will receive a new update for the evicted symbol and *re-create* it, effectively bypassing the cache limit.
    *   **Risk:** Unbounded memory growth in `marketState.data` if the user browses hundreds of symbols in one session without a full page refresh.

4.  **PortfolioInputs Error Handling**
    *   **Location:** `src/components/inputs/PortfolioInputs.svelte`
    *   **Issue:** `handleFetchBalance` catches generic errors and displays `e.message` to the user via `uiState.showError`.
    *   **Risk:** Raw API error messages (potentially containing technical details or confusing codes) might be shown to the user instead of localized, actionable messages.

5.  **Historical Data Backfill Memory Spike**
    *   **Location:** `src/services/marketWatcher.ts` (`ensureHistory`)
    *   **Issue:** The `allBackfilled` array accumulates up to `limit` (2000+) items before being passed to the store. While 2000 is small, if multiple symbols backfill simultaneously (e.g., dashboard load), this creates a temporary memory spike.
    *   **Mitigation:** The code already chunks requests, but `allBackfilled` grows until the end. Streaming updates to the store would be safer.

### 🔵 REFACTOR (Technical Debt)

6.  **MarketWatcher Complexity**
    *   **Issue:** `MarketWatcher` handles Polling, WebSocket subscription management, *and* Historical Data fetching. It is a "God Object".
    *   **Recommendation:** Extract `HistoryService` to handle `ensureHistory` and `loadMoreHistory`.

7.  **Hardcoded Strings in Logs**
    *   **Issue:** Many `logger.warn` calls use hardcoded English strings. While acceptable for logs, some are close to user-facing boundaries (e.g., `toastService` calls).
    *   **Recommendation:** Ensure all `toastService` or `uiState.showError` calls use `i18n` keys.

## 3. Security Audit

*   **Input Validation:** `PortfolioInputs` uses strict `numberInput` actions. Good.
*   **XSS:** `{@html}` is used in `PortfolioInputs` for an icon fallback. This is low risk as the source is likely static constants, but `dompurify` should be enforced if the icon source ever becomes dynamic.
*   **Secrets:** API Keys are handled via `settingsState`. `tradeService` signs requests locally or via server proxy? The code shows `signedRequest` sending keys in the body to `/api/orders`.
    *   *Note:* Sending API keys to the backend (even over HTTPS) means the backend *has* them. Ideally, signing should happen client-side if possible, or the backend should hold the keys (encrypted). Current architecture sends them per request.

## 4. Conclusion
The system is well-structured but requires targeted hardening of the Data Integrity layer (JSON parsing) and Resource Management (Subscription/Cache sync) to meet "Institutional Grade" standards.
