# Analysis Report: Systematic Maintenance & Hardening (Phase 1)

**Date:** 2026-05-26
**Author:** Jules (Senior Lead Developer & Systems Architect)
**Target:** cachy-app Codebase

## Executive Summary

The codebase generally exhibits a high level of sophistication regarding performance (WebSockets, data buffering, SoA) and defensive programming (Zombie loop protection, Safe JSON parsing). However, **Critical Data Integrity Risks** were identified in the Order Management UI (`TpSlEditModal`), which bypasses established service layers and standards.

---

## 🔴 CRITICAL (Immediate Action Required)

### 1. Data Integrity & Code Duplication in `TpSlEditModal.svelte`
*   **Location:** `src/components/shared/TpSlEditModal.svelte`
*   **Risk:** Financial Loss / Data Corruption / Precision Loss.
*   **Findings:**
    *   **Bypasses Service Layer:** Directly calls `fetch("/api/tpsl")` instead of using `tradeService`.
    *   **Precision Loss Risk:** Uses `JSON.stringify` directly on the body. Large numbers (prices/quantities) are NOT safely serialized (no `Decimal.toString()` conversion), which relies on native JS `number` serialization. This can truncate high-precision crypto values.
    *   **Security/Maintenance:** Duplicates API key retrieval logic (`settingsState.apiKeys...`). Changes to authentication logic in `TradeService` would not be reflected here.
    *   **Hardcoded Strings:** UI contains hardcoded English strings ("Trigger Price", "Amount", "Save"), violating i18n standards.
*   **Recommendation:** Refactor immediately to use `tradeService.modifyTpSlOrder()` (to be created if missing) or existing methods, ensuring all `Decimal` inputs are serialized correctly.

### 2. Potential Precision Loss in WebSocket Fast Path (Conditional)
*   **Location:** `src/services/bitunixWs.ts`
*   **Risk:** Data Integrity.
*   **Findings:**
    *   The "Fast Path" optimization (`switch (channel)`) executes *after* parsing.
    *   While `safeJsonParse` is used (which correctly wraps large numbers in strings), the Fast Path logic relies on `typeof data.ip === 'number'`.
    *   **Risk:** If `safeJsonParse` regex fails to catch a specific number format (e.g. scientific notation variations or edge cases), the number enters the Fast Path as a native `number` with precision already lost.
*   **Recommendation:** Add a unit test suite specifically for `safeJsonParse` with edge-case heavy JSONs from the exchange to guarantee the "Fast Path" never receives a truncated number.

---

## 🟡 WARNING (High Priority)

### 1. Hardcoded Strings (i18n)
*   **Location:** `src/components/shared/TpSlEditModal.svelte`, `src/components/shared/MarketOverview.svelte` (partial), and potentially other Modals.
*   **Risk:** UX / Accessibility.
*   **Findings:**
    *   `TpSlEditModal`: "Trigger Price", "Amount (Qty)", "Cancel", "Save".
    *   `MarketOverview`: "--:--:--" (Countdown fallback).
*   **Recommendation:** Move all UI strings to `src/locales/` and use the `$_` store.

### 2. WebSocket Validation Bypass
*   **Location:** `src/services/bitunixWs.ts`
*   **Risk:** Stability.
*   **Findings:**
    *   The "Fast Path" bypasses Zod validation for performance.
    *   If Bitunix API changes its structure (e.g., `data.b` becomes `data.bids`), the manual checks might throw runtime errors or silently fail, whereas Zod would provide a structured error.
*   **Recommendation:** Ensure `try-catch` blocks around the Fast Path are robust and fall back to the standard Zod validation path if an error occurs (currently implemented, but needs verification via tests).

### 3. News Proxy Cache Logic
*   **Location:** `src/routes/api/external/news/+server.ts`
*   **Risk:** Resource Management.
*   **Findings:**
    *   Uses a global `_newsCache` (Map) with a simple size limit.
    *   The eviction policy (`_newsCache.keys().next().value`) removes the *insertion order* oldest, not the *access order* LRU (unless keys are re-inserted on access, which they are).
    *   **Verification:** `_newsCache.delete(cacheKey); _newsCache.set(cacheKey, cached);` is present, so it IS a valid LRU.
    *   **Issue:** Cache key contains `apiKey`. If `apiKey` is user-specific, this cache is ineffective across users. If it's a platform key, it's fine.
*   **Recommendation:** Verify API Key strategy.

---

## 🔵 REFACTOR (Technical Debt)

### 1. `TradeService` Error Handling
*   **Location:** `src/services/tradeService.ts`
*   **Finding:** The service throws a mix of `BitunixApiError`, `TradeError`, and generic `Error`.
*   **Recommendation:** Standardize to a single error class hierarchy for easier handling in the UI.

### 2. `MarketManager` Telemetry
*   **Location:** `src/stores/market.svelte.ts`
*   **Finding:** Telemetry logic is mixed with business logic.
*   **Recommendation:** Extract telemetry to a decorator or separate service to keep `MarketManager` clean.

---

## Next Steps (Plan)

1.  **Refactor `TpSlEditModal`**: Move logic to `TradeService`, implement i18n.
2.  **Verify `safeJsonParse`**: Add regression tests.
3.  **Scan & Fix i18n**: Global grep for hardcoded strings.
