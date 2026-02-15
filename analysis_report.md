# Status & Risk Report (Security & Hardening)

This document details findings from the in-depth analysis performed by the Lead Architect.

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1.  **Security / Input Validation**:
    -   **Finding**: `src/routes/api/account/+server.ts` relies on manual validation of the request body instead of using strict Zod schemas.
    -   **Risk**: Injection vulnerability or runtime logic errors from malformed input. Inconsistent with the secure pattern used in `src/routes/api/tpsl/+server.ts`.
    -   **Location**: `src/routes/api/account/+server.ts`

2.  **Type Safety / Runtime Risk**:
    -   **Finding**: `src/services/bitunixWs.ts` uses an undeclared property `syntheticSubs` with `@ts-ignore`.
    -   **Risk**: Bypasses TypeScript's safety checks. High risk of runtime errors (`undefined` access) if the property is accessed before initialization or incorrectly typed.
    -   **Location**: `src/services/bitunixWs.ts`

3.  **CSP Configuration**:
    -   **Finding**: `svelte.config.js` enables `unsafe-inline` and `unsafe-eval` in the Content Security Policy.
    -   **Risk**: Significantly increases the attack surface for Cross-Site Scripting (XSS). An attacker could inject malicious scripts that execute in the context of the application.
    -   **Location**: `svelte.config.js`

## 🟡 WARNING (Performance issue, UX error, missing i18n)

1.  **Missing Internationalization (i18n)**:
    -   **Finding**: Hardcoded strings found in critical UI components.
    -   **Examples**:
        -   `src/lib/windows/implementations/CandleChartView.svelte`: "LOADING HISTORY", "FETCHING MARKET DATA..."
        -   `src/routes/+page.svelte`: Fallback titles like `|| "Favorites"`, and button texts.
    -   **Impact**: Poor UX for non-English users.

2.  **Loose Typing in Financial Service**:
    -   **Finding**: `TpSlOrder` interface uses `[key: string]: unknown`.
    -   **Risk**: Effectively disables type checking for properties, defeating the purpose of strict typing for financial data handling.
    -   **Location**: `src/services/tradeService.ts`

3.  **Potential Flakiness (Loading State)**:
    -   **Finding**: `CandleChartView.svelte` uses a `setTimeout` based debounce for loading history.
    -   **Risk**: Unreliable behavior under heavy load or slow network conditions.

## 🔵 REFACTOR (Technical Debt)

1.  **Inconsistent Validation Patterns**:
    -   **Finding**: The codebase mixes Zod validation (in `newsService`, `tpsl`) with manual validation (in `account`).
    -   **Action**: Standardize to use Zod schemas globally for all API endpoints.

2.  **Code Duplication**:
    -   **Finding**: Similar validation logic for API keys exists in multiple places.
    -   **Action**: Centralize validation logic into shared utilities.
