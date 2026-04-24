# In-depth Code Analysis Report & Action Plan

This document serves as both a risk report (Step 1) and an implementation action plan (Step 2) to raise the `cachy-app` codebase to an "institutional grade" standard.

---

## Step 1: Status & Risk Report

### Data Integrity & Mapping

*   **Financial Logic Accuracy (`decimal.js` vs. native `Number`):**
    *   **🔴 CRITICAL:** Several files use `parseFloat`, `parseInt`, or raw `Number()` for data that appears financial or chart-related. Relying on IEEE-754 floating-point math can lead to critical precision loss (e.g., `0.1 + 0.2 = 0.30000000000000004`).
        *   `src/lib/calculators/charts.ts`
        *   `src/services/wasmCalculator.ts`
        *   `src/utils/statefulTechnicalsCalculator.ts`
    *   **🔴 CRITICAL:** `src/services/tradeService.ts` correctly utilizes `Decimal` in many places, but has instances where data structures or helper payloads rely on generic type structures or bypass deep serialization safely.
*   **Type Safety & `any`:**
    *   **🟡 WARNING:** The `TradeService` makes extensive use of the `any` type (e.g., `let data: any = {};`, casting `signedRequest<any>`), compromising type safety during API response handling and data reconstruction. This makes it hard to guarantee order objects (like `TpSlOrder`) are properly shaped.
        *   `src/services/tradeService.ts` (and its associated test files)

### Resource Management & Performance

*   **Memory Leaks (Intervals, Timeouts, WebSockets):**
    *   **🔴 CRITICAL:** A significant number of long-running services and Svelte stores initiate `setInterval`, `setTimeout`, or `new WebSocket` but lack corresponding `clearInterval`, `clearTimeout`, or `.close()` calls in their teardown/destroy methods. This will lead to zombie processes, duplicated network requests, and massive memory bloat in an SPA architecture.
        *   `src/services/aggregatorService.ts`
        *   `src/services/serializationService.ts`
        *   `src/services/syncService.ts`
        *   `src/services/technicalsService.ts`
        *   `src/services/wasmCalculator.ts`
        *   `src/services/workerPool.ts`
        *   `src/stores/ai.svelte.ts`
        *   `src/stores/quiz.svelte.ts`
        *   `src/locales/i18n.ts`

### UI/UX, A11y & Security

*   **Security (Unsafe DOM Manipulations):**
    *   **🔴 CRITICAL:** Widespread use of Svelte's `{@html ...}` directive with potentially untrusted or inadequately sanitized content. This opens the platform to severe Cross-Site Scripting (XSS) vulnerabilities. Notably, `MarkdownView.svelte` uses a renderer that must be scrutinized against DOMPurify.
        *   `src/lib/windows/implementations/MarkdownView.svelte`
        *   `src/components/results/SummaryResults.svelte`
        *   `src/components/shared/JournalContent.svelte`
        *   `src/components/shared/CalculationDashboard.svelte`
        *   (and many others listed in the automated scan)

---

## Step 2: Implementation Action Plan

### Execution Guidelines Followed:
*   **Defensive Programming:** Null checks, safe parsing, and robust error fallback mechanisms.
*   **No Regressions:** Existing tests must pass.
*   **Financial Standards:** Enforcing `Decimal` strictly.

### Group 1: Hardening Financial Calculations (CRITICAL)
*   **Objective:** Eliminate IEEE-754 precision issues in charting and calculators.
*   **Specific Actions:**
    *   Refactor `src/lib/calculators/charts.ts`, `src/services/wasmCalculator.ts`, and `src/utils/statefulTechnicalsCalculator.ts` to strictly utilize `decimal.js`.
    *   If WebGL or specific low-level APIs strictly require numbers, wrap the evaluation as late as possible: `new Decimal(val).toNumber()`.
*   **Test Cases (Pre-Fix):**
    *   Write a unit test specifically asserting that large numeric strings or values with high decimal precision (e.g., `0.1 + 0.2`) are computed correctly without floating-point artifacts.
*   **Refactoring Justification:** Directly prevents financial loss and incorrect trading signals caused by rounding errors.

### Group 2: Hardening TradeService & Type Safety (CRITICAL / WARNING)
*   **Objective:** Prevent logic errors caused by unsafe type casting.
*   **Specific Actions:**
    *   In `src/services/tradeService.ts`, replace `any` variables with `unknown`.
    *   Implement and enforce Zod schemas (e.g., `TpSlOrderSchema.passthrough()`) to safely parse responses from `signedRequest` before passing them to internal logic.
*   **Test Cases (Pre-Fix):**
    *   Write tests demonstrating how the system fails or throws if malformed JSON or unexpected fields are returned from a simulated API.
*   **Refactoring Justification:** Improves stability by preventing runtime crashes when API contracts subtly change or unexpected data is returned.

### Group 3: Plugging Resource & Memory Leaks (CRITICAL)
*   **Objective:** Prevent SPA degradation over time.
*   **Specific Actions:**
    *   Audit `aggregatorService`, `syncService`, `technicalsService`, and `ai.svelte.ts`.
    *   Store all timer IDs (`this.pollTimer = setTimeout(...)`).
    *   Implement an explicit `destroy()` or `cleanup()` method in these classes that calls `clearTimeout`, `clearInterval`, and closes WebSockets.
    *   Ensure exported singleton instances are registered with Vite's HMR disposal: `if (import.meta.hot) { import.meta.hot.dispose(() => instance.destroy()); }`.
*   **Test Cases (Pre-Fix):**
    *   Create a leak test file (e.g., `src/services/bitunixWs.leak.test.ts`) that initializes the service, calls destroy, and then asserts (by casting to `any` to inspect private maps/arrays) that all internal subscription sets are size 0.
*   **Refactoring Justification:** Measurably improves client-side performance and stability, preventing the app from crashing the browser tab after prolonged use.

### Group 4: Securing DOM & XSS Mitigation (CRITICAL)
*   **Objective:** Remove XSS attack vectors.
*   **Specific Actions:**
    *   Migrate usages of `{@html ...}` in user-facing components (like `MarkdownView.svelte` and `JournalContent.svelte`).
    *   Implement the project's centralized markdown action: `use:markdown={content}` (which wraps DOMPurify via `renderSafeMarkdown`), completely eliminating `{@html renderTrustedMarkdown}` where untrusted data could originate.
*   **Refactoring Justification:** Measurably improves security and is a fundamental institutional-grade requirement.

### UI/UX, A11y & Error States

*   **Missing i18n Keys:**
    *   **🟡 WARNING:** Several UI components (like `MarketOverview.svelte` and `SettingsContent.svelte`) have hardcoded text nodes or placeholder strings that bypass the `$_()` translation store. This breaks localization.
*   **Actionable Error Messages & Broken States:**
    *   **🟡 WARNING:** When the WebSocket disconnects or REST API fails, generic "Error occurred" or raw HTTP text is sometimes logged/displayed rather than mapped to user-friendly `apiErrors.connectionLost`. A unified offline banner state is missing for total network failures.

