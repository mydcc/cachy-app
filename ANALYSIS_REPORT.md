# System Hardening & Maintenance Report

## 🔴 CRITICAL (Immediate Action Required)

1.  **Race Condition in `TradeService.flashClosePosition`**
    *   **Location:** `src/services/tradeService.ts`
    *   **Issue:** The method creates an optimistic order (`omsService.addOptimisticOrder`) before sending the API request. If the request fails (e.g., timeout), the code logs a warning ("Two Generals Problem") and triggers a sync, but does not explicitly mark the optimistic order as failed or remove it if the API definitely failed (e.g. 400 Bad Request vs 504 Timeout). This can lead to "Ghost Orders" remaining in the UI.
    *   **Risk:** User sees a closed position that is actually still open, or vice versa.

2.  **Implicit Decimal Serialization in API Calls**
    *   **Location:** `src/services/tradeService.ts` (`signedRequest`)
    *   **Issue:** The `payload` containing `Decimal` objects is passed directly to `JSON.stringify`. While `Decimal.js` has a `toJSON()` method, relying on implicit serialization for financial data is risky. If a `Decimal` is nested in a plain object without proper prototype handling, it might serialize incorrectly.
    *   **Risk:** Sending `{ qty: "10" }` (string) vs `{ qty: 10 }` (number) or `{ qty: { s: 1, e: ... } }` depending on implementation details.

3.  **Potential Precision Loss in Technicals Worker**
    *   **Location:** `src/services/technicalsService.ts`
    *   **Issue:** Input data (`Decimal`) is converted to native `number` via `.toNumber()` before being sent to the Web Worker.
    *   **Risk:** While acceptable for oscillators (RSI), this is dangerous for price-sensitive overlays (Moving Averages, Bollinger Bands) on low-value coins (e.g., SHIB at 0.00000888), where floating point errors can distort signals.

4.  **Synchronous Cache Writes Blocking UI**
    *   **Location:** `src/services/newsService.ts` (`safeWriteCache`)
    *   **Issue:** `localStorage.setItem` is called synchronously with `JSON.stringify` on potentially large news datasets.
    *   **Risk:** UI freezing during news updates.

## 🟡 WARNING (High Priority)

1.  **Missing i18n (Hardcoded Strings)**
    *   **Location:** `src/components/settings/CalculationSettings.svelte`, `src/components/settings/tabs/VisualsTab.svelte`
    *   **Issue:** Extensive use of hardcoded English text for labels, descriptions, and tooltips.
    *   **Risk:** Poor UX for non-English users; maintenance nightmare.

2.  **MarketWatcher Lock Staling**
    *   **Location:** `src/services/marketWatcher.ts`
    *   **Issue:** The safety valve `if (this.fetchLocks.size > 200)` suggests an underlying issue where locks are not cleared correctly in edge cases (e.g., if a component unmounts mid-fetch or if `finally` block logic is somehow bypassed by a crash).
    *   **Risk:** Memory leak and polling cessation for specific symbols.

3.  **Fast Path Type Safety**
    *   **Location:** `src/services/bitunixWs.ts`
    *   **Issue:** The "Fast Path" optimization bypasses Zod validation. While a `dev`-only check exists for numeric precision, production builds blindly trust the WebSocket data structure.
    *   **Risk:** If the exchange changes the API schema (e.g., `lastPrice` becomes a number instead of string), the app will crash or calculate wrong PnL.

## 🔵 REFACTOR (Technical Debt)

1.  **Duplicate/Legacy Code in TradeState**
    *   **Location:** `src/stores/trade.svelte.ts`
    *   **Issue:** Hardcoded default strings ("1000", "1") inside the initial state rather than derived constants or user config.
    *   **Risk:** Inconsistency if defaults need to change.

2.  **Complex Component Logic**
    *   **Location:** `src/components/shared/MarketOverview.svelte`
    *   **Issue:** Component mixes UI logic, data subscription management (`activeTechnicalsManager`), and animation logic.
    *   **Risk:** Hard to test and maintain.
