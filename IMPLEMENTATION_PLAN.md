# Implementation Plan: Cachy-App Hardening

Based on the In-Depth Analysis & Report (Step 1), the following plan outlines the steps to raise the codebase to an "institutional grade" level.

## Phase 1: Critical Fixes (Data Safety & Stability)
**Goal:** Prevent data corruption, financial errors, and crash loops.

1.  **Fix Test Environment & Dependencies**
    *   **Finding:** `npm run test` fails because `vitest` is missing in the environment.
    *   **Action:** Ensure `vitest` and dependencies are correctly installed. Verify tests can run.
    *   **Justification:** We cannot safely apply critical fixes without a working test suite.

2.  **Harden WebSocket "Fast Path" (`src/services/bitunixWs.ts`)**
    *   **Finding:** High-frequency events bypass Zod validation for performance.
    *   **Action:** Implement a lightweight, non-Zod validator (simple type checks) for `price`, `ticker`, and `depth` messages before accessing properties. Ensure `orderId` is *always* treated as a string to prevent precision loss (>15 digits).
    *   **Test Case:** Mock a WS message with a malformed payload and ensuring it doesn't crash the socket loop. Mock a message with a numeric `orderId > MAX_SAFE_INTEGER` and ensure it's converted to string correctly.

3.  **Fix Order ID Precision (`src/services/bitunixWs.ts` & `tradeService.ts`)**
    *   **Finding:** Potential precision loss for large numeric Order IDs.
    *   **Action:** Enforce `string` type for all `orderId` fields in interfaces and runtime handling.
    *   **Test Case:** Unit test `mapToOMSOrder` with a large integer input.

4.  **Fix Error Swallowing in `TradeService` (`src/services/tradeService.ts`)**
    *   **Finding:** `fetchTpSlOrders` and `closeAllPositions` mask errors.
    *   **Action:**
        *   Update `fetchTpSlOrders` to throw or return a partial result object with errors.
        *   Update `closeAllPositions` to return a detailed report of which positions failed to close.
    *   **Test Case:** Mock API failure for one symbol in `closeAllPositions` and verify the error is reported.

5.  **Fix Synthentic Subscription Logic (`src/services/bitunixWs.ts`)**
    *   **Finding:** Fragile logic with `@ts-ignore` for synthetic timeframes.
    *   **Action:** Refactor `syntheticSubs` to use proper typing and robust symbol normalization.
    *   **Test Case:** Verify that subscribing to `2h` candles (synthetic) correctly aggregates `1h` updates.

## Phase 2: UX & i18n Hardening
**Goal:** Improve user experience and internationalization.

1.  **Extract Hardcoded Strings**
    *   **Finding:** Hardcoded options in `IndicatorSettings.svelte` ("Speed", "Balanced") and `newsService.ts` ("important").
    *   **Action:** Move strings to `src/locales/en.json` (and `de.json`). Use `t()` function.
    *   **Verification:** Switch language and verify UI updates.

2.  **Improve API Error Handling (`src/routes/api/orders/+server.ts`)**
    *   **Finding:** Fallback to generic error if exchange error format changes.
    *   **Action:** Implement a more robust error parser that captures raw text if JSON parsing fails, and maps known exchange codes to user-friendly messages.

## Phase 3: Refactoring (Technical Debt)
**Goal:** Improve maintainability (Lower Priority).

1.  **Simplify `applySymbolKlines` Merge Logic (`src/stores/market.svelte.ts`)**
    *   **Finding:** Complex `O(N+M)` merge logic.
    *   **Action:** Refactor to a clearer, testable helper function.
    *   **Justification:** Reduces risk of bugs during future maintenance.

## Execution Order
1.  **Phase 1** (Immediate)
2.  **Phase 2** (Follow-up)
3.  **Phase 3** (When time permits)
