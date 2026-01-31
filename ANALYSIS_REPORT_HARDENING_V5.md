# Status & Risk Report (Hardening Phase)

## 🔴 CRITICAL (Risk of financial loss, crash, or data inconsistency)

1.  **Duplicate & Inconsistent Data Mapping Logic**
    *   **Location:** `src/services/tradeService.ts` vs `src/services/bitunixWs.ts`.
    *   **Issue:** Both files implement their own mapping logic (`mapPosition` vs `mapToOMSPosition`). They use different fallbacks (e.g., `avgOpenPrice` vs `entryPrice`) and `bitunixWs` forces amount to 0 on CLOSE events, while `TradeService` does not.
    *   **Risk:** Inconsistent state between WebSocket updates and REST syncs can lead to "ghost positions" or incorrect PnL display.
    *   **Fix:** Centralize logic in `src/services/mappers.ts`.

2.  **"All-or-Nothing" Position Sync**
    *   **Location:** `src/services/tradeService.ts` (Lines 173-178).
    *   **Issue:** The `fetchOpenPositionsFromApi` method throws a `TradeError` if *validation* fails for the list.
    *   **Risk:** If the API returns one malformed position (e.g., new field causing schema failure or invalid number), the *entire* account sync fails. The user sees 0 positions instead of N-1 valid ones.
    *   **Fix:** Implement "Best Effort" parsing. Log invalid items but return valid ones.

3.  **Potential Precision Loss in WebSocket**
    *   **Location:** `src/services/bitunixWs.ts`.
    *   **Issue:** While checks exist (`typeof data.lastPrice === 'number'`), they run *after* `JSON.parse`. If the exchange sends a large integer or float, precision is already lost before the check.
    *   **Fix:** We cannot fix `JSON.parse` behavior easily without a custom parser, but we should ensure the centralized mapper handles strings strictly and warns loudly on numbers.

## 🟡 WARNING (UX issues, missing i18n, performance)

1.  **Missing Translation Key**
    *   **Location:** `src/locales/locales/en.json`
    *   **Issue:** Key `settings.candlestickPatterns.title` exists in German but is missing in English.
    *   **Fix:** Add missing key.

2.  **Hardcoded Price Step Logic**
    *   **Location:** `src/components/inputs/TradeSetupInputs.svelte`
    *   **Issue:** Logic `entryPrice > 1000 ? 0.5 : 0.01` is insufficient for low-sat coins (e.g., PEPE at 0.000001).
    *   **Fix:** Implement dynamic step based on `marketState` tick size or magnitude (log10).

3.  **Complex Polling Logic**
    *   **Location:** `src/services/marketWatcher.ts`
    *   **Issue:** High complexity with multiple timers (`staggerTimeouts`, `unlockTimeouts`). While defensive, it increases maintenance burden.
    *   **Fix:** (Postpone) Keep as is for now as it appears robust, but monitor for race conditions.

## 🔵 REFACTOR (Technical Debt)

1.  **Missing `mappers.ts`**
    *   **Issue:** Previous documentation/memory referred to `src/services/mappers.ts`, but it does not exist.
    *   **Fix:** Create it (part of Critical fix #1).
