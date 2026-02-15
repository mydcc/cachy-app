# Status & Risk Report (Step 1)

This document summarizes the findings from the in-depth code analysis of the `cachy-app` repository.

## 🔴 CRITICAL: Risk of Financial Loss, Crash, or Security Vulnerability

1.  **Data Integrity in `src/services/apiService.ts`**:
    *   **Finding:** The `fetchBitunixKlines` function contains a "Synthetic Aggregation" block that pushes objects with `high: string` into an array typed as `Kline[]` (which expects `Decimal` for `high`). This uses `as any` to bypass TypeScript checks.
    *   **Risk:** Consumers expecting `Decimal` methods (like `.plus()`, `.times()`) on the `high` property will crash at runtime, potentially during critical market data processing.
    *   **Recommendation:** Ensure all properties (`open`, `high`, `low`, `close`, `volume`) are instantiated as `Decimal` objects before adding to the array.

2.  **Runtime Error Risk in `src/services/bitunixWs.ts`**:
    *   **Finding:** The `BitunixWebSocketService` class uses `this.syntheticSubs` in `handleMessage` and `subscribe`, but this property is **not declared** in the class definition. It relies on `// @ts-ignore` to suppress errors.
    *   **Risk:** Accessing an undeclared property works in JavaScript if assigned, but strict mode or minification might cause issues. More importantly, it indicates fragile state management that bypasses type safety.
    *   **Recommendation:** Declare `private syntheticSubs: Map<string, number> = new Map();` in the class.

3.  **Error Handling in `src/routes/api/klines/+server.ts`**:
    *   **Finding:** The `fetchBitunixKlines` function inside this endpoint has a `try-catch` block around `safeJsonParse` that silently swallows errors in one path, potentially leaving `data` undefined or in an inconsistent state before access.
    *   **Risk:** If the API returns malformed JSON (e.g., during an outage or rate limit HTML response), the server might crash or return a 500 error without a helpful message, confusing the frontend.
    *   **Recommendation:** Implement robust error handling that checks for `undefined` data after parsing and throws specific `ApiError` types.

4.  **Type Safety in `src/services/tradeService.ts`**:
    *   **Finding:** The `TpSlOrder` interface uses `[key: string]: unknown`, effectively allowing any property. `TradeError` uses `details?: any`.
    *   **Risk:** Loss of type safety in critical trading logic. If the API response structure changes, the code might not catch it until runtime.
    *   **Recommendation:** Define strict types for all expected properties and remove the index signature if possible.

## 🟡 WARNING: Performance, UX, or Missing i18n

1.  **Hardcoded Strings (Missing i18n)**:
    *   **Finding:** Several components contain hardcoded text, including:
        *   `src/components/settings/tabs/IndicatorSettings.svelte`: "Speed", "Balanced", "Quality".
        *   `src/lib/windows/implementations/ChatTestView.svelte`: "Senden" (German).
        *   `src/lib/windows/implementations/SymbolPickerView.svelte`: "All", "Vol".
        *   `src/lib/windows/implementations/AssistantView.svelte`: "Anwenden", "Ignorieren".
    *   **Risk:** Poor UX for non-German/English speakers (mixed languages). Maintenance difficulty.
    *   **Recommendation:** Move all strings to `src/locales/locales/en.json` and use `$t()`.

2.  **Leftover Debug Code**:
    *   **Finding:** `console.log` statements found in `src/routes/api/klines/+server.ts` and `src/hooks.server.ts`.
    *   **Risk:** Log spam in production, potential leakage of non-sensitive but internal operational data structure.
    *   **Recommendation:** Remove `console.log` or replace with `logger.debug` guarded by `dev` check.

3.  **Input Parsing Robustness**:
    *   **Finding:** `src/routes/api/klines/+server.ts` uses `parseInt(limitParam)` without checking for `NaN`.
    *   **Risk:** If `limit` is invalid, it passes `NaN` to the upstream API, which might behave unpredictably (or default to something unexpected).
    *   **Recommendation:** Add `if (isNaN(limit)) limit = 50;`.

## 🔵 REFACTOR: Code Smell / Technical Debt

1.  **Code Duplication**:
    *   **Finding:** Logic for fetching Bitunix/Bitget klines is duplicated between `src/services/apiService.ts` (Client/Server Service) and `src/routes/api/klines/+server.ts` (API Endpoint).
    *   **Risk:** Fixes applied to one might be missed in the other (e.g., the Synthetic Aggregation bug might exist in one but not the other, or fixes for it might not propagate).
    *   **Recommendation:** Extract the fetching logic into a shared library or have the endpoint use `apiService` (if architecture permits). For now, ensure parity in validation logic.

2.  **Mutable Decimal Reference Pattern**:
    *   **Finding:** `marketWatcher.ts` -> `fillGaps` uses `open: prev.close` which shares the `Decimal` instance.
    *   **Risk:** Minimal (since `Decimal` is immutable), but conceptually standard practice is to clone or create new instances to avoid reference confusion.
    *   **Recommendation:** Use `prev.close` (it is immutable) so it is fine, but be aware of this pattern.
