# Status & Risk Report: cachy-app

## 🔴 CRITICAL (High Risk of Loss / Crash / Security)

1.  **WebSocket "Fast Path" Validation Bypass (`src/services/bitunixWs.ts`)**
    *   **Risk:** The "Fast Path" optimization manually parses `price`, `ticker`, and `depth` messages to skip Zod validation for performance. It uses `typeof val === 'number'` checks and casts to string, but relies on the API structure never changing. If Bitunix changes a field type (e.g., `lastPrice` becomes an object or null), the fast path might crash or inject invalid data into `MarketState`.
    *   **Finding:** `isPriceData`, `isTickerData` guards are present but basic. `marketState.updateSymbol` handles `undefined`, but if `parseFloat` or `Decimal` constructor receives garbage, it could throw or create `NaN`.
    *   **Recommendation:** Strengthen `isSafe` type guards to explicitly reject `NaN`, `Infinity`, and non-finite numbers. Wrap `new Decimal()` in a try-catch block within the Fast Path or use `safeDecimal` helper.

2.  **Market Buffer Memory Management (`src/stores/market.svelte.ts`)**
    *   **Risk:** `pendingKlineUpdates` is a `Map<string, any[]>`. While there is a `KLINE_BUFFER_HARD_LIMIT` (2000), if `flushUpdates` fails or halts (e.g., due to a UI thread freeze), this buffer could grow until OOM.
    *   **Finding:** The flush interval runs every 250ms. If the tab is backgrounded, timers might throttle.
    *   **Recommendation:** Implement a strict size cap on `pendingKlineUpdates` that force-clears the oldest updates if the limit is reached, independent of the flush timer.

3.  **Optimistic Order ID Collision (`src/services/tradeService.ts`)**
    *   **Risk:** `clientOrderId` for optimistic orders is generated using `Date.now() + Math.random()`. In high-frequency trading scenarios or rapid clicking, collisions are theoretically possible, which could overwrite local state or confuse the OMS.
    *   **Recommendation:** Use `crypto.randomUUID()` or a monotonic counter for strictly unique IDs.

## 🟡 WARNING (UX / Performance / Maintenance)

1.  **Missing Internationalization (i18n)**
    *   **Risk:** Multiple components contain hardcoded English (and some German) strings, making the app unprofessional for a global audience.
    *   **Locations:**
        *   `src/components/shared/PerformanceMonitor.svelte`: "High analysis time detected...", "Thinking...", "active".
        *   `src/components/shared/SidePanel.svelte`: "Vorgeschlagene Änderungen", "Generative AI Quota exceeded...".
        *   `src/components/settings/tabs/VisualsTab.svelte`: "Min Trade Volume ($)".
        *   `src/components/settings/tabs/ConnectionsTab.svelte`: "Server Security".
        *   `src/components/shared/windows/WindowFrame.svelte`: "A-", "A+".

2.  **API Key Handling in Logs (`src/routes/api/orders/+server.ts`)**
    *   **Risk:** While there is redaction logic (`sanitizedBody.apiKey = "***"`), the catch block logs `console.error(..., errorMsg)`. If `errorMsg` comes directly from an upstream API that echoes back the request (including headers/body) in the error message, keys could leak into server logs.
    *   **Recommendation:** Ensure `errorMsg` is also sanitized before logging.

3.  **Decimal.js Consistency**
    *   **Risk:** `MarketManager` stores `Decimal | null`. Some parts of the app might expect `number`. `BitunixWs` casts to string before Decimal.
    *   **Recommendation:** strictly enforce `Decimal` in all interfaces. Ensure `BitunixWs` *always* converts to string before Decimal creation to avoid precision loss from JS numbers.

## 🔵 REFACTOR (Technical Debt)

1.  **MarketWatcher History Locks**
    *   `historyLocks` is a `Set<string>`. If `ensureHistory` promise never settles (e.g., strict deadlock), the lock remains forever.
    *   **Recommendation:** Add a timeout to the lock or use a `Map<string, number>` (timestamp) to expire old locks.

2.  **Manual JSON Parsing in BitunixWs**
    *   The manual parsing logic in `BitunixWs` is complex and duplicates Zod schema logic. It is a maintenance burden.
    *   **Recommendation:** Isolate this logic into a separate `MessageParser` class with unit tests ensuring it matches the Zod schema behavior.

## Summary

The codebase is generally high quality with strong attention to performance (buffers, fast paths) and safety (Decimal.js). The primary risks are centered around the "Fast Path" optimizations (trading safety for speed) and UI/i18n completeness.
