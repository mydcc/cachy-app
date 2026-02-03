# Action Plan: Maintenance & Hardening

**Date:** 2026-05-23
**Reference:** ANALYSIS_REPORT_HARDENING_FINAL.md

## Objective
Implement targeted refactoring to improve code maintainability (WebSocket Service) and clean up technical debt (UI Assets), while maintaining the established institutional-grade standards.

## 1. Refactoring: WebSocket "Fast Path" Extraction
**Goal:** Reduce complexity in `src/services/bitunixWs.ts` and enable unit testing of high-frequency data parsing.

*   **Task 1.1**: Create `src/services/bitunixFastPath.ts`.
    *   Move type guards (`isPriceData`, `isTickerData`, `isDepthData`) to this file.
    *   Implement a pure function `processFastPathMessage(message: any): FastPathResult | null`.
    *   This function should return the normalized data ready for `marketState` updates, or `null` if the message is not eligible for Fast Path.
*   **Task 1.2**: Update `src/services/bitunixWs.ts`.
    *   Import `processFastPathMessage`.
    *   Replace the monolithic `switch` statement in `handleMessage` with a call to this new service.
*   **Task 1.3**: Add Unit Tests.
    *   Create `src/services/bitunixFastPath.test.ts`.
    *   Test cases: Valid Price, Valid Ticker, Valid Depth, Malformed Data (should return null/throw handled error).

## 2. UI/UX: Asset Centralization
**Goal:** Remove hardcoded SVG strings from components to ensure consistency.

*   **Task 2.1**: Update `src/components/inputs/PortfolioInputs.svelte`.
    *   Replace inline `<svg class="lock-icon-closed" ...>` with `{@html icons.lockClosed}`.
    *   Replace inline `<svg class="lock-icon-open" ...>` with `{@html icons.lockOpen}`.
    *   Remove the fallback string in `{@html icons.refresh || '...'}` (confirming `icons.refresh` exists in `src/lib/constants.ts`).

## 3. Verification Strategy
*   **Unit Tests**: Run `npm run test` (Vitest) to verify the new Fast Path logic.
*   **Manual Check**: Verify that the Portfolio Inputs component renders the lock icons correctly.
*   **Regression Check**: Ensure WebSocket connection still processes Price/Ticker updates (using existing tests or manual observation if possible, though this is a hardening task).

## 4. Execution Order
1.  Implement `bitunixFastPath.ts` and its tests.
2.  Refactor `bitunixWs.ts`.
3.  Clean up `PortfolioInputs.svelte`.
