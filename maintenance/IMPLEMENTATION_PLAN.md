# Implementation Plan (Hardening & Maintenance)

**Date:** 20.02.2026
**Author:** Jules (Senior Lead Developer)
**Objective:** Resolve critical risks and enhance system stability based on the Status & Risk Report.

---

## Phase 1: Critical Fixes (Data Integrity & Performance)

### 1. Hardening WebSocket Data Integrity
*   **Goal:** Eliminate precision loss in `BitunixWs` caused by the "Fast Path" optimization.
*   **Action:**
    *   Refactor `src/services/bitunixWs.ts`: Remove the manual "Fast Path" casting block in `handleMessage`.
    *   Delegate all parsing to `StrictPriceDataSchema`, `StrictTickerDataSchema` (Zod), which already handle string transformation safely.
    *   **Justification:** The risk of financial data corruption (precision loss) outweighs the micro-optimization benefits of avoiding Zod.
*   **Test Case (Reproduction):**
    *   Mock a WebSocket message with a large integer ID (e.g., `9007199254740995`) or a high-precision float (e.g., `0.0000000012345678`).
    *   Verify that `JSON.parse` (via `safeJsonParse`) converts it to a Number with precision loss.
    *   (Note: Since `safeJsonParse` uses standard `JSON.parse`, the loss happens *before* our code sees it. The fix is to use a parser that keeps strings, or accept that we must rely on API sending strings. Bitunix API documentation states they send strings for high precision fields, but we must ensure we don't cast them to numbers inadvertently.)
    *   **Revised Action:** Ensure that we *never* cast incoming string fields to `number` and back to `string`. The fast path `safeString` helper does exactly this if the input is a number. We must ensure we prioritize the raw string.

### 2. MarketManager Memory Optimization
*   **Goal:** Eliminate GC thrashing in `MarketManager` during high-frequency updates.
*   **Action:**
    *   Refactor `src/stores/market.svelte.ts`: Implement a `Capacity` property for `KlineBuffers`.
    *   Modify `appendBuffers` to only re-allocate (grow) the buffer when `length >= capacity`.
    *   Use a growth factor of 1.5x or 2x.
    *   Track `usedLength` separate from buffer size.
*   **Justification:** Measurably improves performance (frame rate) during market volatility by reducing Garbage Collection pauses.

---

## Phase 2: Reliability & UX (Warnings)

### 3. Non-Blocking Gap Filling
*   **Goal:** Prevent main thread freezes during data recovery.
*   **Action:**
    *   Refactor `src/services/marketWatcher.ts`: Modify `fillGaps` to yield control to the event loop every 100 iterations (using `await new Promise(r => setTimeout(r, 0))`) OR limit the batch size per cycle.
    *   Alternatively, simple hard cap reduction if yield is too complex for sync logic.
*   **Justification:** "Broken State" prevention (UI freeze).

### 4. Trade Service Safety Logic
*   **Goal:** Prevent "Naked Positions" when closing trades.
*   **Action:**
    *   Modify `src/services/tradeService.ts` (`flashClosePosition`).
    *   Wrap `cancelAllOrders` in a `try-catch` block that logs the error but *does not* throw.
    *   Proceed with the close order even if cancellation fails.
    *   Add a specific error notification: "Position closed, but some orders could not be cancelled. Please check manually."
*   **Justification:** Prioritize user intent (Close Position) over secondary state consistency (Cancel Orders) in emergency situations.

---

## Phase 3: Validation & Refactoring

### 5. Input Hardening
*   **Action:**
    *   Review `src/components/inputs/PortfolioInputs.svelte` and `GeneralInputs.svelte`.
    *   Ensure all `Decimal` instantiations are guarded against empty strings or nulls.
    *   Standardize `validateInput` to return `null` for empty, and ensure consumers handle `null`.

---

## Execution Order

1.  **Phase 1** (Critical) - Immediate execution.
2.  **Phase 2** (Reliability) - Follow-up.
3.  **Phase 3** (Refactor) - Low priority.
