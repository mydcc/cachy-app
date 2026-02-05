# Systematic Maintenance & Hardening Report

**Date:** 2026-05-26
**Auditor:** Jules (Senior Lead Developer)
**Status:** In-Progress

## Executive Summary
The codebase is in a mature state with strong foundations in WebSocket handling and resource management (e.g., `MarketWatcher` optimization). However, critical vulnerabilities exist regarding data integrity, specifically handling large numbers (precision loss) and CSV imports. UX inconsistencies (use of `alert()`) also degrade the "institutional grade" feel.

---

## 🔴 CRITICAL FINDINGS (Risk of Financial Loss / Data Integrity)

### 1. CSV Import: ID Collision & Precision Loss (`src/services/csvService.ts`)
*   **Issue:** The service attempts to parse `ID` as a number via `parseFloat`. If the ID is too large (>= 16 chars) or not a safe integer, it hashes the ID using `djb2` (a non-cryptographic hash).
*   **Risk:** `djb2` is not collision-resistant. Two different external Trade IDs could result in the same internal ID, causing data overwrite or corruption in the journal.
*   **Recommendation:** Treat IDs strictly as `string`. Do not force them into `number`. If the internal DB requires a number, generate a new unique internal ID (UUID/Auto-inc) and store the external ID in a separate `tradeId` or `externalId` field without hashing.

### 2. API Service: Unsafe JSON Parsing (`src/services/apiService.ts`)
*   **Issue:** `fetchTicker24h` uses the native `response.json()` method.
*   **Risk:** High-volume tokens (e.g., PEPE, SHIB) or large market caps can exceed the 15-digit precision limit of JavaScript `number` types. This leads to silent data corruption (e.g., `12345678901234567` becomes `12345678901234568`).
*   **Recommendation:** Replace with `apiService.safeJson(response)`.

### 3. API Error Handling: Unsafe JSON Parsing (`src/routes/api/orders/+server.ts`)
*   **Issue:** The proxy endpoint parses exchange error responses using `JSON.parse(text)`.
*   **Risk:** If an exchange returns a numeric error code or detail that exceeds safe integer limits, or if the response is not valid JSON (e.g., 502 Bad Gateway HTML), this will throw an unhandled exception 500.
*   **Recommendation:** Use `safeJsonParse` and handle parsing errors gracefully.

### 4. State Persistence: Unsafe JSON Parsing (`src/stores/trade.svelte.ts`)
*   **Issue:** `JSON.parse(JSON.stringify(...))` pattern used for deep cloning state.
*   **Risk:** Precision loss for any `Decimal` or large number stored in the state.
*   **Recommendation:** Use `structuredClone()` (available in modern environments) or a custom deep clone that respects types.

---

## 🟡 WARNING FINDINGS (UX, Performance, Minor Risks)

### 1. UX: Blocking Alerts
*   **Issue:** The native `alert()` function is used in `TpSlList.svelte`, `SystemTab.svelte`, and `VisualsTab.svelte`.
*   **Risk:** `alert()` blocks the main thread and creates a poor, non-professional user experience.
*   **Recommendation:** Replace all instances with `toastService.error()` / `toastService.success()`.

### 2. WebSocket: Precision Warnings
*   **Issue:** `BitunixWebSocketService` relies on `typeof === 'number'` checks in the "Fast Path".
*   **Risk:** While performant, it emits console warnings in DEV if precision loss is detected. This is acceptable for now but should be monitored.

### 3. Hardcoded Strings (i18n)
*   **Issue:** Several components (e.g., `MarketDashboardModal`) construct UI strings dynamically without `svelte-i18n`.
*   **Recommendation:** Enforce usage of `$t(...)` for all user-facing text.

---

## 🔵 REFACTOR OPPORTUNITIES

### 1. Unified Safe JSON
*   **Proposal:** Ensure `src/utils/safeJson.ts` is the single source of truth for all JSON parsing operations involving external data.

### 2. Toast Service Standardization
*   **Proposal:** Ensure all services use the singleton `toastService` instead of ad-hoc error handling.

---

## Next Steps (Action Plan)

1.  **Fix Data Integrity:** Patch `csvService` and `apiService` immediately.
2.  **Harden API:** Update `orders/+server.ts` to be resilient.
3.  **Improve UX:** Swap `alert()` for Toasts.
4.  **Verify:** Run regression tests on CSV import and Trade execution.
