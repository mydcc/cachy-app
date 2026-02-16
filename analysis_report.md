# Analysis Report: Cachy-App Codebase

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1.  **Type Safety Violation in `apiService.ts` (Synthetic Klines)**
    *   **Location**: `src/services/apiService.ts` (inside `fetchBitunixKlines`)
    *   **Issue**: In the synthetic aggregation logic, `high` is converted to a string (`high.toString()`) while other fields remain `Decimal`. The object is cast `as any`, bypassing TypeScript checks.
    *   **Risk**: Downstream consumers (e.g., TechnicalsService) expecting `Kline.high` to be a `Decimal` will crash when calling methods like `.minus()` or `.gt()` on a string, leading to chart failures or incorrect indicator calculations.
    *   **Fix**: Remove `.toString()` to preserve the `Decimal` type.

2.  **Potential Logic Error in `marketWatcher.ts` (Gap Filling)**
    *   **Location**: `src/services/marketWatcher.ts` -> `fillGaps`
    *   **Issue**: The `fillGaps` function iterates through klines to fill missing data points. While `Decimal` is immutable (safe to reuse reference), the logic assumes sorted input. If `apiService` returns unsorted data (possible with some async batching or backfills), gaps might be miscalculated or negative.
    *   **Fix**: Ensure klines are sorted by time before calling `fillGaps`.

3.  **WebSocket Memory Leak Risk**
    *   **Location**: `src/services/bitunixWs.ts`
    *   **Issue**: `syntheticSubs` map tracks subscriptions for synthetic timeframes. While reference counting is implemented, complex race conditions between `subscribe` and `unsubscribe` (especially during re-connections) could leave orphaned entries.
    *   **Fix**: Add a periodic "garbage collection" for `syntheticSubs` similar to `pruneOrphanedSubscriptions` in `MarketWatcher`.

## 🟡 WARNING (Performance issue, UX error, missing i18n)

4.  **Hardcoded Strings (i18n Gaps)**
    *   **Location**: `src/routes/+layout.svelte` and `src/components/inputs/TradeSetupInputs.svelte`
    *   **Issue**: Several UI strings are hardcoded or rely on fallbacks (e.g., "Favorites", emojis like "🚀", "🤖").
    *   **Fix**: Move all UI text to `src/locales/*.json` and use `$_()`.

5.  **Accessibility (A11y) Violations**
    *   **Location**: `src/routes/+layout.svelte`
    *   **Issue**: Usage of `<!-- svelte-ignore a11y_click_events_have_key_events -->` on interactive elements (backdrops, overlays) indicates missing keyboard support. Users relying on keyboards cannot close some modals/overlays easily.
    *   **Fix**: Add `onkeydown` handlers and `role` attributes to interactive non-button elements.

6.  **Performance: Fast Path Validation Bypass**
    *   **Location**: `src/services/bitunixWs.ts`
    *   **Issue**: The "Fast Path" for WebSocket messages bypasses standard Zod validation for performance. While wrapped in `try-catch`, any change in API response structure (e.g., field renaming) will fail silently in production logs (dev logs warn), potentially causing stale data in UI without visible errors.
    *   **Fix**: Add a sampling mechanism to validate 1% of "Fast Path" messages via Zod to catch schema drift early.

## 🔵 REFACTOR (Code smell, technical debt)

7.  **Complex WebSocket Service**
    *   **Location**: `src/services/bitunixWs.ts`
    *   **Issue**: The class is over 1000 lines and handles connection, authentication, subscription management, heartbeats, validation, and data mapping.
    *   **Fix**: Extract `SubscriptionManager` and `HeartbeatManager` into separate classes to improve testability and maintainability.

8.  **Inconsistent Error Handling**
    *   **Location**: `src/services/tradeService.ts`
    *   **Issue**: Some methods throw `BitunixApiError`, others `TradeError`, and some generic `Error`.
    *   **Fix**: Standardize on `TradeError` with strict error codes for better UI feedback.
