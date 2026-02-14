# Status & Risk Report (Forensic Audit)

## 🔴 CRITICAL (Risk of Crash / Leak / Data Loss)

1.  **Memory Leak in `technicalsWorker.ts` (Worker State):**
    -   The `stateMap` grows indefinitely with every new symbol/timeframe initialized (`INITIALIZE` message). There is no mechanism to remove entries (`DELETE` or cleanup message). Over days of runtime, this will crash the worker (OOM).
    -   **Fix:** Implement a `CLEANUP` message type and handle LRU eviction in the worker.

2.  **Performance/GC Thrashing in `technicalsWorker.ts` (Calculation Loop):**
    -   The `klineBuffer` reallocation logic is flawed: `if (klineBuffer.length !== len)`. In live trading, `len` grows by 1 every candle update, causing a complete reallocation of the buffer on *every single update*.
    -   Inside the loop, `k.open = new Decimal(...)` allocates 5 new `Decimal` objects per candle per calculation. This defeats the purpose of the reusable `klineBuffer` (which only reuses the container object, not the values).
    -   **Fix:** Use `klineBuffer.length < len` to only grow when needed. Use `Decimal.clone()` or update internal values if possible (hard with immutable Decimal), or accept object churn but fix the array allocation.

3.  **Resource Leak in `technicalsCalculator.ts` (BufferPool):**
    -   In `calculateIndicatorsFromArrays`, buffers are acquired from `BufferPool` but only released at the very end. If any indicator calculation throws an exception (e.g., `JSIndicators.stoch`), the `cleanupBuffers` are never released, permanently leaking memory from the pool.
    -   **Fix:** Wrap the entire calculation block in a `try...finally` to ensure `pool.release` is called.

4.  **Inefficient Aggregation in `apiService.ts` (Bitunix Klines):**
    -   In `fetchBitunixKlines`, the synthetic aggregation loop converts `high` (Decimal) to `string` via `high.toString()`. The consumer (`marketWatcher`) then converts it back to `Decimal`. This double conversion is unnecessary overhead on a hot path.
    -   **Fix:** Pass `Decimal` directly or use `toString()` only if strict JSON serialization is required (but internal passing should be efficient).

## 🟡 WARNING (Logic / Validation / UX)

1.  **Unsafe Type Casting in `tradeService.ts`:**
    -   `TpSlOrder` interface uses `[key: string]: any`.
    -   `fetchTpSlOrders` casts API response `as TpSlOrder[]` without validation. If the API schema changes, the app will crash at runtime when accessing missing properties.
    -   **Fix:** Use `zod` schemas for `TpSlOrder` validation.

2.  **Object Spread in Hot Path (`market.svelte.ts`):**
    -   `updateSymbol` uses `this.pendingUpdates.set(symbol, { ...existing, ...partial });`. This creates a new object for every single price update. In high-frequency markets, this generates significant garbage.
    -   **Fix:** Mutate the existing object if it exists.

3.  **Swallowed Errors in `api/orders/+server.ts` (Bitget):**
    -   `fetchBitgetHistoryOrders` returns `[]` on failure. Users will see an empty history instead of an error message ("Failed to load history").
    -   **Fix:** Throw/propagate errors so the UI can show a retry button or error state.

4.  **Manual Validation in `api/account/+server.ts`:**
    -   The endpoint manually checks `if (!body || ...)` instead of using Zod. This is inconsistent with `orders/+server.ts` and error-prone.
    -   **Fix:** Implement `AccountRequestSchema` with Zod.

5.  **Hardcoded Strings (I18n):**
    -   `src/routes/+page.svelte`: "Trigger Quantum Pulse", "GitHub", "Deepwiki", "Favorites" (fallback).
    -   **Fix:** Extract to `en.json` / `de.json`.

6.  **Leftover Debug Code in `bitunixWs.ts`:**
    -   `subscribe` method contains `if (import.meta.env.DEV && channel.includes("20m"))`. This looks like temporary debug code that should be removed.

## 🔵 REFACTOR (Technical Debt)

1.  **Mixed Logic in API Routes:**
    -   `src/routes/api/orders/+server.ts` contains massive switch-case logic for Bitunix vs Bitget.
    -   **Fix:** Extract `BitunixService` and `BitgetService` (server-side) to handle exchange-specific logic, leaving the controller clean.

2.  **Inefficient Parsing in `technicalsCalculator.ts`:**
    -   `parseFloat(k.high.toString())` is used inside loops. If `k.high` is Decimal, `.toNumber()` is much faster.
    -   **Fix:** Use `.toNumber()` for Decimals.

3.  **`klineBuffer` usage in `technicalsWorker.ts`:**
    -   The worker tries to be stateless (`CALCULATE`) but also supports stateful (`UPDATE`). The mixing of these patterns with a global `klineBuffer` (which is only used for `CALCULATE`) is confusing and prone to race conditions if the worker handles concurrent messages (though JS is single-threaded, the logic is brittle).
