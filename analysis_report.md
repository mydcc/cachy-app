# Status & Risk Report: Phase 1 Analysis

## Executive Summary
The codebase demonstrates a solid foundation with good use of `Decimal.js` for financial calculations and `Zod` for API validation. However, critical resource management issues (memory leaks) were identified in the WebSocket and Worker services. Additionally, there are opportunities to harden type safety and standardize error handling.

## 🔴 CRITICAL (Risk of crash or degradation)

1.  **Memory Leak in `src/services/bitunixWs.ts`**
    *   **Finding:** The `syntheticSubs` map tracks synthetic subscriptions (e.g., derived timeframes) but entries are never removed in the `unsubscribe` method.
    *   **Impact:** Over time, as users switch symbols or timeframes, this map will grow indefinitely, leading to increased memory usage and potentially crashing the browser tab.
    *   **Action:** Implement cleanup logic in `unsubscribe` to decrement reference counts and delete keys when zero.

2.  **Memory Leak in `src/services/technicalsWorker.ts`**
    *   **Finding:** The `stateMap` stores `WorkerState` (history, settings) for every `symbol:timeframe` pair initialized via the `INITIALIZE` message. There is no `CLEANUP` or `dispose` message handler.
    *   **Impact:** The worker's memory footprint will expand continuously as different symbols are analyzed, eventually causing the worker to terminate or slow down the application.
    *   **Action:** Add a `CLEANUP` message type to the worker protocol and dispatch it when a chart is unmounted.

## 🟡 WARNING (Stability, UX, or Logic Risks)

1.  **Dead Code: `fillGaps` in `MarketWatcher`**
    *   **Finding:** The `fillGaps` method in `src/services/marketWatcher.ts` contains logic to ensure data continuity but is never called.
    *   **Impact:** Charts may show gaps if the API returns discontinuous data, potentially affecting technical indicator calculations.
    *   **Action:** Integrate `fillGaps` into the data processing pipeline or remove it if deemed unnecessary.

2.  **Unsafe JSON Parsing in `src/routes/api/tpsl/+server.ts`**
    *   **Finding:** The endpoint uses `await request.json()`, which can throw a generic error for empty or malformed bodies, bypassing `safeJsonParse` protections (like large integer handling).
    *   **Impact:** Potential 500 errors on malformed requests; slight risk of precision loss if large integers are passed in the body (though mitigated by Zod validation later).
    *   **Action:** Refactor to use `await request.text()` followed by `safeJsonParse`.

3.  **Loose Typing in `TradeService`**
    *   **Finding:** The `TpSlOrder` interface uses `[key: string]: any`, and several methods in `src/services/tradeService.ts` rely on `any` casting.
    *   **Impact:** Reduces TypeScript's ability to catch refactoring errors and API contract changes.
    *   **Action:** Define strict Zod schemas and interfaces for TP/SL orders.

## 🔵 REFACTOR (Technical Debt)

1.  **Generic Error Catching (`catch (e: any)`)**
    *   **Finding:** Most services use `catch (e: any)` which bypasses type safety checks.
    *   **Action:** Adopt `catch (e: unknown)` pattern with helper functions (like `getErrorMessage` or `instanceof Error`) to ensure type safety during error handling.

2.  **API Error Standardization**
    *   **Finding:** `tradeService.ts` creates custom error objects in some places but re-throws raw errors in others.
    *   **Action:** Unify error throwing using a standard `AppError` class to ensure consistent UI feedback.
