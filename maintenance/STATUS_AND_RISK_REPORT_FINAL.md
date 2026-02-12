# Status & Risk Report (Hardening Phase)

## 🔴 CRITICAL RISKS (Addressed)

1.  **Data Integrity in MarketWatcher (Fixed)**
    *   **Issue:** `ensureHistory` filtered `Kline[]` (Decimal objects) using `KlineRawSchema` (expecting strings/numbers). This caused `safeParse` to fail for all valid data, resulting in empty arrays and silent failure of history backfill.
    *   **Fix:** Removed the incorrect schema validation filter for data already processed by `apiService`. Updated `fillGaps` to accept `Kline[]` with Decimals.

2.  **Type Safety in TradeService (Fixed)**
    *   **Issue:** `fetchTpSlOrders` cast API responses to `TpSlOrder[]` without validation. Malformed data could crash the UI or logic.
    *   **Fix:** Introduced `TpSlOrderSchema` (Zod) and implemented `safeParse` validation in `fetchTpSlOrders`, logging warnings for invalid entries.

3.  **API Request Integrity (Fixed)**
    *   **Issue:** `fetchTpSlOrders` could send `undefined` as a symbol in batch requests if the symbol list was empty, potentially causing API errors.
    *   **Fix:** Added explicit check for empty symbol lists and ensured valid parameters.

## 🟡 WARNINGS (Addressed/Mitigated)

1.  **XSS Vulnerability in MarketOverview (Fixed)**
    *   **Issue:** Direct usage of `{@html icons...}` bypassed sanitization.
    *   **Fix:** Refactored to use the `<Icon />` component which implements `DOMPurify`.

2.  **Missing Schema Definitions (Fixed)**
    *   **Issue:** `TpSlOrder` schema was missing despite interface existence.
    *   **Fix:** Added `TpSlOrderSchema` to `src/types/apiSchemas.ts`.

## 🔵 REFACTOR & OBSERVATIONS

1.  **Schema Strategy:** The codebase mixes "Raw" schemas (for API wire format) and "Internal" interfaces (Decimal). This caused the Critical bug #1. Future development must strictly separate "DTO" schemas from "Domain" types.
2.  **Testing Environment:** Unit testing logic involving Svelte files or aliases (`$app/environment`) is difficult with the current `vitest` setup. Recommended to improve test infrastructure to support aliases and Svelte transforms more robustly.
