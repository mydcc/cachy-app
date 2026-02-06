# Systematic Maintenance & Hardening Report (V2)

**Date:** 2026-05-26
**Auditor:** Jules (Senior Lead Developer)
**Scope:** Full Codebase Scan
**Status:** Analysis Complete

## Executive Summary
The codebase exhibits a critical "Split-Brain" architecture regarding API handling. While the client-side `apiService` has been hardened with `safeJson` and `Decimal` support, the server-side proxy routes (`src/routes/api/orders/+server.ts`) rely on native `response.json()`, creating a vulnerability where large Order IDs (19 digits) are corrupted before they ever reach the frontend. Additionally, CSV import logic compromises data integrity for large IDs.

---

## 🔴 CRITICAL FINDINGS (Risk of Financial Loss / Data Integrity)

### 1. Server-Side Proxy Precision Loss (`src/routes/api/orders/+server.ts`)
*   **Issue:** The server-side handler for order placement, cancellation, and fetching uses `const res = await response.json()` to parse responses from Bitunix/Bitget.
*   **Impact:** Bitunix uses 19-digit IDs (e.g., `1234567890123456789`). JavaScript's native `JSON.parse` (used by `response.json()`) rounds this to the nearest safe integer (15-16 digits), altering the ID.
*   **Consequence:** The frontend receives the wrong Order ID. Subsequent "Cancel" or "Modify" requests will fail or, worse, act on the wrong order if the hash collision occurs.
*   **Fix:** Must read `response.text()` and use `safeJsonParse()` (with string-wrapping for large numbers) for **all** upstream exchange interactions.

### 2. CSV Import ID Corruption (`src/services/csvService.ts`)
*   **Issue:** `parseFloat(originalIdAsString)` is used on the `ID` column.
*   **Impact:** Similar to above, importing a trade history with real exchange IDs will corrupt the IDs if they are large integers. The fallback logic (`isSafe`) generates a random internal ID, breaking the link to the external trade.
*   **Fix:** Do not parse IDs as numbers. Store them strictly as strings in `tradeId` and `orderId` fields.

### 3. Unsafe Order Quantity Logic
*   **Issue:** `src/routes/api/orders/+server.ts` validates `invalid amount` but relies on `formatApiNum` which might return a string representation of a float.
*   **Fix:** Ensure strict `Decimal` validation is passed to the exchange.

---

## 🟡 WARNING FINDINGS (UX, Performance, Missing i18n)

### 1. Hardcoded Strings & Alerts (`src/components/shared/TpSlList.svelte`)
*   **Issue:** Contains hardcoded English strings: `"Cancel this TP/SL order?"`, `"No API keys configured"`.
*   **Issue:** Uses native `confirm()` dialog, which blocks the UI thread and looks unprofessional.
*   **Fix:** Move strings to `src/locales/locales/en.json` and replace `confirm()` with a modal or a "Hold to Cancel" interaction (or at minimum a non-blocking check).

### 2. Console Log Spam (`src/services/marketAnalyst.ts`, `src/routes/+layout.svelte`)
*   **Issue:** `console.log` is used for high-frequency debug info.
*   **Fix:** Replace with `logger.debug` or remove.

---

## 🔵 REFACTOR OPPORTUNITIES

### 1. Server-Side Shared Utils
*   **Issue:** Server routes repeat the same fetch/error handling logic.
*   **Proposal:** Create a `serverApiService` utility that wraps `fetch` with `safeJsonParse` and standardized error logging, mirroring the client-side `apiService`.

---

## Strategic Action Plan (Proposed)

1.  **Immediate Hotfix:** Patch `src/routes/api/orders/+server.ts` to use `safeJsonParse`. (Critical)
2.  **Data Repair:** Patch `src/services/csvService.ts` to handle IDs as strings. (Critical)
3.  **UX Polish:** Externalize strings in `TpSlList.svelte` and remove blocking alerts. (Warning)
4.  **Cleanup:** Sweep `console.log` from production files. (Refactor)
