# Status & Risk Report (Analysis Phase)

## Overview
An in-depth code analysis was performed to assess the codebase against "Institutional Grade" standards. The focus was on data integrity, resource management, UI/UX, and security.

## 🔴 CRITICAL Findings
*Risk of financial loss, data corruption, or critical instability.*

1.  **Data Integrity (CSV Import):**
    *   **File:** `src/services/csvService.ts`
    *   **Issue:** `internalId` is derived using `parseFloat(originalIdAsString)`. If parsing fails or length >= 16, a non-collision-resistant hash (djb2) is used to force a `number`.
    *   **Risk:** External IDs (e.g., from Bitunix) are often alphanumeric strings or BigInts. Forcing them into `number` leads to ID collisions or precision loss, corrupting trade history and linking.
    *   **Action:** Refactor `JournalEntry.id` and internal logic to support `string` IDs.

2.  **Trade Execution Safety:**
    *   **File:** `src/services/tradeService.ts` (`flashClosePosition`)
    *   **Issue:** The "Two Generals Problem" handling removes the optimistic order (`omsService.removeOrder`) if the error is deemed "terminal" (e.g., 400/401).
    *   **Risk:** If a network timeout occurs *after* the server executed the order but *before* the response, the UI will show the position as open (optimistic order removed), leading the user to potentially panic-sell again (double execution).
    *   **Action:** Never remove optimistic orders on ambiguous errors. Force a sync state instead.

3.  **WebSocket Type Safety:**
    *   **File:** `src/services/bitunixWs.ts`
    *   **Issue:** The "Fast Path" optimization bypasses Zod schema validation entirely for high-frequency messages (Price, Ticker). The custom type guards (`isPriceData`) are permissive (checking `typeof v === 'string' || 'number'`).
    *   **Risk:** If the API schema changes (e.g., a field becomes an object or array), the application might crash or process invalid data without the safety net of Zod.
    *   **Action:** Harden the Fast Path guards or implement a sampling validation strategy.

## 🟡 WARNING Findings
*Performance issues, UX flaws, or potential regressions.*

1.  **Resource Management (API & Rate Limiting):**
    *   **File:** `src/services/apiService.ts`
    *   **Issue:** `RateLimiter.waitForToken` uses recursion. Under extreme load or tight limits, this could cause a stack overflow.
    *   **Issue:** `RequestManager` has a hardcoded cache size of 100. This may cause cache thrashing for users tracking many symbols.

2.  **UX / Error Handling:**
    *   **File:** `src/components/shared/TpSlList.svelte`, `src/components/settings/tabs/SystemTab.svelte`
    *   **Issue:** Usage of native `alert()` blocks the UI thread and provides a poor user experience.
    *   **Action:** Replace with `uiState.showError()` or toast notifications.

3.  **Internationalization (I18n):**
    *   **Files:** `TechnicalsPanel.svelte`, `PerformanceMonitor.svelte`, `TpSlEditModal.svelte`, `SidePanel.svelte`.
    *   **Issue:** Numerous hardcoded strings found (e.g., "Trigger Price", "Analysis Time", error messages).
    *   **Action:** Extract strings to `en.json` and use `$_()`.

4.  **Main Thread Blocking:**
    *   **File:** `src/services/marketWatcher.ts` (`ensureHistory`)
    *   **Issue:** The backfill loop uses `await new Promise(r => setTimeout(r, 100))` inside a loop. While async, heavy processing of Klines on the main thread during this loop can cause UI stutter.

## 🔵 REFACTOR Findings
*Technical debt and code smells.*

1.  **Debugging Leftovers:**
    *   **File:** `src/routes/+layout.svelte`
    *   **Issue:** `console.log` statements present in production code.

2.  **Inefficient Serialization:**
    *   **File:** `src/services/tradeService.ts`
    *   **Issue:** `serializePayload` recursively converts Decimals to strings. This is CPU intensive for large objects.

3.  **Inconsistent Types:**
    *   **File:** `src/services/rmsService.ts`
    *   **Issue:** `maxDrawdownPercent` is `number` while other financial fields are `Decimal`.

## Implementation Plan (Next Phase)

The following steps define the execution order for Phase 2:

1.  **Fix Critical Data Integrity (CSV):** Refactor `csvService` and `JournalEntry` to support String IDs.
2.  **Harden Trade Safety:** Improve "Two Generals" handling in `tradeService`.
3.  **Fix UI/UX & I18n:** Replace `alert()` and extract hardcoded strings.
4.  **Cleanup & Optimization:** Remove `console.log`, fix `RateLimiter` recursion.
