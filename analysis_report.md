# Status & Risk Report: cachy-app Hardening

## 1. Executive Summary
The codebase exhibits a robust architecture leveraging Svelte 5, Zod for validation, and Decimal.js for financial precision. Key services (`tradeService`, `marketWatcher`) implement defensive patterns (e.g., optimistic updates, zombie pruning). However, critical risks remain in concurrency management (potential race conditions in request counting) and resource management (WebSocket listener leaks). Internationalization (i18n) is incomplete in the SEO layout.

## 2. Findings (Prioritized)

### 🔴 CRITICAL (Immediate Action Required)

1.  **Concurrency Race Condition in `MarketWatcher` (`src/services/marketWatcher.ts`)**
    *   **Problem:** `pruneZombieRequests` forcibly removes "stuck" requests (>20s) and decrements `inFlight`. However, if the original request eventually completes (e.g., at 21s), the `finally` block in `pollSymbolChannel` decrements `inFlight` *again*.
    *   **Risk:** `inFlight` count becomes inaccurate (lower than reality), causing the scheduler to spawn more concurrent requests than the `maxConcurrentPolls` limit (6). This significantly increases the risk of API Rate Limit bans (429 Too Many Requests).
    *   **Recommendation:** Implement a set of `prunedRequestIds` to prevent double-decrementing in the `finally` block.

2.  **Potential Memory Leak in `BitunixWebSocketService` (`src/services/bitunixWs.ts`)**
    *   **Problem:** `tradeListeners` uses a `Map<string, Set<Function>>`. While `subscribeTrade` returns a cleanup function, there is no safeguard if a consumer component fails to call it (e.g., during ungraceful unmounts or HMR updates).
    *   **Risk:** Accumulation of stale listeners prevents garbage collection of closures, leading to memory leaks over time.
    *   **Recommendation:** Use `WeakRef` or a more robust subscription manager that ties listeners to component lifecycles (or simply ensure `onDestroy` is strictly used).

### 🟡 WARNING (High Priority Fixes)

3.  **Hardcoded Strings in Layout (`src/routes/[[lang]]/(seo)/+layout.svelte`)**
    *   **Problem:** Strings like "Academy", "Launch App", "Deepwiki" are hardcoded or use a local `dict` object instead of the global `svelte-i18n` store.
    *   **Risk:** Inconsistent user experience for non-English users; maintenance burden.
    *   **Recommendation:** Extract all strings to `src/locales/locales/{en,de}.json` and use the `$t` (or `$_`) helper.

4.  **Silent Failure in Gap Filling (`src/services/marketWatcher.ts`)**
    *   **Problem:** `fillGaps` limits filling to 5000 candles. If a gap is larger, it logs a warning but leaves the data discontinuous.
    *   **Risk:** Technical indicators (MA, RSI) may produce incorrect values due to time jumps.
    *   **Recommendation:** Throw a specific error or trigger a "Hard Reset" (fetch fresh history) if the gap exceeds the safe limit.

5.  **Optimistic Order Cancellation Risk (`src/services/tradeService.ts`)**
    *   **Problem:** `flashClosePosition` attempts to `cancelAllOrders` before closing. If cancellation fails, it catches the error and proceeds.
    *   **Risk:** While this prioritizes closing the position (safety), it may leave "Naked Stop Losses" open if the close succeeds but the cancel failed.
    *   **Recommendation:** Ensure the UI displays a persistent "Check Open Orders" warning if this specific catch block is triggered.

### 🔵 REFACTOR (Technical Debt)

6.  **Complex Type Handling in `apiService.ts`**
    *   **Problem:** `fetchBitunixKlines` contains complex logic to handle `Decimal` vs `number` and synthetic aggregation.
    *   **Recommendation:** Extract synthetic aggregation logic to a dedicated helper/service (`TimeframeUtils`) to improve readability and testability.

## 3. Next Steps (Action Plan Phase 2)

The implementation plan will focus on:
1.  **Stability:** Fix the `MarketWatcher` race condition and `BitunixWebSocket` listener management.
2.  **i18n:** Full extraction of strings in SEO layout.
3.  **Verification:** Add regression tests for the concurrency fix.
