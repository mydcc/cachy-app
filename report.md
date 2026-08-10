# Codebase Analysis Report: Cachy-App

This report presents a thorough analysis of the codebase, focusing on Data Integrity & Mapping, Resource Management & Performance, UI/UX & Accessibility, and Security & Validation. The findings are categorized by criticality: 🔴 CRITICAL, 🟡 WARNING, and 🔵 REFACTOR.

## 1. Data Integrity & Mapping

### Findings

*   **🔴 CRITICAL: Potential Null Access and Invalid Decimal Calculations**
    *   **Location:** `src/services/tradeService.ts`, `src/services/marketWatcher.ts`, and multiple other places.
    *   **Issue:** Some calculations assume a `Decimal` object is always present, but fallback defaults may not be safe. The codebase seems to mix string and Decimal values. E.g. `const currentPrice = marketState.data[symbol]?.lastPrice || new Decimal(0);` could result in inaccurate financial calculations if `lastPrice` is undefined. The use of `0` in a division or multiplication down the line can result in Infinity or NaN.
    *   **Recommendation:** Strictly validate price availability and implement circuit breakers. Enforce `Decimal` usage end-to-end.

## 2. Resource Management & Performance

### Findings

*   **🔴 CRITICAL: Memory Leaks (Unclosed Intervals)**
    *   **Location:** Across services such as `src/services/bitunixWs.ts`, `src/services/bitgetWs.ts`, `src/services/apiService.ts`, `src/services/fundingRateService.ts`.
    *   **Issue:** Many intervals (`setInterval`) are assigned to properties like `globalMonitorInterval` and `pingTimer`, but there's a risk they might not be correctly cleared upon unmounting or when WebSocket connections drop. This leads to memory leaks and unbounded zombie processes in a long-lived SPA or Node.js environment.
    *   **Recommendation:** Audit all `setInterval` usages and ensure `clearInterval` is reliably called in teardown, dispose, or `onDestroy` lifecycle hooks. Ensure `windowManager` or respective handlers manage cleanup.

*   **🟡 WARNING: Unbounded Growth in Caches**
    *   **Location:** `src/services/newsService.ts`
    *   **Issue:** Although there is an array limit (100 items), the underlying maps (e.g., `requests` in `MarketWatcher`, `pendingRequests`) could grow boundlessly if they are not periodically cleaned up when symbols are removed from the active subscription list.

## 3. UI/UX & Accessibility (A11y)

### Findings

*   **🟡 WARNING: Hardcoded Strings / Missing i18n**
    *   **Location:** Various UI components (e.g., `src/components/shared/JournalContent.svelte`, `src/components/settings/SettingsContent.svelte`).
    *   **Issue:** Some visible text snippets and tooltips bypass the translation file and are hardcoded in English, which breaks multi-language support.
    *   **Recommendation:** Audit UI files for raw text and map it to `$_('...')`.

*   **🟡 WARNING: Non-Actionable Error Messages**
    *   **Location:** Generic error catching in `TradeService`.
    *   **Issue:** API errors often just fall back to generic messages (e.g., "apiErrors.generic"). If a network drops or a 500 error occurs, users don't have a clear path to resolution.

## 4. Security & Validation

### Findings

*   **🔴 CRITICAL: Unsafe Direct DOM Manipulation (XSS)**
    *   **Location:** `src/components/shared/DisclaimerModal.svelte`, `src/lib/windows/implementations/DialogView.svelte`, `src/routes/+layout.svelte`.
    *   **Issue:** The use of Svelte's `{@html ...}` tag without strict sanitization across the board exposes the app to Cross-Site Scripting (XSS). Even though some paths use `DOMPurify.sanitize`, many places (e.g., SVG icon injections or markdown renders) do not, creating a potential attack vector if an external feed or API response contains malicious scripts.
    *   **Recommendation:** Ensure all uses of `{@html}` strictly wrap dynamic content with `DOMPurify.sanitize()`, or use an explicit trusted-HTML approach.

*   **🟡 WARNING: Missing Pre-Flight Validation**
    *   **Location:** Order Placement in `TradeService`.
    *   **Issue:** User inputs (e.g., `amount`) might bypass strict boundary validation before attempting API execution. Although the API validates it, the client should prevent the request if inputs are invalid to save rate limits and improve UX.

## Step 2: Implementation Plan

### Group 1: Security & Validation (CRITICAL)
- **Objective:** Fix all XSS vulnerabilities related to `{@html}` and ensure safe DOM manipulation.
- **Actions:**
  - Audit all `{@html}` tags.
  - Wrap any dynamic variables passed into `{@html}` with `DOMPurify.sanitize()` (imported from `DOMPurify`).
  - Strict input validation in `TradeService` before sending to the API.
- **Specific Test Cases:**
  - Add unit tests validating that malicious HTML strings (e.g., `<img src=x onerror=alert(1)>`) injected into `newsService` or `DialogView` are successfully neutralized by DOMPurify.

### Group 2: Data Integrity & Mapping (CRITICAL)
- **Objective:** Fix missing `Decimal` initializations and type safety errors.
- **Actions:**
  - Update `closePosition` in `TradeService` to strictly check for valid market state prices before defaulting to zero.
  - Fix `fillGaps` in `MarketWatcher` to cast parsed strings into `Decimal` instances before usage, rather than skipping.
- **Specific Test Cases:**
  - Mock a broken/missing market state where `lastPrice` is `undefined` and ensure it throws an error gracefully instead of submitting a `0` value order to the exchange.

### Group 3: Resource Management & Memory Leaks (CRITICAL)
- **Objective:** Prevent unclosed intervals and unbounded arrays.
- **Actions:**
  - Implement `clearInterval()` calls on all WebSocket classes (`bitunixWs`, `bitgetWs`, `apiService`) during connection close or component destruction lifecycle methods.
  - Implement strict bounds on internal Maps (e.g., in `MarketWatcher`).
- **Specific Test Cases:**
  - Write a unit test simulating WebSocket disconnects and verify that all related interval IDs (timers) are correctly cleared (using Jest/Vitest timer mocks).

### Group 4: UI/UX & A11y (WARNING)
- **Objective:** Enhance i18n and actionable errors.
- **Actions:**
  - Identify non-translated keys and implement them using the `$_('...')` dictionary approach.
  - Update `TradeService` to parse specific API error codes to provide distinct, actionable user messages instead of a generic "error".
- **Refactoring Justification:**
  - Improving error handling and memory leaks measurably improves performance and platform stability. Cosmetic refactoring will be deferred.
