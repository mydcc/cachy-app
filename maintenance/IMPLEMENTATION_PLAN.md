# Implementation Plan (Step 2)

**Objective:** Execute "Institutional Grade" hardening based on the findings in the Status & Risk Report.

## Phase 1: Data Integrity (CRITICAL)

### 1. Hardening `safeJsonParse`
*   **Rationale:** The entire system relies on `safeJsonParse` to protect large integers (Order IDs) from precision loss before they reach the "Fast Path" or Zod validation.
*   **Action:**
    1.  Create a targeted unit test `src/utils/safeJson_hardening.test.ts`.
    2.  Test cases:
        *   JSON with 19-digit integer (Bitunix Order ID).
        *   JSON with 20-digit integer.
        *   JSON with standard floats (prices).
        *   JSON with large integers in nested objects and arrays.
    3.  **If tests fail:** Update the regex in `safeJsonParse` to correctly capture these edge cases.

### 2. Trade Service "Panic" Logic Safety
*   **Rationale:** `flashClosePosition` proceeds to close even if `cancelAllOrders` fails, risking naked orders.
*   **Action:**
    1.  Modify `flashClosePosition` in `src/services/tradeService.ts`.
    2.  If `cancelAllOrders` fails, throw a specific error `trade.closeAbortedSafety` to the UI instead of proceeding, OR prompt the user (if possible).
    3.  Alternatively, use a "Force Close" flag that bypasses this check only if the user explicitly confirms "Close Anyway".

## Phase 2: Resource Management (WARNING)

### 3. MarketWatcher Subscription Pruning
*   **Rationale:** To prevent `MarketState` cache evasion.
*   **Action:**
    1.  Implement `pruneOrphanedSubscriptions()` in `MarketWatcher`.
    2.  This method should check `this.requests` against the actual active components (if possible) or ensure `unregister` is robust.
    3.  Verify `TechnicalsPanel` unmount behavior with a log or test.

### 4. Memory Spike Mitigation
*   **Rationale:** `ensureHistory` accumulates large arrays.
*   **Action:**
    1.  Refactor `ensureHistory` in `src/services/marketWatcher.ts` to push chunks to `marketState` immediately instead of waiting for the full batch.
    2.  This leverages the existing "Fast Path 3" (overlap/append) logic in `marketState.updateSymbolKlines` more effectively.

## Phase 3: UI/UX & i18n (WARNING)

### 5. PortfolioInputs Error Handling
*   **Rationale:** Raw error messages are user-hostile.
*   **Action:**
    1.  Update `src/components/inputs/PortfolioInputs.svelte`.
    2.  Map common API errors (e.g. "Invalid API Key", "IP not allowed") to i18n keys using a helper `mapApiErrorToLabel(e)`.

## Execution Order
1.  **Phase 1 (Integrity)** - Highest risk.
2.  **Phase 3 (UI)** - High visibility/impact.
3.  **Phase 2 (Resource)** - Long-term stability.
