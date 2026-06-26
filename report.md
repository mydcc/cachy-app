# Cachy App - In-depth Analysis Report

## 🔴 CRITICAL: Risk of financial loss, crash, or security vulnerability

1. **Unsafe JSON Parsing**: Usage of `JSON.parse` directly instead of `safeJsonParse` in multiple files. This can lead to precision loss on 64-bit integer IDs (like `orderId`).
   - Found in `src/services/apiService.ts`, `src/services/apiQuotaTracker.svelte.ts`, `src/stores/ai.svelte.ts`, `src/stores/quiz.svelte.ts`, `src/stores/settings.svelte.ts`, `src/routes/api/orders/+server.ts`, and `src/routes/api/sync/orders/+server.ts`.
2. **Missing Await for .text() error handling**: Missing try-catch blocks when parsing `await response.text()` in API endpoints or services. If the stream fails, it throws unhandled exceptions.
3. **Memory Leaks in WebSockets**: In `src/services/bitunixWs.ts`, the `destroy()` method does not properly clear `syntheticSubs` safely if iterating, and `Map` collections must be explicitly cleaned upon destruction.
4. **Optimistic State Revert on Indeterminate Errors**: Ensure `TradeService` does not unconditionally call `removeOrder` when the API fails with an indeterminate error (e.g. network timeout), preventing accidental double-ordering.

## 🟡 WARNING: Performance issue, UX error, missing i18n

1. **Hardcoded Strings (i18n missing)**: Hardcoded English text inside `toastService.error()` calls instead of using translation keys (e.g., `toastService.error("Flash Close Failed")` in `TradeService`). API errors often lack safe translation mapping and might expose HTML.
2. **Native Float Calculations**: Ensure Decimal.js is used strictly for price/quantity instead of downcasting to `.toNumber()` or `Number()` which leads to floating-point precision loss.

## 🔵 REFACTOR: Code smell, technical debt

1. **Type Safety Improvements**: Widespread use of `any` types in `tradeService.ts`, `mappers.ts`, and `marketWatcher.ts`. We need to strictly type API payloads to `Record<string, unknown>`.
2. **Timer Typing**: Replace `any` or `number` timer IDs with `ReturnType<typeof setTimeout>` or `ReturnType<typeof setInterval>`.


## Action Plan

### 1. Fix Critical Data Integrity Issues
- Search and replace all native `JSON.parse` with `safeJsonParse` across the `src/` directory to prevent 64-bit integer precision loss.
- Wrap all `await response.text()` calls in `try...catch` blocks within API endpoints (especially in `src/routes/api/orders/+server.ts` and `src/routes/api/account/+server.ts`) to handle stream reading failures gracefully and return standardized localized errors.
- **Justification**: Measurably improves stability by eliminating precision loss and preventing server crashes during network errors.

### 2. Harden WebSocket Memory Management (Memory Leaks)
- Modify `src/services/bitunixWs.ts` to ensure that `syntheticSubs` and other Maps/Sets are safely cleared during eviction or `destroy()`. Check `syntheticSubs.clear()` to ensure deterministic resource release.
- Ensure bounded eviction strategies are implemented properly.
- **Justification**: Measurably improves performance and stability by preventing unbounded memory growth in long-running clients.

### 3. Address i18n and UI/UX Warnings
- Update `src/services/tradeService.ts` and `toastService.svelte.ts` usage to ensure all `toastService.error` calls use localized keys (e.g. `get(_)("...")`) instead of hardcoded strings like `"Flash Close Failed"`.
- Prevent exposure of raw HTML from proxy error pages by adding checks for HTML content in error messages and mapping them to safe `apiErrors.invalidResponse`.
- **Justification**: Enhances user experience by providing localized, safe, and readable error messages, preventing confusing raw HTML from showing in UI popups.

### 4. Remove `any` and Enhance Type Safety (Refactoring for Stability)
- Refactor `src/services/tradeService.ts` and `src/services/mappers.ts` to replace `any` with `unknown` or `Record<string, unknown>`, and implement proper type narrowing.
- Ensure all `setInterval`/`setTimeout` properties use `ReturnType<typeof ...>` instead of `number` or `any`.
- **Justification**: Measurably improves stability by leveraging the TypeScript compiler to catch subtle bugs before runtime.

### 5. Final Verification (Execution)
- Run `npm run check && npm run test` to guarantee no regressions were introduced.

### Unit Test Suggestions for CRITICAL Logic Errors

#### 1. Unsafe JSON Parsing (Precision Loss)
- **File**: `src/utils/tests/precision_loss_repro.test.ts`
- **Test Case**: "should reproduce precision loss when parsing 64-bit integer Order IDs natively"
- **Mock Data**: `{"orderId": 1234567890123456789, "price": "1.23"}`
- **Assertion**: Expect that native `JSON.parse` mutates `orderId` to `1234567890123456800` (demonstrating the bug), while `safeJsonParse` preserves it exactly as a string `"1234567890123456789"`. This proves the vulnerability exists before the fix.

#### 2. WebSocket Memory Leaks
- **File**: `src/services/bitunixWs.leak.repro.test.ts`
- **Test Case**: "should fail to clear syntheticSubs when destroy() is called natively"
- **Procedure**: Instantiate the WebSocket service, populate `syntheticSubs` with mock keys (e.g., `["symbolA", 1], ["symbolB", 1]`), and invoke `.destroy()`.
- **Assertion**: Cast the instance to `any` and expect `(ws as any).syntheticSubs.size` to be greater than 0, proving the leak occurs upon destruction before we implement `.clear()`.
