# Code Analysis & Risk Report for cachy-app

## 1. Data Integrity & Mapping

### Findings:
- **API Response Parsing (REST & WebSocket):** `unknown` and `any` types are used safely with `safeJsonParse`, casting to `Record<string, unknown>` before access (e.g. `src/services/tradeService.ts:178`). However, there is a risk of silent failures if parsing exceptions aren't handled correctly for optimistic UI updates.
- **Decimal Types:** The codebase utilizes `Decimal.js` well (e.g. `StrictDecimal` in Zod schemas), but there are spots where floating-point math happens implicitly via number conversions (e.g., `updateDecimal` in `src/stores/market.svelte.ts` which casts `Decimal.Value`). This creates slight inconsistencies.

🔴 **CRITICAL:** None found in immediate parsing.
🟡 **WARNING:** Missing robust checking when constructing `Decimal` from API payloads that can be `null` or empty strings in edge cases (although `safeJsonParse` helps).

## 2. Resource Management & Performance

### Findings:
- **Memory Leaks:**
  - Intervals are created with `setInterval` in multiple services (`omsService.ts`, `apiService.ts`, `bitunixWs.ts`, `market.svelte.ts`), and while they are stored in variables (e.g. `this.cleanupInterval = setInterval(...)`), there is no evidence of these being explicitly cleared using `clearInterval` on teardown/destruction in all cases. This leads to background tasks running indefinitely.
  - Caching Maps and arrays are used, but unbounded growth can be an issue if `limit` bounds aren't strictly enforced.

🔴 **CRITICAL:** Memory leaks from unclosed `setInterval` instances in singleton services like `apiService.ts` and `bitunixWs.ts`.
🟡 **WARNING:** Re-renders in hot paths (UI thread) during WebSocket floods if the store updates are not debounced or batched properly.

## 3. UI/UX & Accessibility (A11y)

### Findings:
- **Error Messages:** `BitunixApiError.rawMessage` is currently passed directly to the UI (e.g., `toastService.error`) in some places (`tradeService.ts:348`), which could expose raw gateway HTML or sensitive stack traces.
- **Missing i18n:** Hardcoded strings exist in places like `toastService.error("Flash Close Failed for...")` instead of fully using localization keys.
- **Broken States:** Unconfirmed optimistic orders can cause ghost UI elements if not reconciled correctly on timeouts.

🟡 **WARNING:** Hardcoded English strings mixed with i18n keys (e.g. `toastService.error(\`\${get(_)("trade.flashCloseFailed") || "Flash Close Failed"}: \${msg}\`)`).
🟡 **WARNING:** Exposing `rawMessage` (which can contain HTML from a 502/504 gateway response) to the UI toast service.

## 4. Security & Validation

### Findings:
- **DOM Manipulations (XSS Risk):** Several `{@html}` tags render content directly. Some use `sanitizeHtml` (`DOMPurify`), but others use internal icons or raw variables. E.g., `{@html icons.chevronDown}` is fine, but we must ensure no user data is passed to `{@html}` without `DOMPurify.sanitize()`.
- **Validation:** Inputs seem to use Zod schemas, which is solid.

🔴 **CRITICAL:** Exposing raw HTML gateway errors to `toastService` could result in broken UI or unintentional script execution if not sanitized, though `toastService` might sanitize internally.

---

# Action Plan

## Group 1: Memory Leaks & Resource Cleanup
- **Goal:** Fix unclosed intervals.
- **Action:** Add `clearInterval` to the `destroy()` or teardown methods for `apiService.ts`, `bitunixWs.ts`, `omsService.ts`, and `market.svelte.ts`.

## Group 2: Error Handling & XSS Prevention
- **Goal:** Prevent raw HTML from hitting the UI and improve i18n.
- **Action:** Modify `tradeService.ts` to check if `e.rawMessage` contains HTML (e.g., `.includes('<html')`) and map it to a generic `apiErrors.invalidResponse` key. Avoid hardcoded fallback strings and ensure translations are fully utilized.

## Group 3: Decimal Precision & Type Safety
- **Goal:** Enforce `Decimal` end-to-end.
- **Action:** Ensure `new Decimal()` calls are protected from `undefined` or `null` in API payloads.

## Proposed Tests (for Critical Logic Errors)
1. **Flash Close API Failure Test:** Create a unit test for `tradeService.flashClosePosition` that mocks an API failure returning a 502 HTML page. Assert that the `toastService.error` is called with a sanitized, generic error key (`apiErrors.invalidResponse`) and NOT the raw HTML string.
2. **Interval Cleanup Test:** Add test cases in `apiService.test.ts` to assert `clearInterval` is called when the service is disposed.

## Refactoring Justification
- **Interval cleanup:** Measurably improves stability and prevents memory exhaustion.
- **Error sanitization:** Prevents UI breakage and potential security risks from gateway errors.
