# Status & Risk Report (Institutional Grade Audit)

## 1. Data Integrity & Mapping

### 🔴 CRITICAL: OMS Synchronization Gap
*   **Location:** `src/services/bitunixWs.ts`, `src/services/tradeService.ts`, `src/services/omsService.ts`
*   **Issue:** `bitunixWs.ts` updates `accountState` on WebSocket `position` events but **does not** update `omsService`.
*   **Impact:** `tradeService.closePosition` relies exclusively on `omsService.getPositions()`. If a position changes (e.g., partial fill, liquidation, or opened on another device) and the WS updates `accountState`, `omsService` remains stale. The user **cannot close the position** via the UI because the service believes it doesn't exist or has the wrong size.
*   **Risk:** Financial Loss (Inability to exit trade).

### 🔴 CRITICAL: Missing Fallback in Trade Execution
*   **Location:** `src/services/tradeService.ts` (`closePosition`)
*   **Issue:** The method throws `TRADE_ERRORS.POSITION_UNKNOWN` immediately if `omsService` is empty. It lacks the intended fallback to `accountState` or a fresh API fetch.
*   **Risk:** Denial of Service for critical functionality.

### 🟡 WARNING: Type Mismatch in State
*   **Location:** `src/components/inputs/GeneralInputs.svelte` vs `src/stores/trade.svelte.ts`
*   **Issue:** `GeneralInputs` parses leverage as `number` (`parseFloat`), but `tradeState` and `Zod` schemas define it as `string`.
*   **Impact:** Potential runtime errors if `Decimal.js` or other consumers expect a string and get a number (or vice versa during serialization).

## 2. Resource Management & Performance

### 🔵 REFACTOR: WebSocket "Fast Path" Complexity
*   **Location:** `src/services/bitunixWs.ts`
*   **Issue:** The "Fast Path" optimization manually parses objects to skip Zod validation. While performant, it duplicates logic and increases maintenance burden.
*   **Status:** Currently functioning with fallback, but risky for future updates.

### 🔵 REFACTOR: Unused Metrics History
*   **Location:** `src/stores/market.svelte.ts`
*   **Issue:** `metricsHistory` is defined in the type but commented out in logic.
*   **Recommendation:** Remove dead code to clarify intent.

## 3. UI/UX & Barrierefreiheit (A11y)

### 🟡 WARNING: Hardcoded Strings (No i18n)
*   **Location:** `src/components/inputs/GeneralInputs.svelte`
*   **Issue:** Labels like "Leverage", "Fees (%)" and tooltips ("Synced with API") are hardcoded.
*   **Impact:** Non-English users see mixed languages.

### 🟡 WARNING: Silent Failure in Bitget History
*   **Location:** `src/routes/api/orders/+server.ts`
*   **Issue:** `fetchBitgetHistoryOrders` catches errors and returns `[]` (empty list).
*   **Impact:** User thinks they have no history when actually the API might be down or credentials invalid.

## 4. Security & Validation

### ✅ PASS: Input Sanitization
*   `src/routes/api/orders/+server.ts` uses `cleanPayload` and explicitly validates/redacts keys.
*   `tradeService.ts` explicitly checks `amount.lte(0)`.

### ✅ PASS: Arithmetic Safety
*   Codebase consistently uses `Decimal.js` for financial calculations.

---

## Action Plan (Summary)

1.  **Fix OMS Sync (Priority 1):** Ensure `bitunixWs.ts` updates `omsService` alongside `accountState`.
2.  **Harden Close Position (Priority 1):** Add fallback to `tradeService.closePosition` to check `accountState` or fetch from API.
3.  **Fix I18n & Types (Priority 2):** Externalize strings in `GeneralInputs` and fix `leverage` type consistency.
4.  **Improve Error Handling (Priority 3):** Stop swallowing Bitget errors.
