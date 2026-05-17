
# In-Depth Status & Risk Report: cachy-app

This report presents findings from an architectural and codebase scan of the `cachy-app` repository. Findings are categorized by severity.

## 🔴 CRITICAL: Risk of financial loss, crash, or security vulnerability.

1.  **Improper API Response Parsing (Security/Stability):**
    *   **Finding:** External APIs and network fetches are frequently converted to text using `await response.text()` or parsed via `response.json()` without a robust `try/catch` block. If an API gateway returns an unexpected HTML error page (e.g., 502 Bad Gateway) or a truncated response, the parsing throws an unhandled exception, potentially crashing the app or leaving it in a broken state. Also, exposing `response.statusText` could leak gateway details.
    *   **Location:** Found scattered in services making fetch calls.
    *   **Impact:** Crashes, broken UI state, leaking infrastructure details.

2.  **Insecure Markdown Rendering (Security - XSS):**
    *   **Finding:** `src/lib/windows/implementations/MarkdownView.svelte` uses `{@html renderTrustedMarkdown(win.content)}`. According to the memory guidelines, untrusted content should not use `renderTrustedMarkdown`. If `win.content` comes from a potentially untrusted source (like a chat or database), this is an XSS vulnerability.
    *   **Location:** `src/lib/windows/implementations/MarkdownView.svelte`
    *   **Impact:** Cross-Site Scripting (XSS).

3.  **Potential Logic Errors in Financial Operations (Type Safety/Data Integrity):**
    *   **Finding:** Some properties or order parameters are not rigorously validated with explicit schemas (like `TpSlOrderSchema.passthrough()`) before sending to APIs. Hardcoded string checks and `Number(val)` usage instead of `Decimal(val).toNumber()` can lead to precision loss in quantity or price.
    *   **Location:** Across `tradeService.ts` and `utils`. Fast paths use `Number()` unsafely in some places without wrapping via `Decimal`.
    *   **Impact:** Incorrect order sizing or pricing leading to direct financial loss.

## 🟡 WARNING: Performance issue, UX error, missing i18n.

1.  **Memory Leaks in Stores and Services (Performance/Resource):**
    *   **Finding:** Indiscriminate `.clear()` might be used on Maps/Sets instead of bounded eviction (e.g., in caches or WebSocket subscriptions). Also, `setInterval` IDs (e.g., in `market.svelte.ts`, `omsService.ts`, `apiService.ts`, `bitgetWs.ts`) are present. While some might be cleared in `destroy()`, we need to ensure proper HMR disposal blocks exist for exported singletons, as per the guidelines.
    *   **Location:** `src/services/apiService.ts`, `src/stores/market.svelte.ts`, `src/services/bitunixWs.ts`, etc.
    *   **Impact:** Unbounded memory growth, zombie intervals during hot reloads, degrading performance over long sessions.

2.  **Missing Error i18n / Actionable Messages (UX/i18n):**
    *   **Finding:** When catching errors, standard literal strings are often thrown or displayed directly instead of using centralized constants mapped to localization keys (e.g., `apiErrors.invalidResponse`). Users seeing "JSON parse error" or a raw HTTP status rather than a helpful localized message degrades UX.
    *   **Location:** `catch` blocks in API handlers and services.
    *   **Impact:** Poor user experience, untranslated UI elements.

## 🔵 REFACTOR: Code smell, technical debt.

1.  **Strict Type Checking and Narrowing:**
    *   **Finding:** The `catch (e: any)` pattern might still exist in older files despite guidelines demanding `catch (e: unknown)`.
    *   **Impact:** Bypasses TypeScript's safety nets. Refactoring to `unknown` and narrowing measurably improves stability by preventing unexpected runtime errors from non-Error objects being thrown.

---

# Action Plan

## Step 1: Harden Data Integrity & Financial Calculations (CRITICAL)
*   **Target:** `src/utils/utils.ts` or similar utility files processing numbers.
*   **Action:** Ensure all conversions of string representations of currency/quantities route through `new Decimal(val).toNumber()` instead of direct `Number(val)` to guarantee precision.
*   **Test Case:** Ensure existing unit tests for precision loss (e.g., `src/utils/tests/precision_loss.test.ts`) pass, or add a specific test proving `Number("0.1") + Number("0.2")` issues are avoided via `Decimal`.

## Step 2: Secure Markdown Rendering & Prevent XSS (CRITICAL)
*   **Target:** `src/lib/windows/implementations/MarkdownView.svelte`
*   **Action:** Replace `renderTrustedMarkdown` with the safe `markdown` action (`use:markdown={win.content}`) from `src/actions/markdown.ts` to ensure DOMPurify sanitization.

## Step 3: Fix Resource Leaks & Ensure Safe Eviction (WARNING)
*   **Target:** Services with `setInterval` (`src/services/apiService.ts`, `src/services/bitunixWs.ts`).
*   **Action:** Verify and add HMR `dispose` blocks at the end of singleton files:
    ```typescript
    if (import.meta.hot) {
        import.meta.hot.dispose(() => instance.destroy());
    }
    ```
*   **Action:** Review `Map` or `Set` usage for caches. Replace indiscriminate `.clear()` with timestamp-based or size-bounded eviction where state retention is critical.

## Step 4: Robust API Response Handling & Error i18n (WARNING)
*   **Target:** Network fetch wrappers in services.
*   **Action:** Wrap `response.text()` or `response.json()` calls in `try/catch` blocks. Map parsing failures to generic localized error keys (e.g., `apiErrors.invalidResponseFormat`) rather than exposing raw errors.
*   **Action:** Ensure catch blocks use `catch (e: unknown)` and type-narrow using `e instanceof Error ? e.message : String(e)`.

## Step 5: Final Verification & Pre-Commit
*   Run `npm run check && npm run test` to ensure no regressions.
*   Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
