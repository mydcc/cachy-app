# Phase 2: Implementation Plan (Hardening & Maintenance)

Based on the analysis in `ANALYSIS_REPORT_STEP1.md`, the following implementation plan is proposed. The focus is on strictly "Institutional Grade" improvements that measurably increase stability, safety, and user experience.

## Priority 1: Critical Fixes & Data Integrity (High Impact)

### 1. Harden Trade Service Type Safety
**Goal:** Eliminate `any` types in critical order management paths to prevent runtime errors if API structures change.
*   **Action:** Create a strict Zod schema `TpSlOrderSchema` in `src/types/trade.ts` (or similar).
*   **Action:** Refactor `TradeService.fetchTpSlOrders` to validate API responses against this schema.
*   **Test Case:** Verify that the service throws a descriptive error (and logs it) if the API returns malformed data, rather than crashing the UI.

### 2. Full Internationalization of Trading Modals
**Goal:** Ensure all user-facing strings in critical trading flows are localized.
*   **Action:** Extract all hardcoded strings from `src/components/shared/TpSlEditModal.svelte` to `src/locales/locales/en.json` (namespace `tpslEditModal`).
*   **Verification:** Switch language to German/English and verify modal text updates dynamically.

## Priority 2: Stability & Resilience (Medium Impact)

### 3. Harden WebSocket "Fast Path"
**Goal:** Prevent potential precision loss in high-frequency data processing.
*   **Action:** Add a regression test suite `src/services/bitunixWs_fastpath.test.ts`.
*   **Test Case:** Simulate a WebSocket message with a numeric price > `MAX_SAFE_INTEGER` and verify that the "Fast Path" logic handles it gracefully (or falls back to safe parsing).
*   **Refactor:** Encapsulate the "Fast Path" logic into a testable pure function `parseFastPathData(data)`.

### 4. Secure News Proxy Input Validation
**Goal:** prevent malformed requests to upstream providers.
*   **Action:** Implement Zod validation for `params` in `src/routes/api/external/news/+server.ts`.
*   **Action:** Ensure `params` only contains allowed keys (e.g., `currencies`, `filter`, `public`) and correct types.

## Priority 3: Technical Debt & Refactoring (Low Impact)

### 5. Verify Safe JSON Regex
**Goal:** Ensure no edge cases exist in the custom JSON parser.
*   **Action:** Add unit tests for `safeJsonParse` covering scientific notation (`1.23e+30`) and edge cases like keys ending in digits.

## Execution Order
1.  **Trade Service Hardening** (Core Logic Safety)
2.  **i18n Fixes** (User Experience / Safety)
3.  **WebSocket Tests** (Data Integrity)
4.  **News Proxy Validation** (Security)

---
*Approvals:*
- [ ] Lead Developer
- [ ] QA Lead
