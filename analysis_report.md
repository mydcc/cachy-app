# Status & Risk Report (Step 1)

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1.  **Bitunix WebSocket Kline "Fast Path" Safety Violation**
    *   **Location:** `src/services/bitunixWs.ts` (Lines ~378)
    *   **Issue:** The "Fast Path" optimization for Klines performs an unsafe cast `const d = data as any;` and accesses properties (`d.close`, `d.c`) without Zod validation. If the API schema changes or sends malformed data, this could crash the WebSocket handler or pollute the store with invalid data.
    *   **Risk:** Application crash or corrupted chart data leading to incorrect trading decisions.

2.  **Bitget WebSocket Candle Parsing**
    *   **Location:** `src/services/bitgetWs.ts` (Lines ~360)
    *   **Issue:** Candle data is manually mapped (`msg.data.map(...)`) without Zod validation. It assumes specific array indices (`k[0]`, `k[1]`, etc.) exist.
    *   **Risk:** Crash if Bitget changes the array format or sends empty arrays.

3.  **MarketWatcher `fillGaps` Logic Error**
    *   **Location:** `src/services/marketWatcher.ts` (Lines ~380)
    *   **Issue:** The loop calculates `diff = curr.time - prev.time`. If `klines` are not strictly sorted by time, this calculation is invalid. While `ensureHistory` attempts to sort, `fillGaps` does not enforce it, and other callers might pass unsorted data.
    *   **Risk:** Infinite loops or incorrect gap filling if data is out of order.

4.  **TradeService `flashClosePosition` Optimistic Price**
    *   **Location:** `src/services/tradeService.ts`
    *   **Issue:** Uses `marketState.data[symbol]?.lastPrice || new Decimal(0)` for optimistic orders. If market data is missing, the user sees an order closing at price "0".
    *   **Risk:** Extreme user confusion/panic during high-volatility events (when market data might lag).

## 🟡 WARNING (Performance issue, UX error, missing i18n)

1.  **Hardcoded Error Strings (Missing i18n)**
    *   **Location:** `src/routes/api/**/*`, `src/routes/+layout.svelte`
    *   **Issue:** Numerous error messages are hardcoded in English (e.g., "Bitunix API error", "Internal Server Error"). `uiState.showError` does not perform translation, so these strings are displayed directly to the user.
    *   **Impact:** Poor UX for non-English users.

2.  **MarketWatcher Synchronous Loop Blocking**
    *   **Location:** `src/services/marketWatcher.ts` (`fillGaps`)
    *   **Issue:** `MAX_GAP_FILL` is 5000. In a worst-case scenario (huge gap), the synchronous loop could block the main thread for several milliseconds, causing UI jank.
    *   **Impact:** UI unresponsiveness.

3.  **NewsService "Old News" Fetch Logic**
    *   **Location:** `src/services/newsService.ts`
    *   **Issue:** `shouldFetchNews` returns `true` if the *oldest* news item is older than `MAX_NEWS_AGE_MS`. This is almost always true for a populated list, leading to unnecessary re-fetches.
    *   **Impact:** Wasted bandwidth and API quota.

## 🔵 REFACTOR (Code smell, technical debt)

1.  **Bitget WebSocket Maturity**
    *   **Location:** `src/services/bitgetWs.ts`
    *   **Issue:** Lacks the robustness features of `bitunixWs.ts` (Reference counting, Fast Path, Synthetic Subscriptions). It uses a simple `subscriptions` map.
    *   **Impact:** Harder to maintain and less reliable than the Bitunix implementation.

2.  **TradeService `cancelAllOrders` Error Swallowing**
    *   **Location:** `src/services/tradeService.ts`
    *   **Issue:** Errors during "Cancel All" are swallowed. While this is intentional (Cancel-on-Close), it should be logged more explicitly or handled via a dedicated error state to inform the user that their orders *might* still be open.
