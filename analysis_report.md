# Status & Risk Report: Cachy Trading Platform

## 🔴 CRITICAL (Immediate Action Required)

### 1. Security: XSS Vulnerability in `CustomModal.svelte`
*   **Location:** `src/components/shared/CustomModal.svelte`
*   **Issue:** The component renders `{@html mState.message}` without sanitization. The `modalState` store does not sanitize input.
*   **Risk:** If an API error message or user input containing malicious scripts (e.g., `<img src=x onerror=alert(1)>`) is passed to the modal, it will execute arbitrary code in the user's browser.
*   **Recommendation:** Import `sanitizeHtml` from `src/utils/utils.ts` (or `DOMPurify`) and wrap the output: `{@html sanitizeHtml(mState.message)}`.

### 2. UI/UX: Missing Internationalization (i18n)
*   **Location:** `src/components/shared/CalculationDashboard.svelte` & `src/components/settings/CalculationSettings.svelte`
*   **Issue:** Entire UI sections are hardcoded in English (e.g., "Live Analysis Status", "Next Cycle In", "Recommendation").
*   **Risk:** inconsistent user experience for non-English users; violates "Institutional Grade" polish.
*   **Recommendation:** Extract all strings to `src/locales/locales/{en,de}.json` and use `$t()`.

## 🟡 WARNING (High Priority Fixes)

### 1. Data Integrity: Precision Loss Risk in WebSocket
*   **Location:** `src/services/bitunixWs.ts` (`mapToOMSPosition`)
*   **Issue:** `const amount = new Decimal(data.qty || 0)`. Since `data` comes from `JSON.parse()`, `qty` is already a native JavaScript number.
*   **Risk:** Extremely large or small quantities might lose precision *before* being converted to `Decimal`.
*   **Recommendation:** If possible, configure JSON parser to handle big numbers as strings, or treat critical fields as strings in the Zod schema/FastPath if the API supports it. (Acceptable for now as standard JSON behavior, but worth noting).

### 2. Resource Management: Persistent Event Listener
*   **Location:** `src/stores/settings.svelte.ts`
*   **Issue:** `window.addEventListener("storage", ...)` is attached in the constructor but never removed.
*   **Risk:** While `settingsState` is a singleton, this pattern creates memory leaks if the store is ever re-instantiated (e.g., during Hot Module Replacement or if architecture changes).
*   **Recommendation:** Add a `destroy()` method to `SettingsManager` or ensure it's strictly a singleton.

### 3. Data Integrity: Loose Error Checking
*   **Location:** `src/services/tradeService.ts`
*   **Issue:** `String(data.code) !== "0"`.
*   **Risk:** Relies on `code` being present. If the API returns a structure without `code` (e.g., 502 Bad Gateway HTML), this check might behave unexpectedly.
*   **Recommendation:** stricter type guards on API responses.

## 🔵 REFACTOR (Technical Debt)

*   **`ThreeBackground.svelte`**: Excellent cleanup logic observed. Use this as a template for other components using event listeners.
*   **`OrderHistoryList.svelte`**: Robust error handling (`$_` fallback) observed. This pattern should be standardized across all components.
*   **`MarketWatcher.ts`**: Complex ref-counting (`requests` map). Consider simplifying with Svelte 5 `$effect.tracking` if possible in future refactors.

## Summary
The codebase is generally robust with strong architectural decisions (Decimal.js usage, Zod validation, Svelte 5 Runes). The identified XSS vulnerability and i18n gaps are the primary blockers for an "Institutional Grade" release.
