# Status & Risk Report: Cachy App Deep Dive Analysis

**Date:** 2026-03-03
**Scope:** `cachy-app` (Trading Platform)
**Author:** Jules (Senior Lead Developer)

## 1. Executive Summary

1.  **WebSocket Subscription Leak (`src/services/bitunixWs.ts`)**
    *   **Finding:** The `BitunixWebSocketService` uses a simple `Set<string>` for `pendingSubscriptions` and lacks reference counting. If multiple components (e.g., `MarketWatcher` and a UI component) subscribe to the same channel (e.g., `BTCUSDT:ticker`) and one unsubscribes, the underlying WebSocket subscription is sent a `unsubscribe` command immediately. This causes data loss for the remaining components.
    *   **Risk:** Critical data loss (price updates, order updates) in the UI or trading logic if components mount/unmount dynamically.
    *   **Recommendation:** Implement `Map<string, number>` for reference counting. Only send `subscribe` on 0->1 transition and `unsubscribe` on 1->0 transition.

2.  **Memory Spike in Market Store (`src/stores/market.svelte.ts`)**
    *   **Finding:** The `applySymbolKlines` method performs a "Slow Path" merge for historical data where it concatenates existing history with new data *before* slicing to the limit. For large datasets (e.g., 10k candles), this temporarily doubles memory usage for the array, causing GC pressure and potential UI jank on mobile devices.
    *   **Risk:** Performance degradation or crash (OOM) during heavy volatility or when loading long histories.
    *   **Recommendation:** Optimize the merge strategy to slice *during* the merge or use a pre-allocated buffer approach to avoid temporary large array allocation.

3.  **JSON Precision Loss / BigInt Safety (`src/services/bitunixWs.ts`, `src/services/tradeService.ts`)**
    *   **Finding:** The application uses `safeJsonParse` which relies on the native `JSON.parse`. JavaScript's `number` type loses precision for integers greater than `2^53 - 1`. If Bitunix sends Order IDs or other identifiers as large numbers (instead of strings), they will be corrupted *before* any Zod validation or string casting can happen.
    *   **Risk:** Corrupted Order IDs could lead to inability to cancel orders or incorrect trade execution.
    *   **Recommendation:** Verify API behavior. If large integers are possible, implement a custom JSON parser (like `json-bigint` or regex pre-processing) for critical ID fields, or strictly enforce string types at the API contract level (if possible). *Mitigation:* The code currently logs a warning if it detects a number, but this is post-facto.

### 🔴 CRITICAL (Risk of financial loss, crash, or data corruption)

1.  **Partial Internationalization & Hardcoded Strings (`src/components/shared/OrderHistoryList.svelte`)**
    *   **Finding:**
        *   Order Types (e.g., "FOK", "IOC") fall back to raw strings if not explicitly mapped.
        *   Date formatting is hardcoded (`DD.MM HH:mm`) and not locale-aware.
        *   Fallback text "Load More" is hardcoded in the template logic.
    *   **Risk:** Alienation of non-English users and potential confusion with raw API enum values.
    *   **Recommendation:** Use `Intl.DateTimeFormat` for dates. Add all known Order Types to `en.json`. Use strict translation keys.

2.  **Unbounded Recursion Risk (`src/services/tradeService.ts`)**
    *   **Finding:** The `serializePayload` method recursively traverses objects to convert `Decimal` to string. It lacks a depth limit or circular reference detection.
    *   **Risk:** Stack overflow if a circular object is accidentally passed (e.g., a Vue/Svelte reactive object with parent refs).
    *   **Recommendation:** Add a `WeakSet` for visited objects or a simple depth limit (e.g., 10 levels).

3.  **Hardcoded Rate Limits (`src/services/marketWatcher.ts`)**
    *   **Finding:** `ensureHistory` limits backfilling to ~10k candles (10 batches).
    *   **Risk:** Incomplete chart history for higher timeframes or long-term analysis.
    *   **Recommendation:** Make the limit configurable or dynamic based on the requested range/timeframe.

### 🟡 WARNING (Performance, UX, i18n)

1.  **Error Handling Consistency**
    *   **Finding:** `TradeService` throws both `BitunixApiError` and generic `Error`.
    *   **Recommendation:** Standardize on `TradeError` or `BitunixApiError` for all trade-related failures to simplify upstream error handling.

2.  **Duplicated Type Guards**
    *   **Finding:** `bitunixWs.ts` manually implements `isPriceData` etc., which duplicates logic found in Zod schemas (though done for performance).
    *   **Recommendation:** Ensure these stay in sync with Zod schemas via shared type definitions or comments.

## 2. Implementation Plan

1.  **Harden WebSocket Service:** Implement ref-counting for subscriptions.
2.  **Optimize Market Store:** Refactor `applySymbolKlines` for memory efficiency.
3.  **Fix i18n:** Update `OrderHistoryList` and `en.json`.
4.  **Harden TradeService:** Add recursion protection and standardization.
