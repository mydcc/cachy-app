# Status & Risk Report (Hardening Phase)

**Date:** 20.02.2026
**Author:** Jules (Senior Lead Developer & Systems Architect)
**Status:** DRAFT (Analysis Complete)

This report details the current status of the `cachy-app` codebase following an in-depth forensic audit. It highlights critical risks to data integrity and stability, as well as confirming recent fixes.

---

## 🔴 CRITICAL RISKS (Immediate Action Required)

### 1. Data Integrity: Precision Loss in `BitunixWs` ("Fast Path")
*   **Location:** `src/services/bitunixWs.ts` (lines ~350-485)
*   **Issue:** The "Fast Path" optimization manually casts numeric fields to strings (`String(data.ip)`). While `safeJsonParse` is used upstream to wrap large integers, any floating-point number that passes through `JSON.parse` as a native number (because it fits in 64-bit float) is then cast to string here.
*   **Risk:** Intermediate precision loss for small floats or edge cases where `safeJsonParse` regex might miss. For a financial application, we must guarantee that *what the API sends* is *exactly* what we use. Relying on `String(number)` is unsafe for high-precision crypto assets (e.g., 8-18 decimals).
*   **Recommendation:**
    *   **Option A:** Modify `safeJsonParse` to force-wrap *all* values for specific keys ("price", "amount", "ip", "fr") regardless of length.
    *   **Option B (Preferred):** Remove the manual casting in `BitunixWs` and rely strictly on Zod with a custom pre-processor that rejects numbers for these fields (forcing upstream fix in `safeJsonParse`).

### 2. Performance: GC Thrashing in `MarketManager`
*   **Location:** `src/stores/market.svelte.ts` & `src/utils/bufferPool.ts`
*   **Issue:** `BufferPool` only recycles arrays of the *exact* same length. `MarketManager` frequently changes array sizes (pushing new candles, splicing old ones) by 1 element at a time.
*   **Consequence:** The pool is ineffective during normal operation (ramp-up or minor fluctuations). This causes high Garbage Collection (GC) pressure as thousands of `Float64Array`s are allocated and discarded every few seconds.
*   **Recommendation:** Refactor `BufferPool` to use "bucketing" (e.g., powers of 2 or fixed block sizes) and update `MarketManager` to track `usedLength` separate from buffer capacity.

---

## ✅ VERIFIED FIXES (Since Last Audit)

The following issues previously identified in `STATUS_AND_RISK_REPORT_FINAL.md` have been **RESOLVED**:

1.  **PortfolioInputs Validation Crash:**
    *   **Location:** `src/components/inputs/PortfolioInputs.svelte`
    *   **Status:** `validateInput` now explicitly returns `"0"` for empty strings, preventing `Decimal` constructor crashes in `TradeService`.

2.  **NewsService Crash:**
    *   **Location:** `src/services/newsService.ts`
    *   **Status:** `generateNewsId` now checks `typeof item.url === 'string'` and `typeof item.title === 'string'` before processing, preventing crashes on malformed API data.

3.  **Missing I18n Keys:**
    *   **Location:** `src/locales/locales/en.json` & `src/utils/errorUtils.ts`
    *   **Status:** Keys like `settings.errors.invalidApiKey` exist in the locale file and are correctly mapped in `errorUtils.ts`.

---

## 🟡 WARNINGS (Monitoring Required)

### 1. `safeJsonParse` Scope
*   **Location:** `src/utils/safeJson.ts`
*   **Observation:** The regex `\d[\d.eE+-]{14,}` only protects numbers with 15+ characters.
*   **Risk:** A number like `0.00000001` (1e-8) is 10 chars. `JSON.parse` handles it fine *usually*, but `0.1 + 0.2` style float errors can accumulate if calculations happen before storage.
*   **Mitigation:** Ensure no calculations happen on these numbers before they are converted to `Decimal`. `BitunixWs` casts them to string immediately, which is "okay" but not "institutional grade" safe.

---

## 🔵 REFACTOR OPPORTUNITIES

1.  **`OfflineBanner` Usage:**
    *   Confirm consistent usage of `OfflineBanner` across all main layouts to ensure user is aware of broken state. (Currently handled via `marketState.connectionStatus` in `Header`).

2.  **Icon Component:**
    *   `PortfolioInputs.svelte` uses inline SVGs for the lock icon. Should be replaced with `<Icon />` for consistency and cacheability.

---

**Next Steps (Phase 2):**
1.  Implement `BufferPool` bucketing logic.
2.  Refactor `MarketManager` to use `capacity` vs `length`.
3.  Harden `safeJsonParse` or `BitunixWs` to eliminate `String(number)` casting for prices.
