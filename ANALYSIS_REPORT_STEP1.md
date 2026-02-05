# Analysis Report & Hardening Plan (Step 1)

**Date:** 2026-05-26
**Auditor:** Jules (Senior Lead Developer)
**Status:** 🔴 CRITICAL ISSUES FOUND

## 1. Executive Summary
The codebase is generally well-structured with modern Svelte 5 patterns. However, there are **critical vulnerabilities** related to data persistence and floating-point arithmetic that pose a risk of financial data corruption. specifically regarding the handling of 64-bit integers (IDs) and large arrays in `localStorage`.

## 2. Prioritized Findings

### 🔴 CRITICAL (Risk of Data Loss / Crash)

1.  **Unsafe `JSON.parse` Usage (Precision Loss)**
    *   **Location:** `src/services/app.ts`, `src/stores/journal.svelte.ts`, `src/stores/preset.svelte.ts`, `src/routes/api/orders/+server.ts`.
    *   **Issue:** Native `JSON.parse` is used to load `journal`, `presets`, and API responses. JavaScript's `number` type cannot safely represent integers larger than $2^{53}-1$ (approx 9 quadrillion). Exchange Order IDs (often 19 digits) will be rounded, causing "Position Not Found" errors or wrong order cancellations.
    *   **Evidence:** `src/services/app.ts` -> `const parsedData = JSON.parse(d);`
    *   **Remediation:** Replace all instances with `safeJsonParse` (from `src/utils/safeJson.ts`) which wraps large numbers in strings.

2.  **Unbounded LocalStorage Loading (Memory/Crash Risk)**
    *   **Location:** `src/stores/journal.svelte.ts`.
    *   **Issue:** The `load()` method reads the entire journal from `localStorage` and parses it. If the journal grows (e.g., 10k trades), this will block the main thread during startup (TBT) and potentially cause an OOM crash.
    *   **Evidence:** `const d = localStorage.getItem(...) || "[]"; this.entries = JSON.parse(d);`
    *   **Remediation:** Implement pagination or a "Load More" strategy. Enforce a hard limit (e.g., 1000 latest trades) for the initial load.

### 🟡 WARNING (UX / Stability)

3.  **Floating Point Math in UI Inputs**
    *   **Location:** `src/components/inputs/TradeSetupInputs.svelte`.
    *   **Issue:** `atrMultiplier` uses `parseFloat`. While usually small, floating point artifacts (e.g., `1.2` becoming `1.200000000002`) can confuse users or APIs.
    *   **Remediation:** Enforce `Decimal` usage or strict string sanitization for all numeric inputs.

4.  **Incomplete i18n (Hardcoded Strings)**
    *   **Location:** `src/components/shared/MarketOverview.svelte`.
    *   **Issue:** Hardcoded strings like "RSI" and "Channel" found in templates/logic.
    *   **Remediation:** Extract to `en.json`.

5.  **Bitunix "Fast Path" Type Looseness**
    *   **Location:** `src/services/bitunixWs.ts`.
    *   **Issue:** The `isPriceData` and `isTickerData` type guards use permissive checks (`isSafe`) that allow `number` types to pass through to `marketState`. While `marketState` handles conversion, passing raw numbers risks precision loss *before* they reach the state if they are large IDs (though prices are usually fine).
    *   **Remediation:** Harden the type guards to warn more aggressively if non-string financial data is detected.

### 🔵 REFACTOR (Maintainability)

6.  **Redundant Code in `app.ts`**
    *   **Issue:** `app.ts` contains mixed logic for UI state, trading, and storage.
    *   **Remediation:** Move storage logic strictly to services.

---

## 3. Step 2: Implementation Action Plan

### **Group A: Data Integrity (CRITICAL)**
*   [ ] **Refactor `app.ts`**: Replace `JSON.parse` with `safeJsonParse` for Presets.
*   [ ] **Refactor `journal.svelte.ts`**: Replace `JSON.parse` with `safeJsonParse` and add array slicing (limit 1000) on load.
*   [ ] **Refactor `api/orders/+server.ts`**: Ensure API error parsing uses `safeJsonParse`.
*   [ ] **Test**: Create a reproduction test case where a 19-digit ID is saved/loaded to verify precision preservation.

### **Group B: Hardening & Performance (WARNING)**
*   [ ] **Harden `TradeSetupInputs.svelte`**: Replace `parseFloat` with `Decimal` logic for multipliers.
*   [ ] **Harden `bitunixWs.ts`**: Add telemetry log if numeric IDs are detected in "Fast Path".
*   [ ] **Sanitize `MarketOverview.svelte`**: Extract "RSI", "Channel" to locale files.

### **Group C: Security & Verification**
*   [ ] **Audit `@html`**: Verify all SVG icons are from trusted constants.

### **Test Plan for Fixes**
1.  **Unit Test (`src/utils/tests/safeJson.test.ts`)**: Verify `safeJsonParse` correctly handles `"id": 18446744073709551615`.
2.  **Integration Test**: Simulate a huge `localStorage` journal and ensure app boots without lag.
