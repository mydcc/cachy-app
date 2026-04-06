# Analysis & Hardening Report

## 🔴 CRITICAL Findings
1.  **WebSocket / Market Data Precision Risks:**
    *   In `src/stores/market.svelte.ts`, the `toDecimal` and `updateDecimal` helpers blindly instantiate `new Decimal(val)` for string values without properly checking for valid mathematical formats (e.g. `NaN`, `Infinity`). As `decimal.js` allows initializing strings that could mathematically be invalid when later used in trading logic, this needs a robust check `.isFinite() && !.isNaN()`.
2.  **Unclosed Resources (Memory Leaks):**
    *   `src/services/apiService.ts`: `RequestManager` has `setInterval` for cleanup, but if HMR restarts it, it could potentially leak if `destroy` logic doesn't correctly clear internal intervals or queues if it gets overridden in a weird environment state.
    *   `src/services/marketWatcher.ts`: Periodic checks exist but missing clear boundaries on `staggerTimeouts` or history closures might leave floating promises.
    *   `bitunixWs.ts` / `bitgetWs.ts`: Unclear if all reconnect intervals are consistently cleared on destroy/stop.
3.  **Lack of Defensive Casting in TradeService:**
    *   In `tradeService.ts`, several API methods typecast payload returns to `any` (e.g., `this.signedRequest<any>("POST", "/api/tpsl", ...)`). While TS handles this at compile time, the runtime response from the API is directly processed without `zod` validation or type narrowing in some paths (especially TP/SL orders processing), exposing the system to crashes if the API schema changes unexpectedly.

## 🟡 WARNING Findings
1.  **UI/UX Error States:**
    *   In `marketWatcher.ts`, when history loading fails, it silently returns `false`. The UI does not seem to get an actionable error message when the backend API is unreachable for klines (e.g., 'Chart data unavailable, check connection.').
2.  **i18n Missing Keys:**
    *   Errors like `apiErrors.invalidResponseFormat` and `apiErrors.responseTooLarge` are hardcoded in `apiService.ts`. Must ensure these exist in `en.json` / `de.json` and `schema.d.ts`.
3.  **Memory Footprint of Market State Arrays:**
    *   In `marketWatcher.ts` `fillGaps`, we insert thousands of empty `Kline` objects if there's a huge gap (bounded by 5000). While it handles missing data, it might artificially explode memory.

## 🔵 REFACTOR Findings
1.  **Redundant Logic:**
    *   `safeJsonParse` logic is somewhat replicated in different files. Consolidating all `Decimal` safe parsing into one utility would improve maintainability.
2.  **Typing:**
    *   `any` usage in `tradeService.ts` for parameters and responses.

# Action Plan

1.  *Harden Market State Decimal Handling (CRITICAL)*
    - Update `toDecimal` and `updateDecimal` in `src/stores/market.svelte.ts` to perform `.isFinite() && !.isNaN()` checks on newly instantiated `Decimal` objects. Fall back to `undefined` or previous value if invalid to prevent NaN cascading through the order book / technical indicators.
    - **Proposed Unit Test**: `marketStore.svelte.test.ts`: Call `updateSymbol` with `{ lastPrice: 'NaN' }` or `{ lastPrice: 'Infinity' }` and assert that the internal state remains safe/undefined rather than throwing or propagating `NaN`.
2.  *Harden TradeService Type Safety (CRITICAL)*
    - Implement Zod schema validation (e.g., `TpSlOrderSchema`) for the responses in `tradeService.ts` (specifically `fetchTpSlOrders`) to replace the `any` casting and ensure data matches expected shapes. Fix generic type casting and ensure runtime validations of payloads using `typeof data === 'object'`.
    - **Proposed Unit Test**: `tradeService_serialization.test.ts`: Mock `fetchTpSlOrders` API response to return malformed objects (e.g. missing `planType`, or wrong `triggerPrice` format) and verify it gracefully filters out invalid items via Zod validation instead of crashing.
3.  *Audit i18n Keys (WARNING)*
    - Verify and add missing API error keys (`apiErrors.invalidResponseFormat`, `apiErrors.responseTooLarge`, etc.) to localization files (`en.json`, `de.json`) and the TypeScript schema.
4.  *Complete Pre-Commit Steps*
    - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
5.  *Submit*
    - Submit branch with "Hardening" title.
