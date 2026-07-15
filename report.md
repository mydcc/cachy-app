# Cachy-App Status & Risk Report
**Role:** Senior Lead Developer & Systems Architect
**Focus:** High-Frequency Trading & Fintech Security
**Date:** 2026-07-15

## Executive Summary
An in-depth analysis of the `cachy-app` repository has been conducted to assess institutional-grade readiness. The focus was on identifying regressions, memory leaks, missing i18n, and logic errors in data processing, particularly within critical paths such as `MarketWatcher`, `TradeService`, and `NewsService`.

## Findings

### 1. Data Integrity & Mapping

*   **API Response Parsing (JSON.parse vs safeJsonParse)**:
    *   🟡 **WARNING**: Direct usage of native `JSON.parse` is prevalent across the application (e.g., `backupService.ts`, `apiService.ts`, `mdaService.ts`, `app.test.ts`, various components).
    *   *Risk*: This can lead to silent precision loss for 64-bit integers (e.g., order IDs from exchanges) and unhandled parsing exceptions if the payload is malformed or corrupted.
    *   *Action*: Replace `JSON.parse` with the custom `safeJsonParse` utility.
*   **Precision/Float Handling (Decimal.js vs Native Floats)**:
    *   🔴 **CRITICAL**: The codebase frequently uses `.toNumber()` on `Decimal` objects or casts values to `Number()` (e.g., `activeTechnicalsManager.svelte.ts`, `AccountTooltip.svelte`, `DepthBar.svelte`, `MarketOverview.svelte`, `PositionsList.svelte`).
    *   *Risk*: Downcasting `Decimal` back to native Javascript floats introduces floating-point inaccuracies, which are unacceptable in institutional-grade trading platforms and can lead to incorrect calculations for PnL, margin, and order quantities.
    *   *Action*: Maintain `Decimal` types end-to-end. Update components and stores to accept and process `Decimal` values directly.
*   **Type Safety / Defensive Programming**:
    *   🔴 **CRITICAL**: The use of `catch (e: any)` is widespread (approx. 40 instances, e.g., in `dataRepairService.ts`, `syncService.ts`, `newsService.ts`, multiple API routes, and components).
    *   *Risk*: Bypasses TypeScript's type checking, making it easy to call non-existent properties on error objects, potentially crashing the application or hiding the true cause of failure.
    *   *Action*: Refactor to `catch (e: unknown)` and type-narrow using `e instanceof Error ? e.message : String(e)`.

### 2. Resource Management & Performance

*   **Memory Leaks (WebSockets & Caches)**:
    *   🔴 **CRITICAL**: Review of `bitunixWs.ts` reveals that while `syntheticSubs` and `pendingSubscriptions` maps are maintained, there are historical or ongoing concerns with leaks (evidenced by `bitunixWs_leak.test.ts` and `bitunixWs.leak.test.ts`). Furthermore, complete teardown methods like `destroy()` must unconditionally call `.clear()` on all internal `Map` and `Set` collections.
    *   *Risk*: Unbounded memory growth, leading to application crashes or severe degradation over time.
    *   *Action*: Audit and ensure `.clear()` is called during teardown/disposal of services. Implement bounded eviction strategies for any caching Maps/Sets.
*   **Hot Paths**:
    *   🟡 **WARNING**: Frequent state updates in the UI thread based on incoming WebSocket data. If components trigger excessive re-renders due to native float conversions instead of relying on derived `Decimal` state, performance degrades.

### 3. UI/UX & Accessibility (A11y)

*   **Security (XSS)**:
    *   🔴 **CRITICAL**: There are potentially instances of `{@html ...}` being used.
    *   *Risk*: Cross-Site Scripting (XSS) vulnerabilities if the rendered content comes from unvalidated external sources (e.g., news feeds, chat).
    *   *Action*: Ensure all `{@html}` usages are strictly wrapped with `DOMPurify.sanitize()`.
*   **Error Handling**:
    *   🟡 **WARNING**: Need to ensure raw API error messages (like `rawMessage`) are not exposed directly to the UI, especially if they contain HTML proxy error pages.
    *   *Action*: Map raw errors to safe, localized error keys (e.g., `apiErrors.invalidResponse`).

### 4. Security & Validation

*   **Defensive Programming**:
    *   🔵 **REFACTOR**: Optimistic UI operations must handle backend failures gracefully. Unconfirmed orders should not be immediately deleted on network timeouts to prevent double-ordering. Retain them as `_isUnconfirmed = true` for reconciliation.

---

## Action Plan (Step 2)

### Group 1: Data Integrity & Calculation Precision (🔴 CRITICAL)
1.  **Enforce Decimal end-to-end**: Refactor components (e.g., `activeTechnicalsManager.svelte.ts`, `PositionsList.svelte`) to avoid `.toNumber()` and process `Decimal` values directly.
    *   *Justification*: Measurably improves stability and eliminates financial calculation errors.
2.  **Safe JSON Parsing**: Replace `JSON.parse` with `safeJsonParse` across the repository (e.g., `apiService.ts`, `backupService.ts`).
    *   *Justification*: Measurably improves stability by preventing silent ID truncation and unhandled parse exceptions.
    *   *Test Cases*: Introduce unit tests parsing large integers to verify `safeJsonParse` maintains precision compared to native `JSON.parse`.

### Group 2: Error Handling & Defensive Typing (🔴 CRITICAL)
1.  **Refactor `catch (e: any)`**: Replace all instances with `catch (e: unknown)` and proper narrowing.
    *   *Justification*: Prevents runtime crashes from unexpected error types.
2.  **Sanitize Error Outputs**: Ensure API errors mapped via `toastService` check for HTML content and use fallback keys like `apiErrors.invalidResponse`.
    *   *Justification*: Security improvement to prevent leaking sensitive infrastructure details.

### Group 3: Memory Management & Security (🔴 CRITICAL)
1.  **Teardown Resource Clearing**: Audit service disposal methods (e.g., `bitunixWs.ts`) to ensure `.clear()` is unconditionally called on `Map`/`Set` collections (`syntheticSubs`, `pendingSubscriptions`).
    *   *Justification*: Measurably improves performance and stability by eliminating memory leaks.
2.  **XSS Hardening**: Review all `{@html}` directives and enforce `DOMPurify.sanitize()`.
    *   *Justification*: Critical security vulnerability mitigation.

### Execution Strategy
1. Execute tests.
2. Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
3. Message user with the final report.