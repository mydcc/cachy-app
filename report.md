# Code Analysis and Hardening Report - Cachy App

This report identifies vulnerabilities, regressions, missing i18n, and logic errors in data processing for the cachy-app codebase to raise it to an "institutional grade" level.

## Findings

### Data Integrity & Mapping

🔴 **CRITICAL**: Missing or weak sanitization of `{@html}` tags in multiple Svelte components. `{@html DOMPurify.sanitize(...)}` or `{@html sanitizeHtml(...)}` is used in some places, but many uses lack this protection against Cross-Site Scripting (XSS).

🔴 **CRITICAL**: Inconsistent `Decimal.js` usage. Some areas might be using native JavaScript `Number` or doing `toNumber()` operations, risking precision loss for financial calculations.

### Resource Management & Performance

🔴 **CRITICAL**: Memory Leaks in Timer/Interval management. Many services or components that create intervals or recursive timeouts might not properly clear them.

🟡 **WARNING**: `src/services/marketWatcher.ts` `fillGaps` has a hardcoded limit `MAX_GAP_FILL = 5000`. If exceeded, it drops data, creating discontinuities.

### UI/UX & Accessibility (A11y)

🟡 **WARNING**: Hardcoded strings in error handling and fallback UI.
-   `src/services/tradeService.ts`: Uses hardcoded strings like `"apiErrors.invalidAmount"` inside an Error throw.

🟡 **WARNING**: "Broken states" handling when API fails.

### Security & validation

🔴 **CRITICAL**: In `src/services/tradeService.ts`, `closePosition` validates `amount` loosely: `const qty = amount ? amount.toString() : position.amount.toString();`. If `amount` is passed as 0 or negative (or an invalid Decimal), it converts to string and passes it directly to the API.

## Categorized Priorities

### 🔴 CRITICAL
1.  **XSS Vulnerabilities via `{@html}`**: Numerous Svelte components render raw HTML (mostly icons, but some text/tooltips) without `DOMPurify.sanitize()`. This is a severe risk if any icon name or text data is tainted.
2.  **Order Quantity Validation**: `tradeService.ts` lacks pre-validation for trade amounts and prices (e.g. checking for zero, negatives, or non-Decimal values) before API submission.
3.  **Decimal Precision Loss Risk**: Ensure that all prices, volumes, and calculated values strictly utilize `Decimal.js`. Native JS numbers must not be used for any financial calculations.

### 🟡 WARNING
1.  **Hardcoded Strings / Missing i18n**: Need to review error logs and user-facing notifications for hardcoded strings.
2.  **Memory Leaks**: Double-check `activeTechnicalsManager.svelte.ts` and `newsService.ts` for unclosed subscriptions or growing arrays without bounds.

### 🔵 REFACTOR
1.  **Error Handling Centralization**: Consolidate error translation and mapping.

## Action Plan (Planning Phase)

### 1. Hardening UI Security (XSS Prevention)
-   **Task**: Audit all `{@html ...}` usages in `.svelte` files.
-   **Action**: Wrap all dynamic content injections with `DOMPurify.sanitize(content)` or the existing `sanitizeHtml(content)` utility. (e.g., `src/components/shared/JournalContent.svelte`, `src/components/shared/MarketOverview.svelte`).
-   **Justification**: Security patch to prevent XSS. Fixes a critical vulnerability.

### 2. Enforcing Strict Decimal Types
-   **Task**: Ensure `Decimal.js` is used exclusively for financial data calculations.
-   **Action**: Refactor any calculation loops (like moving averages or volume aggregates) to maintain `Decimal` objects until the final display layer. Avoid `Number(val)` or `val.toNumber()`.
-   **Justification**: Stability fix. Precision loss in financial transactions causes direct monetary impact.

### 3. Fortifying Trade Service and Validation
-   **Task**: Strengthen API input validation.
-   **Action**: In `tradeService.ts` (e.g., `closePosition`), add strict checks to ensure `amount` is a valid, positive `Decimal`. Throw i18n-mapped errors early if validation fails.
-   **Unit Tests for Critical Errors**:
    -   *Test Case 1*: `closePosition` with negative amount should throw `apiErrors.invalidAmount` before making a network call.
    -   *Test Case 2*: `closePosition` with zero amount should throw `apiErrors.invalidAmount` before making a network call.
-   **Justification**: Stability fix. Sending invalid API parameters can lead to unintended trades or broken exchange states.

### 4. Resolving Memory Leaks & Timers
-   **Task**: Ensure all polling and intervals are correctly bound to component/service lifecycles.
-   **Action**: Inspect any `setInterval` or recursive `setTimeout` usages (e.g., `activeTechnicalsManager.svelte.ts`) and ensure they have explicit `clearInterval`/`clearTimeout` calls on destroy.
-   **Justification**: Performance fix. Fixes runaway memory consumption during extended sessions.

### 5. Standardizing Error Handling and i18n
-   **Task**: Remove hardcoded UI strings.
-   **Action**: Replace inline error strings (e.g., in `newsService.ts` or `tradeService.ts`) with properly localized keys using the `$_('key')` syntax.
-   **Justification**: Stability/UX fix. Ensures all users can comprehend critical application states and errors, especially during connection failures.
