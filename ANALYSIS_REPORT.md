# Status & Risk Report (Step 1 Complete)

## 🔴 CRITICAL (High Risk)
1.  **Optimistic PnL Display Glitch (`TradeService.ts`):**
    *   **Issue:** `flashClosePosition` uses `marketState.data[symbol]?.lastPrice || new Decimal(0)` for the optimistic order price. If market data is stale or missing (e.g., fresh load), this defaults to 0.
    *   **Impact:** The UI shows a -100% PnL instantly for the closing order, causing user panic, even though the actual market order executes correctly on the backend.
    *   **Fix:** Ensure ticker freshness (`ensurePositionFreshness`) before creating the optimistic record.

2.  **WebSocket Schema Drift Risk (`bitunixWs.ts`):**
    *   **Issue:** The "Fast Path" optimization manually casts fields (e.g., `data.ip`, `data.lastPrice`) to avoid Zod overhead. It lacks explicit existence checks for these fields before access.
    *   **Impact:** If the API schema changes (e.g., nesting or renaming), this logic may fail silently (caught by try-catch) or return `undefined`, leading to stale or missing UI data without clear errors.
    *   **Fix:** Add explicit field existence checks (`if (data.ip !== undefined) ...`) within the Fast Path.

3.  **Brittle Error Handling (`TradeService.ts`):**
    *   **Issue:** `flashClosePosition` checks for `e.message.includes("400")` to confirm API failure.
    *   **Impact:** If the error message format changes (e.g., localization or upstream API change), this check fails, potentially leaving the app in a "hanging" optimistic state.
    *   **Fix:** Use strict error codes (`e.code`) from `BitunixApiError`.

## 🟡 WARNING (Medium Risk / UX)
1.  **Main Thread Blocking (`Aggregator.ts`):**
    *   **Issue:** `getJournalAnalysis` runs heavy synchronous stats calculations.
    *   **Impact:** Large journals (>1000 trades) will freeze the UI during calculation.
    *   **Fix:** Offload to `src/workers/stats.worker.ts`.

2.  **Unsafe Parameter Serialization (`tpsl/+server.ts`):**
    *   **Issue:** `cleanParams[k] = String(params[k])` converts nested objects to `"[object Object]"`.
    *   **Impact:** Complex filter parameters or metadata objects will be corrupted.
    *   **Fix:** Use `JSON.stringify` for objects or recursive flattening.

3.  **Hardcoded Strings (I18n):**
    *   **Issue:** Found in `TechnicalsPanel`, `PerformanceMonitor`, `TradeFlowBackground`, `WindowFrame`.
    *   **Impact:** Poor UX for non-English users; maintenance burden.
    *   **Fix:** Extract to `locales/en.json`.

4.  **Accessibility Gaps:**
    *   **Issue:** `TradeFlowBackground` status overlays lack `role="status"`/`aria-live`. `Canvas` lacks fallback.
    *   **Impact:** Screen reader users miss critical status updates.
    *   **Fix:** Add ARIA attributes.

## 🔵 REFACTOR (Technical Debt)
1.  **Listener Memory Leak (`bitunixWs.ts`):**
    *   **Issue:** `tradeListeners` uses a `Set` of callbacks. Anonymous functions passed by components cannot be unsubscribed.
    *   **Fix:** Return a unique unsubscribe function from `subscribeTrade`.

---

# Action Plan (Step 2 - Planning Phase)

Based on the findings, the following implementation plan is proposed:

### Group 1: Critical Logic Hardening (Data Integrity)
1.  **Refactor `TradeService.flashClosePosition`**:
    *   Implement `ensurePositionFreshness` check before optimistic update.
    *   Replace string-based error checks with `e.code` validation.
    *   *Test*: Simulate API error and verify optimistic order removal.
2.  **Harden `bitunixWs` Fast Path**:
    *   Add explicit field existence checks.
    *   Add "Schema Drift Warning" log if Fast Path fails but Zod validation succeeds.
    *   *Test*: Unit test with malformed payloads.

### Group 2: Performance & Resource Management
3.  **Offload Aggregator to Worker**:
    *   Move `getJournalAnalysis` to `src/workers/stats.worker.ts`.
    *   Update `Journal.svelte` to use async worker messaging.
4.  **Fix WebSocket Listener Leak**:
    *   Refactor `subscribeTrade` to return an `unsubscribe` function.
    *   Update `TradeFlowBackground.svelte` to use the returned unsubscriber.

### Group 3: Security & UX/I18n
5.  **Secure API Parameters**:
    *   Update `tpsl/+server.ts` to safely serialize objects (`JSON.stringify`).
6.  **Externalize Strings & A11y**:
    *   Extract hardcoded strings to `locales/en.json` & `de.json`.
    *   Add ARIA attributes to `TradeFlowBackground`.
