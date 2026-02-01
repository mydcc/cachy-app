# Status Report: Real-Time Data Flow & Hardening Analysis

**Date:** 2026-02-01
**Version:** 1.0.0
**Target:** Institutional Grade Hardening

## Executive Summary

A comprehensive analysis of the cachy-app codebase has been performed to assess the integrity, performance, and reliability of the real-time data flow. The system utilizes a hybrid architecture combining WebSocket (primary) and REST Polling (fallback/gap-filling).

**Overall Status:** **STABLE** (with identified areas for hardening)

## 1. Data Integrity & Mapping

### Type Safety & Validation
*   **Status:** Good. Zod schemas (`BitunixWSMessageSchema`, `BitunixTickerDataSchema`, etc.) are used effectively for runtime validation of API responses.
*   **Observation:** The `safeJsonParse` utility is correctly implemented to prevent precision loss for large integers (order IDs) before Zod validation occurs.
*   **Risk:** `BitunixWebSocketService` uses a "Fast Path" optimization that bypasses Zod for performance. While guarded with `try-catch` and type guards (`isPriceData`), this logic duplicates validation rules.
    *   **Recommendation:** Ensure "Fast Path" type guards are strictly synchronized with Zod schemas.

### Decimal Precision
*   **Status:** Excellent. `Decimal.js` is used consistently for all financial calculations in `tradeService`, `omsService`, and `marketState`.
*   **Observation:** `market.svelte.ts` includes an optimization (`toDecimal`) that reuses existing Decimal instances if values match. This is efficient but relies on string comparison.
    *   **Hardening:** `mdaService` explicitly casts all incoming raw values to String before Decimal conversion, preventing implicit float corruption.

### Data Flow & Consistency
*   **WebSocket vs REST:** `marketWatcher.ts` effectively orchestrates subscriptions. It subscribes to both "ticker" (Last Price, Vol) and "price" (Mark Price, Funding) channels.
*   **Flickering Fix:** Recent changes in `bitunixWs.ts` prevent the "price" channel (Mark Price) from overwriting `lastPrice` (Ticker Price), resolving UI flickering.
*   **Mapping:** `mappers.ts` centralizes logic for converting raw API objects to internal OMS types (`OMSPosition`, `OMSOrder`). This reduces code duplication and ensures consistent field mapping.

## 2. Resource Management & Performance

### Connection Lifecycle
*   **Status:** Robust. `connectionManager.ts` handles provider switching atomicially. `bitunixWs.ts` implements a singleton pattern with zombie instance detection.
*   **Reconnection:** Exponential backoff strategies are implemented for both Public and Private sockets.
*   **Memory Leaks:** `marketWatcher.ts` uses `staggerTimeouts` and `pendingRequests` maps to manage concurrency. `marketState` implements an LRU cache (`settingsState.marketCacheSize`) to evict stale symbols.

### WebSocket Subscriptions
*   **Hybrid Sync:** `marketWatcher.ts` periodically (`syncSubscriptions`) reconciles the *intended* state (requests map) with the *actual* socket subscriptions (`pendingSubscriptions`). This is a self-healing mechanism.
*   **Risk:** If `unregister` is called rapidly, the debounce logic in `app.ts` (`symbolDebounceTimer`) might cause temporary race conditions where a subscription is removed and immediately re-added.
    *   **Mitigation:** The current debounce (500ms) and lock-based deduplication in `marketWatcher` mitigates this effectively.

## 3. Vulnerability Assessment (Worst Case Scenarios)

| Scenario | Handling | Status |
| :--- | :--- | :--- |
| **API Down / 5xx** | `requestManager` implements retries (except for 404s). `marketWatcher` handles polling errors gracefully without crashing the loop. | **SECURE** |
| **Socket Disconnect** | `bitunixWs` attempts reconnect with backoff. `marketWatcher` detects gap/staleness and falls back to REST polling. | **SECURE** |
| **Corrupt JSON** | `safeJsonParse` and `try-catch` blocks wrap all message handling. Zod validation catches schema mismatches. | **SECURE** |
| **Numeric Overflow** | `safeJsonParse` regex protects 15+ digit integers. `mapToOMSOrder` checks for `MAX_SAFE_INTEGER`. | **SECURE** |
| **Zombie Subs** | `marketWatcher` cleans up subscriptions when ref count drops to zero. `connectionManager` kills providers on switch. | **SECURE** |

## 4. Recommendations for Institutional Grade

1.  **Strict "Fast Path" Type Guards:**
    The `isPriceData` and `isTickerData` functions in `bitunixWs.ts` are manually maintained. Generating these from Zod schemas or using a strict type-guard generator would reduce maintenance risk.

2.  **Telemetry & Alerting:**
    The `marketState.telemetry` object tracks latency. For "Institutional Grade", this should be emitted to an external monitoring service (e.g., New Relic, Datadog) to alert on latency spikes or high error rates.

3.  **Redundant Data Sources:**
    Currently, the system relies heavily on a single provider (Bitunix or Bitget). Institutional systems often run dual-feeds and arbitrate the "best" price locally. The current architecture allows switching but not simultaneous aggregation.

4.  **Audit Logs:**
    Critical actions (Trade Execution) are logged to console. A persistent audit log (IndexedDB or Server-Side) for all trade attempts (successful or failed) is recommended for compliance.

## Conclusion

The codebase is in a mature state with strong defensive programming practices. The recent fixes to WebSocket data flow have stabilized the real-time layer. No critical vulnerabilities were found in the data mapping or integrity layers.
