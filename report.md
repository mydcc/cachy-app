# Code Analysis & Hardening Report (Cachy-App)

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1. **Floating Point Inaccuracies in Store Management:**
   - `src/services/activeTechnicalsManager.svelte.ts`: Found direct usage of `.toNumber()` converting `Decimal` objects back to primitive JavaScript floats (`priceNum = price.toNumber()`). This causes precision loss in calculations which is forbidden by institutional-grade financial guidelines.
   - **Test Suggestion:** Add a unit test to verify that large decimal values or fractional parts are accurately processed in `activeTechnicalsManager.svelte.ts` without floating point fuzzing.

2. **Uncaught Error Typing (TypeScript Bypassing):**
   - Widespread usage of `catch (e: any)` in the codebase instead of strict `unknown` handling with type narrowing, which compromises error handling integrity and could lead to runtime crashes during edge cases.
   - **Test Suggestion:** Verify safe error message extraction in critical paths like `apiService.ts` and `tradeService.ts` using mock malformed errors.

3. **Insecure Error Responses Exposing Internal Implementation Details:**
   - Multiple instances where `await response.text()` is read during API exceptions without strict HTML/JSON validation (e.g., in `src/services/apiService.ts`, `newsService.ts`, `tradeService.ts`). If the proxy/gateway fails (e.g., 502 Bad Gateway), this logic might inject raw Cloudflare/Nginx HTML pages into the UI or logs, leading to potentially insecure error handling or unhandled JSON parse exceptions.
   - **Test Suggestion:** Test `tradeService.ts` to ensure that 502 proxy HTML responses are cleanly mapped to safe, localized error keys like `apiErrors.invalidResponse`.

## 🟡 WARNING (Performance issue, UX error, missing i18n)

1. **Memory Leaks from Unbounded Caches and Timers:**
   - Multiple services use `setInterval` without corresponding `clearInterval` during teardown/cleanup logic.
   - Potential memory leaks in caches where elements are deleted incorrectly. Eviction of older keys in Maps (`calculationCache.delete(oldestKey)`) requires validation that the `.keys().next().value` mechanism is safely used without breaking active references.
   - Websocket subscription caches (e.g. `syntheticSubs`, `pendingSubscriptions` in `bitunixWs.ts`) are manually managed; edge cases might leave dangling references if a disconnect happens at the exact wrong moment.

2. **Cross-Site Scripting (XSS) Risks via `{@html}` Bindings:**
   - There are multiple uses of `{@html}` tags across various UI components (e.g., `MarketOverview.svelte`, `SummaryResults.svelte`, `SidePanel.svelte`). While some are sanitized using `DOMPurify.sanitize`, others (especially inline SVGs/icons like `{@html icons.lockClosed}`) may bypass sanitization. Although icons are generally safe, consistent enforcement of sanitization is recommended as a defense-in-depth measure.

3. **Missing i18n Keys & Hardcoded Strings:**
   - Services such as `tradeService.ts` use hardcoded default strings (e.g., `"Flash Close Failed"`) inside `toastService.error` calls alongside `get(_)()`.
   - `calculationStrategy.ts` logs hardcoded strings (`Critical Lag: ...`) directly to `toastService.error`.

## 🔵 REFACTOR (Code smell, technical debt)

1. **JSON Parsing Resilience:**
   - `JSON.parse` is used directly in multiple locations instead of `safeJsonParse`. This is a technical debt issue as large numeric IDs in standard JSON parsing can lose precision. Migrating all `JSON.parse` to `safeJsonParse` is highly recommended for financial integrity.


## Step 2: Action Plan (Implementation Phase)

### 1. Fix Floating Point and Precision Issues (CRITICAL)
- **Target:** `src/services/activeTechnicalsManager.svelte.ts`
- **Action:** Refactor `.toNumber()` calls to retain `Decimal` objects throughout the data flow to ensure institutional-grade precision. Update component or store typings to accept `Decimal` directly instead of native floats.
- **Unit Test:** Create a test case reproducing a highly fractional price value (e.g. `0.000000001`) and assert that it calculates and maintains the exact Decimal state without precision loss.

### 2. Type-Safe Error Handling (CRITICAL)
- **Target:** Entire Codebase
- **Action:** Replace `catch (e: any)` with strict `catch (e: unknown)`. Type-narrow using `e instanceof Error ? e.message : String(e)` to extract error messages safely without bypassing TypeScript's safety mechanisms.
- **Unit Test:** Verify safe error message extraction in critical paths like `apiService.ts` and `tradeService.ts` by explicitly throwing non-Error objects and observing correct message recovery.

### 3. Hardening API Response Handlers (CRITICAL)
- **Target:** `apiService.ts`, `newsService.ts`, `tradeService.ts`
- **Action:** When catching errors or receiving non-200 responses, explicitly validate that `.text()` payloads are not raw HTML pages (e.g., 502 Bad Gateway proxy responses). Catch parsing failures and map them to localized safe error keys (`apiErrors.invalidResponse`). Prevent exposure of raw `statusText` to UI components.
- **Unit Test:** Provide a mocked 502 Cloudflare HTML response to `tradeService.ts` and assert that the localized safe error key is returned rather than the raw HTML string or a JSON parse exception.

### 4. Memory Leak Prevention & Caching Safety (WARNING)
- **Target:** Services with `setInterval` and Maps (e.g., `marketWatcher.ts`, `bitunixWs.ts`, `activeTechnicalsManager.svelte.ts`)
- **Action:** Ensure all `setInterval` return references are stored and explicitly cleared with `clearInterval` upon service teardown. When evicting elements from bounded Maps (like `calculationCache`), iterate via `.entries()` to find strictly inactive items (e.g., `val === 0` ref count) instead of blindly deleting the first key (`.keys().next().value`) to avoid corrupting active application state.

### 5. i18n & Error Message Cleanup (WARNING)
- **Target:** `tradeService.ts`, `calculationStrategy.ts`
- **Action:** Remove hardcoded English fallback strings (e.g., "Flash Close Failed", "Critical Lag: ...") from `toastService.error` calls and replace them entirely with appropriate `$_('key')` syntax from the i18n dictionary.

### 6. Replace Native JSON.parse with safeJsonParse (REFACTOR)
- **Target:** All service files
- **Action:** Refactor `JSON.parse` usage to use the project's custom `safeJsonParse` utility.
- **Justification:** This refactor directly and measurably improves stability by preventing silent precision loss for large numeric IDs across the platform and safely handling parsing exceptions during data ingestion.
