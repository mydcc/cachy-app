# Action Plan: System Hardening

Based on the findings in `ANALYSIS_REPORT_STEP1.md`, this plan outlines the steps to elevate the codebase to "institutional grade" reliability.

## Phase 1: Critical Data Integrity & Safety (Highest Priority)

### 1. Harden `TradeService` Execution Logic
*   **Goal:** Prevent "Naked Stop Loss" scenarios and secure API key usage.
*   **Tasks:**
    *   [ ] Refactor `flashClosePosition`: Implement a "Safe Close" flow. If `cancelAllOrders` fails, strictly abort the close operation or use a `reduceOnly` market order with a clear warning to the user.
    *   [ ] Create `modifyTpSlOrder` in `tradeService.ts`: Centralize the logic currently duplicated in `TpSlEditModal`. Use `signedRequest` instead of raw `fetch`.
    *   [ ] Remove raw `fetch` calls from `TpSlEditModal.svelte` and replace with `tradeService.modifyTpSlOrder`.

### 2. Harden WebSocket Data Path
*   **Goal:** Ensure data integrity even during high-frequency updates.
*   **Tasks:**
    *   [ ] Wrap `bitunixWs.ts` "Fast Path" in a robust `try-catch` block.
    *   [ ] Add a fallback mechanism: If Fast Path fails (e.g., unexpected data type), immediately pass the raw message to the Zod-validated "Safe Path".
    *   [ ] Add telemetry logging for Fast Path failures to detect API changes early.

### 3. Fix Performance Regression (Lazy Loading)
*   **Goal:** Reduce startup network storm.
*   **Tasks:**
    *   [ ] Debug `src/components/shared/MarketOverview.svelte`.
    *   [ ] Ensure `ensureHistory` is only called when the element is intersecting the viewport.
    *   [ ] Verify fix with `src/tests/performance/market_overview_fetch_storm.test.ts`.

## Phase 2: UI/UX & Localization (High Priority)

### 1. Input Validation & I18n for Modals
*   **Goal:** Prevent invalid user inputs and support localization.
*   **Tasks:**
    *   [ ] Implement Zod schema validation in `TpSlEditModal` (Price > 0, Amount > 0).
    *   [ ] Extract hardcoded strings in `TpSlEditModal` to `src/locales/en.json` (or similar) and use `$t()`.
    *   [ ] Extract hardcoded strings in `MarketOverview` (e.g., "Market Cap", "Vol").

### 2. Error Handling
*   **Goal:** Actionable error messages.
*   **Tasks:**
    *   [ ] Update `ToastItem` to handle error codes (e.g., "apiErrors.insufficientFunds") by looking up localized messages instead of showing raw codes.

## Phase 3: Technical Debt & Performance (Refactoring)

### 1. Optimize `Aggregator` (Deferred)
*   **Task:** Refactor `getJournalAnalysis` to use Svelte 5 derived stores or granular calculation to prevent UI blocking. (This is a larger refactor).

## Execution Strategy
1.  **Test First:** Run reproduction tests for the regression.
2.  **Fix Criticals:** Apply Phase 1 fixes.
3.  **Verify:** Run tests again.
4.  **Refine:** Apply Phase 2 fixes.
