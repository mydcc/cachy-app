# Status & Risk Report: Institutional Grade Hardening

**Date:** 2026-05-25
**Auditor:** Senior Lead Developer (Jules)
**Scope:** `src/services`, `src/stores`, `src/components`

## Executive Summary
The codebase demonstrates a high level of maturity in certain areas (WebSocket performance, input validation, DOM sanitization), but contains **critical flaws** in data integrity regarding external IDs and order execution resilience.

## 🔴 CRITICAL FINDINGS (Immediate Action Required)

### 1. Data Integrity: Snowflake ID Corruption in CSV Import
*   **Location:** `src/services/csvService.ts`
*   **Issue:** The service forces imported "ID" fields into JavaScript `number` types using `parseFloat`. For large IDs (like Snowflake IDs used by Bitunix/Bitget, > 15 digits), it explicitly detects the overflow risk but "solves" it by hashing the ID into a smaller number:
    ```typescript
    if (... !Number.isSafeInteger(parseFloat(originalIdAsString))) {
        // ... hash = (hash * 33) ^ originalIdAsString.charCodeAt(i); ...
        internalId = Math.abs(hash >>> 0);
    }
    ```
*   **Risk:** This destroys the original ID. It makes it impossible to reconcile CSV data with the actual exchange data or database later. Collisions are guaranteed at scale.
*   **Recommendation:** All IDs must be treated as `string`. Remove the `number` enforcement and the hashing logic. Update `JournalEntry` interface to accept `string` for `id`.

### 2. Execution Logic: "Two Generals Problem" in Flash Close
*   **Location:** `src/services/tradeService.ts` (`flashClosePosition`)
*   **Issue:** The code acknowledges a critical risk but handles it unsafely:
    ```typescript
    // HARDENING: Two Generals Problem.
    // If request fails (timeout/network), order might be live.
    // Do NOT remove optimistic order...
    // omsService.removeOrder(clientOrderId); <--- UNSAFE
    ```
    While it attempts to "keep optimistic order", the logic flow is complex and relies on a "Best Effort" cancellation that might fail, potentially leaving a "Naked Position" (position closed, but SL/TP orders remain active).
*   **Risk:** Financial loss. If the network times out, the user doesn't know if the position is closed. If they try again, they might open a new opposite position or double close.
*   **Recommendation:** Implement a robust "Reconciliation Queue". If a Flash Close times out, the system must enter a "Syncing" state that blocks further actions until the exact status of that order is confirmed via REST API.

### 3. Data Integrity: LocalStorage Precision Loss
*   **Location:** `src/services/app.ts`
*   **Issue:** The app loads `journal` and `presets` using native `JSON.parse()`:
    ```typescript
    const parsedData = JSON.parse(d);
    ```
*   **Risk:** If `localStorage` contains any large integers (saved previously as numbers or edited manually), they will suffer precision loss immediately upon load, before any validation can run.
*   **Recommendation:** Switch to `safeJsonParse` (from `src/utils/safeJson.ts`) for all `localStorage` reads.

## 🟡 WARNING FINDINGS (Priority Fixes)

### 1. Internationalization (I18n) Gaps
*   **Location:** `src/components/shared/`
    *   `TechnicalsPanel.svelte`: Indicator names ("SuperTrend", "Ichimoku") and labels ("Val:", "Price:") are hardcoded.
    *   `PerformanceMonitor.svelte`: All metric labels ("Memory", "API Calls/min") are hardcoded.
    *   `MarketDashboardModal.svelte`: "Score", "RSI" labels hardcoded.
    *   `ConnectionsTab.svelte`: "API Key" label hardcoded.
*   **Risk:** Poor UX for non-English users. Inconsistent interface.
*   **Recommendation:** Extract all strings to `src/locales/locales/en.json` and use `$_` key lookup.

### 2. API Error Leakage & Status Codes
*   **Location:** `src/routes/api/orders/+server.ts`
*   **Issue:** The server wraps upstream exchange errors and returns them as HTTP 500:
    ```typescript
    return json({ error: sanitizedMsg, code: errorCode ... }, { status: 500 });
    ```
*   **Risk:**
    1.  **Semantics:** HTTP 500 implies "Internal Server Error" (code crash), triggering generic error pages in clients. Exchange errors (e.g., "Insufficient Balance") should be HTTP 400 (Bad Request) or 422 (Unprocessable Entity).
    2.  **Localization:** The `sanitizedMsg` is the English text from the exchange. The Frontend displays this directly. This breaks I18n.
*   **Recommendation:** Map common exchange error codes to internal I18n keys (e.g., `apiErrors.insufficientBalance`). Return appropriate HTTP status codes (4xx for user errors, 502 for upstream errors).

## 🔵 REFACTOR (Technical Debt)

### 1. WebSocket Validation Duplication
*   **Location:** `src/services/bitunixWs.ts` vs `src/services/mdaService.ts`
*   **Issue:** The "Fast Path" in `bitunixWs` manually casts fields to strings (`typeof data.ip === 'number' ? String(data.ip) : ...`) to avoid Zod overhead. `mdaService` does similar normalization.
*   **Recommendation:** This duplication is currently acceptable for performance, but creates a maintenance risk if API shapes change. Ensure `mdaService.normalizeTicker` is always the "Source of Truth" for data shape, even if `bitunixWs` does the raw type protection.

## Security & Performance Audit
*   **Sanitization:** ✅ `DOMPurify` is correctly implemented in `sanitizer.ts` and `markdownUtils.ts`.
*   **Input Validation:** ✅ `TradeSetupInputs` uses strict regex validation.
*   **Resource Management:** ✅ `MarketWatcher` uses recursive `setTimeout` (good). `MarketManager` enforces buffer limits (good).
*   **Float Safety:** ✅ `TradeService` uses `Decimal.js` correctly. `safeJson.ts` protects network payloads.

## Next Steps (Step 2: Action Plan)
1.  **Fix CSV Import:** Rewrite `JournalEntry` ID typing and parsing logic.
2.  **Fix LocalStorage:** Replace `JSON.parse` with `safeJsonParse`.
3.  **Hardening:** Implement "Reconciliation Queue" for TradeService.
4.  **I18n:** Extract missing keys.
