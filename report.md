# In-depth Analysis & Report: Cachy-App Status Quo

## Data Integrity & Mapping

🔴 **CRITICAL: Type Safety & `Decimal.js` Inconsistencies**
* **Finding:** While `Decimal.js` is extensively used to prevent precision loss in numerical values, there are several locations where native JavaScript numbers are utilized, particularly via `Number()` coercions and `toNumber()` function calls.
    * In `src/services/mdaService.ts`, `src/services/mappers.ts`, and `src/services/bitunixWs.ts`, timestamps and sometimes numeric fields are converted to JS Numbers (`Number(...)`).
    * In `src/services/activeTechnicalsManager.svelte.ts`, the `priceNum` calculation casts Decimals back to floats via `price.toNumber()`. This breaks the end-to-end Decimal pipeline and risks precision loss.
* **Finding:** When parsing JSON, native `JSON.parse` is not explicitly replaced by `safeJsonParse` in all areas. For instance, in `src/services/tradeService.ts`, data deserialization relies heavily on raw inputs, though `Decimal` serialization has been patched. The lack of standard `safeJsonParse` integration across all HTTP/WS data entry points could cause silent precision loss for large trade IDs or amounts.

## Resource Management & Performance

🔴 **CRITICAL: Memory Leaks in WebSocket Managers & Interval Handlers**
* **Finding:** `MarketWatcher` uses `Map` and `Set` collections (`syntheticSubs`, `pendingSubscriptions`, etc.) heavily, and its teardown processes (`cleanup()`/`destroy()`) show potential unbounded growth if not completely cleared.
* **Finding:** Global memory leaks from un-cleared intervals. Many services (e.g., `bitgetWs.ts`, `omsService.ts`, `apiService.ts`) use `setInterval` but cast the return type using `ReturnType<typeof setInterval>`. However, there are instances where `clearInterval` is not uniformly invoked upon destruction or error handling.
* **Finding:** High-frequency intervals for recalculating technicals and performance metrics run indefinitely.

🟡 **WARNING: Hot Paths and Re-renders**
* **Finding:** The UI leverages `@html` directives combined with raw icons and un-sanitized content in various high-frequency templates (e.g., `MarketOverview.svelte`, `LeftControlPanel.svelte`). `DOMPurify` is imported in some places but not uniformly used to wrap `@html` bindings (e.g., in `JournalContent.svelte` or `SummaryResults.svelte`), posing performance and security concerns.

## UI/UX & Accessibility (A11y)

🟡 **WARNING: i18n Gaps and Hardcoded Strings**
* **Finding:** There are direct string literal error messages hardcoded in service exceptions (e.g., `csvService.ts`).
* **Finding:** The `TradeService` exposes raw strings for UI display if translation keys are unmapped.

🔴 **CRITICAL: Error Message Exposure (Raw HTML / 500s)**
* **Finding:** `BitunixApiError.rawMessage` is directly preferred and passed to user-facing contexts (e.g., via `getDisplayMessage` in `errorUtils.ts` and UI tooltips like `PositionsSidebar.svelte`). If the proxy returns an unhandled HTML error (e.g., 502 Bad Gateway), this exposes raw HTML to the frontend, violating strict defensive programming and security guidelines.

## Security & Validation

🔴 **CRITICAL: Unsafe DOM Manipulation (XSS Vectors)**
* **Finding:** Numerous components utilize Svelte's `{@html ...}` block to inject SVG icons or raw content without `DOMPurify` sanitization. Examples include `src/components/shared/LeftControlPanel.svelte`, `src/components/shared/JournalContent.svelte`, and `src/components/shared/MarketOverview.svelte`. This presents a significant Cross-Site Scripting (XSS) vulnerability if any user-generated or API-provided content is rendered.

🔵 **REFACTOR: Defensive Types**
* **Finding:** Loose types (`any`) persist extensively in `bitunixWs.ts`, `bitgetWs.ts`, and test files. Refactoring `any` to `unknown` or `Record<string, unknown>` with proper narrowing will measurably improve stability during runtime data mapping.


## Step 2: Action Plan

### 1. Data Integrity & Mapping (`Decimal.js` and JSON Fixes)
*   **Justification**: Replacing native JavaScript numbers with strict Decimals ensures institutional-grade precision and eliminates rounding errors during high-frequency data calculation.
*   **Action**: In `src/services/activeTechnicalsManager.svelte.ts`, modify `priceNum` calculation to utilize `Decimal` objects natively. Remove usage of `.toNumber()`.
*   **Test Case**: Implement a unit test capturing decimal precision loss when simulating large floating point conversions in active calculations.

### 2. Hardening WebSocket & Memory Management
*   **Justification**: Deterministic teardown of collections prevents unbounded memory growth, which directly impacts stability during prolonged runtime sessions.
*   **Action**: In `MarketWatcher` and related WebSocket managers (e.g. `bitgetWs.ts`, `bitunixWs.ts`), enforce complete teardown procedures. Add `.clear()` invocations for `subscriptions` maps and all other collections upon class destruction or unhandled error recovery paths.
*   **Test Case**: Simulate repeated connection drops and verify that the map size resolves to `0` after destruction methods execute.

### 3. UI/UX & Security (Error Message Hardening & XSS Prevention)
*   **Justification**: Displaying unfiltered HTML inside UI elements poses serious security vulnerabilities and breaks offline/disconnected states.
*   **Action**:
    1.  Update `getDisplayMessage` and `mapApiErrorToLabel` in `src/utils/errorUtils.ts` to detect raw HTML payloads (e.g., via `<html`). If HTML is detected, discard `rawMessage` and map it to a generic safe localized error (e.g., `apiErrors.invalidResponse`).
    2.  Ensure that `{@html ...}` blocks rendering variable content use `DOMPurify.sanitize()` (such as user journal inputs or dynamic tooltips).
*   **Test Case**: Provide a mocked error object with HTML inside `rawMessage` and assert that the resulting error message defaults to the safe i18n key rather than the HTML payload.
