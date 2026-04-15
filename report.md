# In-Depth Code Analysis Report - Cachy-App

This report documents the status quo of the Cachy-App codebase, identifying vulnerabilities and areas for improvement to achieve an "institutional grade" standard.

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

*   **`src/services/tradeService.ts` - `closePosition` amount validation:**
    *   **Finding:** The function `closePosition` accepts an `amount` as an optional parameter. If an `amount` is passed, it takes its `toString()` without converting or ensuring it is a Decimal representation, directly mapping the object `amount.toString()`. The method expects a `Decimal` type per interface but it's not strictly enforced during API calls payload construction, risking scientific notation serialization (e.g., `1e-8`) which most exchanges reject, potentially causing order rejection during a critical close.
    *   **Recommendation:** Strictly parse all user inputs and api payload string conversions via Decimal methods that prevent scientific notation (e.g. `decimalObj.toFixed(precision)` or `decimalObj.toDecimalPlaces(precision, Decimal.ROUND_DOWN)`).
*   **`src/services/marketWatcher.ts` - `ensureHistory` history locks:**
    *   **Finding:** Backfilling in `ensureHistory` relies on `this.historyLocks.add(lockKey)` to deduplicate requests. However, if the inner try/catch block is bypassed or the process gets stuck on `await this.backfillWorker(symbol, tf)`, the lock might never be released until forced cleanup, leading to broken data states where new history never fetches.
    *   **Recommendation:** Implement timeout mechanisms on locks, or ensure that `finally { this.historyLocks.delete(lockKey); }` is absolutely guaranteed to execute by not having inner unhandled promise rejections.
*   **`src/services/tradeService.ts` - Missing Decimal checks on API payloads:**
    *   **Finding:** In `fetchOpenPositionsFromApi`, items are validated with `PositionRawSchema.safeParse`. However, when sending data to cancel or modify orders, there's no strict schema validation ensuring the payload doesn't contain unexpected `undefined` or `NaN` values that got bypassed earlier in the UI.
    *   **Recommendation:** Introduce explicit Decimal validation for all numeric fields sent to API endpoints.
*   **`src/services/tradeService.ts` - Lack of precise types on API interaction:**
    *   **Finding:** Method `cancelTpSlOrder` expects `order: any` and accesses `order.orderId || order.id`. This is highly risky as an incorrect object structure silently fails to cancel the right order.
    *   **Recommendation:** Strictly type API objects like orders utilizing generic Types. Use `TpSlOrder` interface instead of `any`.

## 🟡 WARNING (Performance issue, UX error, missing i18n)

*   **`src/services/marketWatcher.ts` - `fillGaps` Allocation:**
    *   **Finding:** Gap filling allocates potentially `MAX_GAP_FILL = 5000` empty candles. In a highly volatile or fragmented data stream, this can spam memory. Furthermore, `fillClose = prev.close;` reuses the same Decimal reference, which means updating one modifies all if mutated (though they are treated as immutable, it's a minor risk if anyone changes them).
    *   **Recommendation:** Log when `MAX_GAP_FILL` is triggered. Ensure the system cannot hit out-of-memory states due to a malicious or broken WS payload.
*   **`src/stores/market.svelte.ts` - `$effect` Root cleanup leaks:**
    *   **Finding:** Subscribing to market data using `$effect.root()` correctly tracks, but the returned cleanup function relies on type checking `typeof (cleanup as any).stop === 'function'` instead of using standard Svelte 5 mechanisms effectively. The untracked blocks inside the timeout might cause issues with Svelte's reactivity engine if not cleared promptly.
    *   **Recommendation:** Ensure memory doesn't leak on rapid subscribe/unsubscribe cycles, common in dynamic UI lists.
*   **`src/services/tradeService.ts` - Error messages:**
    *   **Finding:** Generic hardcoded error strings like `"dashboard.alerts.noApiKeys"` are thrown as `Error`. They should utilize centralized constant maps for i18n localization and to prevent test failures.
    *   **Recommendation:** Utilize `TRADE_ERRORS` constants as specified in instructions.
*   **`src/services/newsService.ts` - Array deduplication:**
    *   **Finding:** Sorting and slicing `newsItems` inside `fetchNews` after deduplication is a hot path if the UI forces a refresh. `if (newsItems.length > 100) { newsItems = newsItems.slice(0, 100); }` is simple but could be optimized by inserting in a sorted manner or maintaining a bounded set directly.
    *   **Recommendation:** Minor performance tweak to use an efficient bounded sorted array insertion.
*   **`src/services/tradeService.ts` - API Key leakage in error logs:**
    *   **Finding:** Catching errors from API calls sometimes involves `logger.warn("market", \`TP/SL network error for \${sym}\`, e);`. Ensure `e` does not contain serialized API requests with headers in its prototype or custom properties.
    *   **Recommendation:** Sanitize `e` before passing to the logger.

## 🔵 REFACTOR (Code smell, technical debt)

*   **`src/stores/market.svelte.ts` - Legacy Update Methods:**
    *   **Finding:** `updatePrice`, `updateTicker`, etc. utilize try-catch blocks with empty catch blocks. While performance is okay, it ignores failures in data ingestion which can silently break UI state.
    *   **Recommendation:** Use `logger.error` or `logger.debug` in empty catch blocks to ensure we have visibility into ingestion failures.
*   **`src/services/tradeService.ts` - `any` usage:**
    *   **Finding:** The service contains numerous `any` declarations, such as `let data: any = {};` or `payload: Record<string, any>`.
    *   **Recommendation:** Replace `any` with `unknown` or specific interfaces like `TpSlOrder` to comply with strict typing and defensive programming guidelines.
