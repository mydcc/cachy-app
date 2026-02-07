# Action Plan: Systematic Hardening & Maintenance

Based on the analysis in `ANALYSIS_REPORT_STEP1.md`, this plan outlines the steps to raise the codebase to an "institutional grade" level.

## Phase 1: Critical Security & Data Integrity (High Priority)

**Goal:** Eliminate insecure patterns in UI and enforce strict typing in core data services.

### 1.1 Secure TP/SL Management (Refactor)
*   **Problem:** `TpSlEditModal.svelte` manually constructs API requests using `settingsState.apiKeys`, leaking security logic to the UI layer.
*   **Solution:**
    *   Add `modifyTpSlOrder` method to `TradeService`.
    *   Refactor `fetchTpSlOrders` and `cancelTpSlOrder` in `TradeService` to use the centralized `signedRequest` helper (ensuring consistent header signing and error handling).
    *   Update `TpSlEditModal` to call `tradeService.modifyTpSlOrder` instead of `fetch`.
*   **Verification:**
    *   Verify `TpSlEditModal` no longer imports `settingsState` for API keys.
    *   Test TP/SL modification flow (mocked backend).

### 1.2 Harden WebSocket & Market Data Types
*   **Problem:** `BitunixWs.ts` uses `any` in message handling, and `MarketWatcher.ensureHistory` uses `any[]`.
*   **Solution:**
    *   Define strict Zod schemas for all WebSocket event payloads in `src/types/bitunixSchemas.ts` (or similar).
    *   Update `BitunixWs.handleMessage` to use `safeParse` and log validation errors without crashing.
    *   Update `MarketWatcher.ensureHistory` to type `results` as `Kline[]` and validate shape before merging.
*   **Verification:**
    *   Unit test `BitunixWs` with malformed payloads (fuzz testing).

## Phase 2: UI/UX Standardization & Localization (Medium Priority)

**Goal:** Ensure a professional, consistent user experience across languages and error states.

### 2.1 Complete Localization (i18n)
*   **Problem:** Hardcoded strings in `VisualBar.svelte` ("SL", "TP"), `TpSlEditModal.svelte`, and `OrderHistoryList.svelte`.
*   **Solution:**
    *   Extract strings to `en.json` (and `de.json`).
    *   Replace hardcoded strings with `$_("key")`.
    *   Update `OrderHistoryList` to use `Intl.DateTimeFormat` for locale-aware dates.

### 2.2 Standardize Error Handling
*   **Problem:** Inconsistent error messages (raw API errors vs. generic "Failed").
*   **Solution:**
    *   Create a `getErrorMessage(error)` helper in `src/utils/errorUtils.ts` that maps API error codes to localized keys.
    *   Apply this helper in `TpSlEditModal` and `OrderHistoryList`.

## Phase 3: Performance Optimization (Long Term)

**Goal:** Prevent UI freezes during heavy data processing.

### 3.1 Offload Heavy Calculations
*   **Problem:** `getJournalAnalysis` runs synchronously on the main thread.
*   **Solution:**
    *   Move `aggregator.ts` logic to a Web Worker (`src/workers/analysisWorker.ts`).
    *   Use `comlink` or `postMessage` to communicate with `journal.svelte.ts`.
    *   *Note: This is a larger refactor and should be tackled after Phase 1 & 2.*

## Execution Schedule

1.  **Step 1:** Implement Phase 1.1 (TradeService Refactor).
2.  **Step 2:** Implement Phase 1.2 (Type Hardening).
3.  **Step 3:** Implement Phase 2.1 & 2.2 (UI/UX).
4.  **Step 4:** Final Regression Testing.
