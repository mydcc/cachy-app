# Code Analysis and Hardening Report - Cachy-App

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1. **Precision Loss in API Data**:
   - Found extensive usage of native `JSON.parse` scattered across API routes, backup services, workers, backgrounds, and `AI`/`settings` states. This can cause precision loss on large 64-bit integer IDs (e.g. trade orders from Bitunix/Bitget) and high-precision floats.
   - *Fix Needed*: Enforce the use of the `safeJsonParse` utility (which protects numbers >= 15 chars) in `backupService.ts`, `apiService.ts`, `wasmCalculator.ts`, `apiQuotaTracker.svelte.ts`, `tradeService.ts`, and other external data boundaries.

2. **Improper Type Conversion (`.toNumber()`) on Prices/Quantities**:
   - `Decimal` values are being incorrectly converted to Javascript `number` floats via `.toNumber()` in multiple UI/store functions (`market.svelte.ts`, `calculators/stats.ts`, `calculators/charts.ts`, and test files). This violates financial standards and breaks precision.
   - *Fix Needed*: Eliminate `.toNumber()` usage on price and quantity objects outside of specific low-level graphics/chart rendering requirements where strictly necessary for the Canvas API. All logic components and math must retain `Decimal`.

3. **Potential XSS vulnerabilities through raw `{@html}` tags**:
   - Several UI components inject dynamic data via `{@html}` without `DOMPurify.sanitize()`. For example, `{@html icons[toast.type]}` in `ToastItem.svelte`, `{@html sanitizeHtml(win.message)}` (depending on what `sanitizeHtml` does), `{@html displayContent}` in `ContentRenderer.svelte`, and raw icons loaded directly.
   - *Fix Needed*: Wrap all non-static `{@html}` bindings in strict sanitization (e.g., `DOMPurify.sanitize()`).

4. **Unhandled Nulls and Error States in Critical Services**:
   - Error messages in Catch blocks (`try/catch (e: any)`) and API raw error exposure to UI. Ensure `catch (e: unknown)` is strictly used and that `rawMessage` fields containing HTML are intercepted.

## 🟡 WARNING (Performance issue, UX error, missing i18n)

1. **Missing i18n & Hardcoded Strings**:
   - Check fallback states. Are there strings displayed directly without `$_("key")` mapping? The UX can break on API failure if error messages return proxy HTML.

2. **Memory Leaks in Collections / Subscriptions**:
   - `MarketWatcher` needs rigorous checks to ensure unclosed WS subscriptions and `pendingRequests` maps are explicitly cleared when components unmount or subscriptions become 0.

3. **Hot Path Re-rendering**:
   - Rapid updates in `market.svelte.ts` (e.g. updating buffer directly).

## 🔵 REFACTOR (Code smell, technical debt)

1. **Test Hygiene**:
   - Ensure `global.localStorage` is mocked correctly prior to imports.

---

*This report acts as the preliminary read-only phase deliverable for Step 1.*

## Step 2: Action Plan (Implementation)

### Group 1: Harden JSON Parsing & Precision (CRITICAL)

**Justification:** Measurably improves stability by ensuring critical financial identifiers (like order IDs) and values do not lose precision during transmission, which causes failed API calls and reconciliation bugs.
- **Action**: Replace `JSON.parse` with `safeJsonParse` across `apiService.ts`, `backupService.ts`, and critical boundaries. Ensure `.toNumber()` isn't used for prices outside of charting.
- **Specific Unit Test (Before Fix)**:
  - Create a test in `src/tests/hardening/server_precision_repro.test.ts` that asserts `JSON.parse('{"id": 1234567890123456789}')` results in `1234567890123456800` (loss of precision).

### Group 2: Fix Critical XSS Vulnerabilities (CRITICAL)

**Justification:** Measurably improves security and stability by preventing execution of malicious payloads on the client.
- **Action**: In `src/lib/components/ContentRenderer.svelte` and `src/lib/windows/implementations/DialogView.svelte`, wrap all dynamic string references inside `{@html}` with `DOMPurify.sanitize()`.
- **Specific Unit Test (Before Fix)**:
  - Create a test mounting the component with a malicious payload like `<img src=x onerror=alert(1)>`. Verify that the unsanitized component executes or outputs the raw script, simulating the vulnerability.

### Group 3: Standardization of Error Management & I18N (WARNING/REFACTOR)

**Justification:** Does this measurably improve stability or performance? Yes, mapping errors properly stops UI freezes or crashes when raw HTML proxies fail back to the UI.
- **Action**: Enforce `catch (e: unknown)` and remove `catch (e: any)`. Stop raw API errors leaking.

### Group 4: Execute Final Tests
- **Action**: Run `npm run check` and `npm run test` to verify zero regressions.
