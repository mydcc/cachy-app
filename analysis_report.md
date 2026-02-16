# Status & Risk Report (Step 1)

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1.  **Memory Leak in WebSocket Service (`BitunixWebSocketService`)**:
    -   **Finding**: The `syntheticSubs` map (used for derived timeframes like 4h/1d from 1h candles) is accessed via `@ts-ignore` and **never cleaned up**.
    -   **Detail**: The `subscribe` method adds to `syntheticSubs`, but `unsubscribe` ignores it completely. This map grows indefinitely as users switch symbols, leading to a memory leak and potential performance degradation over time.
    -   **Location**: `src/services/bitunixWs.ts` (Line ~980, ~1020)

2.  **Missing Input Validation in Financial Endpoint (`api/account`)**:
    -   **Finding**: `src/routes/api/account/+server.ts` relies on manual `typeof` checks and `JSON.parse` without a strict schema validator (like Zod).
    -   **Risk**: Malformed or malicious payloads could bypass checks that Zod would catch (e.g., prototype pollution, unexpected types). This is inconsistent with newer endpoints like `tpsl/+server.ts`.
    -   **Location**: `src/routes/api/account/+server.ts`

3.  **Loose Typing in Trade Execution (`TradeService.ts`)**:
    -   **Finding**: The `TpSlOrder` interface uses `[key: string]: unknown`, and `fetchTpSlOrders` casts API responses directly to this type without runtime validation.
    -   **Risk**: If the API response structure changes (e.g., a field becomes null or changes type), the application may crash or behave unpredictably during critical trading operations.
    -   **Location**: `src/services/tradeService.ts`

## 🟡 WARNING (Performance issue, UX error, missing i18n)

1.  **Synchronous "Hot Path" Blocking (`MarketWatcher.ts`)**:
    -   **Finding**: The `fillGaps` method iterates up to 5,000 times synchronously to fill candle gaps.
    -   **Impact**: On a slow device or with large data gaps, this could freeze the main thread (UI) for several frames, causing jank or unresponsiveness.
    -   **Location**: `src/services/marketWatcher.ts`

2.  **Hardcoded UI Strings (Missing i18n)**:
    -   **Finding**: `src/routes/[[lang]]/(seo)/+layout.svelte` contains hardcoded strings like "Academy", "Cachy", etc.
    -   **Impact**: Non-English users will see mixed languages.
    -   **Location**: `src/routes/[[lang]]/(seo)/+layout.svelte`

3.  **Precision warnings in Fast Path (`BitunixWS`)**:
    -   **Finding**: The WebSocket "Fast Path" optimization casts numbers to strings using `safeString` but logs a warning for every numeric occurrence in high-frequency data (Price/Ticker).
    -   **Impact**: This could flood the console/logs in production if the API sends numbers (which it often does for volume/price), degrading performance via logging overhead.
    -   **Location**: `src/services/bitunixWs.ts`

## 🔵 REFACTOR (Technical Debt)

1.  **Inconsistent Error Handling**:
    -   **Finding**: Widespread use of `catch (e: any)` (e.g., in `TradeService`) instead of `catch (e: unknown)` with proper type guards.
    -   **Impact**: Reduces type safety and makes refactoring harder.

2.  **Manual Type Casting**:
    -   **Finding**: `TradeService` methods often cast `as Any` or `as TpSlOrder[]` without validation.
