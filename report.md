# In-depth Analysis & Status Report for cachy-app

## Status Quo & Findings

### 🔴 CRITICAL (Financial loss, crash, or security vulnerability)

1. **Missing Rollback on Optimistic State in `omsService`:**
   - No unconditional rollback of optimistic orders upon backend API failure in `omsService.ts` and `tradeService.ts`. Instead of rolling back on network errors or timeouts, they are left in an indeterminate `_isUnconfirmed` state which can lead to phantom data in the UI and financial inconsistencies.
2. **Missing Input Validation in API wrappers:**
   - Some external parameters lack strict validation with `Zod` before passing into API clients, leading to possible bad requests or logic errors.
3. **Leaking HTML into UI via Raw API Error Strings:**
   - Raw proxy HTML error pages could be exposed via UI toast messages (`e instanceof BitunixApiError && e.rawMessage`). This exposes the system to XSS if `rawMessage` containing `<html` is shown to the user, and leaks proxy implementation details. It needs checking and mapping to safe localized keys (`apiErrors.invalidResponse`).

### 🟡 WARNING (Performance issue, UX error, missing i18n)

1. **Improper Type Coercion / Precision Loss with Decimal.js:**
   - Downcasting Decimals to Javascript floats via `.toNumber()` was detected in `activeTechnicalsManager.svelte.ts` (lines 654, 666). This loses the precision needed for fintech applications and violates the strict decimal requirement.
2. **Missing I18n Keys & Hardcoded Strings:**
   - Hardcoded strings present in `TpSlList.svelte` (line 52), `TradeFlowBackground.svelte` (line 111) and `ThreeBackground.svelte` error logs.
3. **Unbounded Caches / Memory Leaks:**
   - Evictions from `Map`/`Set` often lack bounding. Certain loops iterate with `.keys().next().value` blindly. `syntheticSubs` and `pendingSubscriptions` maps might leak memory if not fully cleared in destroy methods.

### 🔵 REFACTOR (Code smell, technical debt)

1. **Timeout Types in TS:**
   - Variables that hold `setInterval`/`setTimeout` returns are not strongly typed using `ReturnType<typeof ...>`.
2. **Consistent Use of `Record<string, unknown>`:**
   - `any` is still sporadically used for generic objects. Replacing these enforces better type safety.

---

## Action Plan

### 1. Fix Optimistic UI Rollback (🔴 CRITICAL)
- **Justification:** Does this measurably improve stability or performance? Yes, it measurably improves stability by preventing desynchronization of the UI order state from the actual backend state, eliminating "phantom orders".
- **Specific Test Case:** Add a Vitest unit test in `tradeService.repro.test.ts` or similar that mocks an API failure (e.g. 500 error or network timeout) and asserts that `omsService.removeOrder(clientOrderId)` is unconditionally called.
- **Action:** Modify `tradeService.ts` and `omsService.ts` to unconditionally rollback (remove) the optimistic order from local state in the `catch` block on failure.

### 2. Sanitize API Error Output in `tradeService` / `errorUtils` (🔴 CRITICAL)
- **Justification:** Does this measurably improve stability or performance? Yes, improves security and stability by preventing potential XSS and preventing unparseable HTML from breaking UI components.
- **Specific Test Case:** Add a test case passing a mock error with `rawMessage: "<html>502 Bad Gateway</html>"` and assert it outputs the localized key `apiErrors.invalidResponse`.
- **Action:** Implement logic in `errorUtils.ts` or `tradeService.ts` to intercept `rawMessage` containing `<html` (e.g. `.toLowerCase().includes('<html')`) and safely map to `apiErrors.invalidResponse`. Ensure safe JSON parsing.

### 3. Hardening WebSocket & Memory Leaks (🟡 WARNING)
- **Justification:** Does this measurably improve stability or performance? Yes, prevents memory leaks in long-running clients which would eventually crash the tab or cause extreme latency.
- **Action:** Update `.clear()` logic in `destroy()` hooks of WebSocket services (e.g., `bitunixWs.ts`, `bitgetWs.ts`) to unconditionally clear `syntheticSubs` and `pendingSubscriptions` using `.clear()`. Use bounded eviction strategies (iterating via `.entries()`).

### 4. Remove Decimal `.toNumber()` downcasting (🟡 WARNING)
- **Justification:** Does this measurably improve stability or performance? Yes, prevents floating point inaccuracies during financial calculations which can lead to monetary loss.
- **Action:** Refactor `activeTechnicalsManager.svelte.ts` to strictly operate using `Decimal` operations, eliminating `.toNumber()`.

### 5. All i18n fixes (🟡 WARNING)
- **Justification:** Does this measurably improve stability or performance? Yes, improves A11y and UX for non-English speakers, reducing confusion during error states.
- **Action:** Replace hardcoded strings in components like `TpSlList.svelte` with translation function calls and ensure keys are in all translation files (`en.json`, `de.json`).
