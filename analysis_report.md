# Status & Risk Report

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1.  **Data Continuity Gap (`MarketWatcher.ts`)**:
    -   **Finding**: The `fillGaps` method is defined but **never called**.
    -   **Risk**: Chart data may contain holes (missing candles) during network instability or exchange downtime. This causes indicators (MA, RSI, etc.) to calculate incorrect values, potentially triggering false trading signals.
    -   **Location**: `src/services/marketWatcher.ts`

2.  **Flash Close Safety Logic (`TradeService.ts`)**:
    -   **Finding**: `flashClosePosition` explicitly aborts the position closure if `cancelAllOrders` fails (`trade.closeAbortedSafety`).
    -   **Risk**: In a high-volatility event or partial API outage (where "cancel" endpoint is 500 but "order" is 200), the user is unable to exit a losing position. While intended to prevent "naked stop losses", preventing the *exit* is often worse.
    -   **Location**: `src/services/tradeService.ts`

3.  **Loose Typing in Financial Service (`TradeService.ts`)**:
    -   **Finding**: `TpSlOrder` interface uses `[key: string]: any` and `TradeError` uses `any` for details.
    -   **Risk**: Increases the chance of runtime errors due to undefined properties or unexpected types, especially when handling exchange responses.
    -   **Location**: `src/services/tradeService.ts`

## 🟡 WARNING (Performance issue, UX error, missing i18n)

1.  **Missing Internationalization (i18n)**:
    -   **Finding**: `src/components/settings/EngineDebugPanel.svelte` contains multiple hardcoded strings ("TS", "WASM", "Low Battery", "Healthy", "Recent History").
    -   **Impact**: Poor UX for non-English users.

2.  **Unused Optimizations**:
    -   **Finding**: `MarketWatcher.ts` defines `ZERO_VOL` constant for `Decimal` optimization but instantiates new `"0"` strings/Decimals instead.
    -   **Impact**: Minor performance inefficiency in hot paths.

## 🔵 REFACTOR (Technical Debt)

1.  **Error Handling Patterns**:
    -   **Finding**: Widespread use of `catch (e: any)` instead of `catch (e: unknown)` with type guards.
    -   **Impact**: Reduces type safety and makes error handling logic harder to maintain.

2.  **Complex Fetch Logic**:
    -   **Finding**: `TradeService.ts` `fetchOpenPositionsFromApi` has complex manual validation that could be simplified with stricter Zod schemas upstream.
