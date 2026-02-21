# Analysis Report: Cachy Trading Platform
**Date:** 2026-05-25
**Auditor:** Jules (System Architect)

## 1. Executive Summary
The codebase demonstrates a high level of maturity with advanced features like `BufferPool` for memory management, Zod schemas for validation, and `Decimal.js` for precision. However, critical hardening is required in WebSocket data parsing (Bitget) and localization consistency.

## 2. Findings

### 🔴 CRITICAL (Risk of Loss / Crash / Integrity)

1.  **WebSocket Precision Risk (Bitget):**
    *   **File:** `src/services/bitgetWs.ts`
    *   **Issue:** Unlike `bitunixWs.ts`, the Bitget implementation lacks a "Fast Path" regex pre-processor to strictly wrap numeric fields (IDs, Price, Vol) in quotes before JSON parsing.
    *   **Risk:** If Bitget sends 19-digit integer IDs or high-precision floats as raw numbers, `JSON.parse` will truncate them before `safeJsonParse`'s heuristic (>=15 chars) can act, potentially corrupting Order IDs or prices.
    *   **Recommendation:** Port the regex-based "Fast Path" logic from `bitunixWs.ts` to `bitgetWs.ts`.

2.  **Trade Service Sorting Logic:**
    *   **File:** `src/services/tradeService.ts`
    *   **Issue:** `fetchTpSlOrders` sorts using `b.ctime - a.ctime`.
    *   **Risk:** If `ctime` is a large numeric string (likely for timestamps in nanoseconds or from some APIs), subtraction implicitly casts to `number`. While safe for standard milliseconds (up to year 280,000), it is a dangerous pattern for IDs or high-precision timestamps.
    *   **Recommendation:** Use `Decimal.sub` or `String.localeCompare` logic for sorting to be strictly safe.

### 🟡 WARNING (Performance / UX / i18n)

3.  **Incomplete Localization (Error Codes):**
    *   **File:** `src/locales/locales/de.json`
    *   **Issue:** The `bitunixErrors` section maps numeric codes to English strings (e.g., "Network Error").
    *   **Impact:** German users receive technical English error messages.
    *   **Recommendation:** Translate all values in `bitunixErrors` to German.

4.  **Hardcoded Backend Errors:**
    *   **Files:** `src/routes/api/account/+server.ts`, `src/routes/api/balance/+server.ts`
    *   **Issue:** Errors like `throw new Error("No account data found")` are hardcoded in English.
    *   **Impact:** These strings propagate to the UI toast notifications, breaking immersion for non-English users.
    *   **Recommendation:** Throw standardized error objects with codes (e.g., `throw new Error("apiErrors.noAccountData")`) and translate in the frontend.

5.  **Weak Query Validation (Klines):**
    *   **File:** `src/routes/api/klines/+server.ts`
    *   **Issue:** Uses `parseInt` and manual string construction for API calls instead of Zod validation.
    *   **Risk:** Low security risk (read-only), but poor maintainability and robustness compared to `api/orders`.
    *   **Recommendation:** Implement `KlineRequestSchema` using Zod.

### 🔵 REFACTOR (Maintainability / Optimization)

6.  **Heuristic Time Parsing:**
    *   **File:** `src/stores/market.svelte.ts`
    *   **Issue:** `nextFundingTime` parsing guesses between seconds and milliseconds based on magnitude (`nft < 10000000000`).
    *   **Recommendation:** Standardize API responses at the `mappers.ts` level to always return milliseconds, removing ambiguity in the store.

7.  **Unused / Redundant Logic in MarketWatcher:**
    *   **File:** `src/services/marketWatcher.ts`
    *   **Issue:** `fillGaps` creates new `Kline` objects with `volume: ZERO_VOL`. While safe, this allocation in a hot path could be optimized further if `BufferPool` was used directly here.

## 3. Next Steps (Phase 2 Plan)

1.  **Hardening:** Implement Regex Fast Path in `bitgetWs.ts`.
2.  **i18n:** Translate `bitunixErrors` in `de.json` and refactor backend errors to use keys.
3.  **Safety:** Refactor `tradeService` sorting and `api/klines` validation.
