# Systematic Audit Report: Phase 1 (Status Quo)

**Date:** 2026-10-25
**Auditor:** Jules (System Architect)
**Scope:** Data Integrity, Resource Management, UI/UX, Security

## Executive Summary
The `cachy-app` codebase demonstrates a high level of maturity ("Institutional Grade") in core financial logic and resource management. Critical areas such as floating-point precision (`Decimal.js`), input validation (`Zod`), and memory leak prevention (LRU Caches, Subscription Caps) are handled robustly.

However, localized weaknesses exist in **Type Safety (API Integration)** and **Internationalization (i18n)**, which prevent the application from being fully "production-hardened".

### Risk Score: LOW-MEDIUM
*   **Financial Risk:** Low (Strong Decimal usage)
*   **Stability Risk:** Low (Good resource management)
*   **Maintainability/UX Risk:** Medium (Missing i18n, implicit `any` types)

---

## Findings

### 🔴 CRITICAL (0)
*   No immediate critical vulnerabilities causing financial loss or system crash were identified.

### 🟡 WARNING (3)
1.  **Implicit Type Casting in Trade Service**
    *   **Location:** `src/services/tradeService.ts` (`getPendingOrders`, `getHistoryOrders`)
    *   **Issue:** API responses are cast to `any` before mapping. While `formatApiNum` handles both strings and numbers, relying on `any` hides potential structure changes or precision loss if the API unexpectedly returns large native numbers that JS parses before we intercept them.
    *   **Recommendation:** Use strict `BitunixOrder` interfaces and validate incoming JSON structure before processing.

2.  **Incomplete Internationalization (i18n)**
    *   **Location:** `src/components/inputs/GeneralInputs.svelte`, `ApiQuotaStatus.svelte`, `CalculationSettings.svelte`
    *   **Issue:** Hardcoded strings (e.g., "Leverage", "Fees (%)", "Calls insgesamt") exist. This breaks the multi-language experience.
    *   **Recommendation:** Extract all hardcoded strings to `en.json` / `de.json` and use the `$t` or `$_` store.

3.  **Logic Flaw in Disclaimer Modal**
    *   **Location:** `src/components/shared/DisclaimerModal.svelte`
    *   **Issue:** The modal sets `visible = true` inside `onMount` via a `setTimeout` *unconditionally*. It does not check `settingsState.disclaimerAccepted` internally. If the parent component mounts it without checking the flag, it will reappear 4 seconds after every page load/refresh, annoying the user.
    *   **Recommendation:** Add a guard clause in `onMount`: `if (settingsState.disclaimerAccepted) return;`.

### 🔵 REFACTOR (2)
1.  **Refactor "Fast Path" Type Safety**
    *   **Location:** `src/services/bitunixWs.ts`
    *   **Issue:** The "Fast Path" optimization manually extracts fields (`d.fr`, `d.b`) from `any`-typed objects. While efficient, it is brittle.
    *   **Recommendation:** Create lightweight inline interfaces or type guards for the "Fast Path" data packets to ensure type safety without the overhead of full Zod parsing.

2.  **Centralize Market Data Numeric Conversion**
    *   **Location:** `src/services/marketWatcher.ts`
    *   **Issue:** Logic for converting API tickers to `Decimal` is slightly duplicated between `apiService` and `marketWatcher` logic (sometimes).
    *   **Recommendation:** Ensure `marketState` strictly accepts only `Decimal` and all conversion happens at the `apiService` boundary. (Currently mostly done, but verify edge cases).

---

## Next Steps (Phase 2 Plan)

1.  **Fix Disclaimer Logic:** Immediate UX fix.
2.  **Hardening Trade Service:** Replace `any` with strict `BitunixOrder` types in `tradeService.ts`.
3.  **Complete i18n:** Extract identified hardcoded strings.
4.  **Unit Test Check:** Add a test case for `DisclaimerModal` logic and `tradeService` parsing.
