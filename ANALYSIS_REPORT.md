# Analysis & Risk Report

## Executive Summary
The `cachy-app` codebase demonstrates a high level of maturity with defensive programming practices such as consistent use of `Decimal.js` for financial calculations, robust retry policies, and structured state management. However, performance optimizations in the WebSocket layer introduced potential type safety risks, and localization coverage was incomplete.

## Findings by Category

### 1. Data Integrity & Mapping
*   **Status:** Generally Robust.
*   **Strengths:**
    *   `TradeService` and `OMSService` strictly enforce `Decimal` types, preventing floating-point errors.
    *   API responses are parsed safely with `safeJsonParse`.
    *   `ensurePositionFreshness` prevents trading on stale data.
*   **Risks:**
    *   **WebSocket Fast Path:** The `bitunixWs.ts` service bypasses Zod validation for high-frequency channels (`price`, `ticker`). The initial type guards were too permissive, potentially allowing objects or mixed types to pass as valid data.
    *   **Mitigation:** Hardened the type guards (`isPriceData`, `isTickerData`) to explicitly validate that critical fields are primitives (number/string) if they exist.

### 2. Resource Management & Performance
*   **Status:** Good.
*   **Strengths:**
    *   `MarketManager` uses buffers (`pendingUpdates`) with hard limits to prevent memory leaks during high-load.
    *   `TechnicalsService` uses LRU caching and a dedicated worker.
*   **Observations:**
    *   `marketWatcher.ts` uses `setInterval` for polling. While generally acceptable, a recursive `setTimeout` pattern is safer to prevent request stacking. This is marked as a low-priority refactor.

### 3. UI/UX & Accessibility
*   **Status:** Needs Improvement (Addressed).
*   **Findings:**
    *   Several hardcoded strings were identified in `VisualsTab`, `AiTab`, and Tooltips, bypassing the i18n system.
    *   "Broken" states (e.g., loading spinners) are generally handled, but consistent error messaging relies on correct i18n keys.
*   **Actions:** Extracted hardcoded strings to `en.json` and updated components.

### 4. Security
*   **Status:** Secure.
*   **Strengths:**
    *   `DisclaimerModal` uses `DOMPurify` (via `sanitizeHtml`) to render HTML safely.
    *   Input components validate numeric input aggressively.
    *   API keys are stored in `settingsState` (local storage) and not logged in error reports.

## Prioritized Implementation Plan (Completed)

1.  **Critical Hardening:**
    *   Refactored `src/services/bitunixWs.ts` to strictly validate Fast Path payloads.
    *   Added regression tests in `src/tests/hardening/bitunix_ws.test.ts`.

2.  **Localization:**
    *   Added missing keys to `en.json`.
    *   Updated `VisualsTab`, `AiTab`, and shared components to use `$_`.

3.  **Validation:**
    *   Verified changes with `svelte-check` and full unit test suite.
