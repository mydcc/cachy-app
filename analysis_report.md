# Codebase Analysis & Hardening Report

**Date:** 2026-05-23
**Role:** Senior Lead Developer & Systems Architect
**Scope:** Systematic maintenance & hardening (Zero Tolerance for Errors)

## Executive Summary

The codebase generally exhibits a high standard of engineering, utilizing Svelte 5 Runes, strict TypeScript, and `Decimal.js` for financial calculations. However, several critical vulnerabilities regarding data integrity (precision loss) and input validation (API & Storage) were identified. Addressing these is mandatory to meet "institutional grade" standards.

## Prioritized Findings

### 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1.  **Precision Loss Risk in `BitgetWebSocketService` (`src/services/bitgetWs.ts`)**
    *   **Finding:** Unlike `bitunixWs.ts`, the Bitget WebSocket implementation lacks regex-based pre-processing to quote large integers (e.g., order IDs > 2^53) or small floats before `JSON.parse`.
    *   **Impact:** Potential corruption of Order IDs or price data (e.g., `0.00000001` becoming `0`), leading to failed order cancellations or incorrect calculations.
    *   **Recommendation:** Implement the same regex-based string hardening used in `bitunixWs.ts`.

2.  **Unsafe Settings Loading (`src/stores/settings.svelte.ts`)**
    *   **Finding:** The `load()` method parses `localStorage` data directly using `JSON.parse` (wrapped in try/catch) but does **not** validate the schema using Zod.
    *   **Impact:** A corrupted or malicious `localStorage` entry (e.g., from a browser extension or crash) can inject invalid state, causing the app to crash on startup (White Screen of Death).
    *   **Recommendation:** Implement `SettingsStateSchema` (Zod) similar to `TradeStateSchema` in `trade.svelte.ts` to strictly validate and sanitize loaded data.

3.  **Missing Input Validation in Klines API (`src/routes/api/klines/+server.ts`)**
    *   **Finding:** Query parameters (`limit`, `start`, `end`) are parsed using `parseInt` without checking for `NaN`. These `NaN` values are then cast to strings ("NaN") and sent to upstream APIs.
    *   **Impact:** Upstream API errors (400 Bad Request) or undefined behavior.
    *   **Recommendation:** Implement Zod validation for query parameters and provide safe defaults.

4.  **Suspicious HTTP Method for Cancellations (`src/routes/api/orders/+server.ts`)**
    *   **Finding:** `cancelBitunixOrder` uses the `DELETE` HTTP method. While RESTful, most crypto exchanges (including Bitunix usually) require `POST` for signed actions to ensure payload integrity via signature.
    *   **Impact:** Order cancellation might fail if the exchange rejects `DELETE`.
    *   **Recommendation:** Verify Bitunix documentation and likely switch to `POST`.

### 🟡 WARNING (Performance issue, UX error, potential bug)

5.  **Performance Bottleneck in Market Store (`src/stores/market.svelte.ts`)**
    *   **Finding:** `applyUpdate` creates new `Decimal` instances even for unchanged values if the reference differs. `toString()` is called repeatedly for comparison. This runs on the "hot path" (4 FPS flush).
    *   **Impact:** High Garbage Collection (GC) pressure during high volatility, potentially causing UI stutter.
    *   **Recommendation:** Optimize `toDecimal` to check for strict equality first and optimize string comparisons.

6.  **Fragile Date Sorting in News Service (`src/services/newsService.ts`)**
    *   **Finding:** `newsItems.sort` uses `new Date(a.published_at).getTime()`.
    *   **Impact:** If an API provider sends a non-standard date format, `getTime()` returns `NaN`, resulting in unpredictable sorting order.
    *   **Recommendation:** Use a robust date parsing helper that defaults to `0` or `Date.now()` on failure.

7.  **Bitget Klines Structure Assumption (`src/routes/api/klines/+server.ts`)**
    *   **Finding:** `fetchBitgetKlines` assumes the response is always an array of arrays.
    *   **Impact:** If Bitget returns an error object (non-array), the code might throw unexpectedly or return empty data without logging the specific error code.
    *   **Recommendation:** stricter type guard for the response data.

### 🔵 REFACTOR (Code smell, maintainability)

8.  **Complex Synthetic Subscription Logic (`src/services/bitunixWs.ts`)**
    *   **Finding:** The logic for handling "synthetic" klines (aggregating 1m to 5m locally) is nested deeply within `handleMessage`.
    *   **Impact:** Hard to test and maintain.
    *   **Recommendation:** Extract synthetic kline logic into a dedicated method or class.

## Action Plan (Summary)

1.  **Harden WebSocket Parsing:** Apply regex protection to `bitgetWs.ts`.
2.  **Secure Store Loading:** Add Zod validation to `settings.svelte.ts`.
3.  **Validate API Inputs:** Add Zod schemas to `klines/+server.ts`.
4.  **Fix Order Cancellation:** Switch to `POST` for `cancelBitunixOrder`.
5.  **Performance Optimization:** Refactor `market.svelte.ts` Decimal handling.
