# Project Status & Risk Report

## 🔴 CRITICAL
- **Type Safety - `any` usage**: Multiple files (`src/services/tradeService.ts`, `src/services/newsService.ts`, `src/stores/market.svelte.ts`, `src/stores/trade.svelte.ts`) use `any` for dynamic data (e.g., `catch (e: any)`, `details?: any`). This bypasses type safety and violates strict TypeScript rules and Groundedness Rules.
- **Resource Management / Memory Leaks**: `src/stores/market.svelte.ts` and `src/stores/trade.svelte.ts` have intervals/timers typed as `any` rather than `ReturnType<typeof setTimeout|setInterval>`. This might cause resource leaks during unmounts and isn't type-safe.
- **Floating Point Inaccuracies**: `src/stores/market.svelte.ts` uses `.toNumber()` manually on `Decimal` objects (lines ~500-676) inside hot paths for buffer updates. While necessary for `Float64Array`, these conversions are extremely risky. If these buffers are used for trading logic and not just charting, this represents a severe risk of precision loss.
- **Missing `try/catch` around `await response.text()`**: In `src/services/newsService.ts` and `src/services/tradeService.ts`, calls to `await response.text()` are not explicitly wrapped in `try/catch` to handle stream reading failures.

## 🟡 WARNING
- **Error Exfiltration via Logs**: Error messages from `e.message` or `await res.text()` might be directly used in logs or passed to users, risking exposure of raw proxy pages or HTML if an API returns an HTML 500 error instead of JSON. Needs sanitization (e.g. mapping to `apiErrors.invalidResponse`).
- **Missing i18n**: Potential hardcoded error messages in services like `TradeError` strings.

## 🔵 REFACTOR
- **API Response Parsing**: Ensure `unknown` variables from `safeJsonParse` are checked with `typeof data === 'object' && data !== null` before being cast to `Record<string, unknown>`.
- **Validation**: Improve Zod schemas.

---

# Action Plan

## 1. Type Safety & Defensive Programming (CRITICAL fixes)
- **Fix `any` usage**: Replace `catch (e: any)` with `catch (e: unknown)` and `e instanceof Error ? e.message : String(e)` in `src/services/newsService.ts` and `src/services/tradeService.ts`.
- **Type Timers**: Replace `any` types for `setInterval` and `setTimeout` with `ReturnType<typeof setInterval>` and `ReturnType<typeof setTimeout>` in `src/stores/market.svelte.ts` and `src/stores/trade.svelte.ts`.
- **Test case before fixing**: Write a unit test `src/services/apiService_errors.test.ts` that mocks a fetch error throwing a non-Error string object, and assert that the catch block currently crashes or fails type-checking, then apply the fix.

## 2. Financial Precision (CRITICAL fixes)
- **Eliminate `.toNumber()` on Decimals for Trading Logic**: While `.toNumber()` is necessary to insert data into `Float64Array` (which only accepts native 64-bit floats), we must segregate this data strictly to WebGL/charting usage. Update code documentation and usage patterns to ensure these float buffers are never referenced for order sizing, risk management, or margin calculation.
- **Test case before fixing**: Create a test in `src/stores/marketStore_limits.test.ts` with extreme decimal values to verify precision loss during `.toNumber()`, assert it fails when performing financial arithmetic with the retrieved float, then apply the fix by sourcing calculations from the original `Decimal` instances instead.

## 3. Network Reliability & Error Sanitization (WARNING fixes)
- **Wrap `.text()` in `try/catch`**: In `src/services/newsService.ts` and `src/services/tradeService.ts`, ensure `await res.text()` is wrapped in `try/catch` and throws a standardized localized error (e.g., `apiErrors.invalidResponseFormat`) on failure.
- **HTML checking**: Ensure `await res.text()` is checked for HTML (`.toLowerCase().includes('<html')`) and mapped to `apiErrors.invalidResponse` before logging or throwing.

## 4. Stability and Validation (REFACTOR fixes)
- **API Response Parsing**: Update `unknown` object casts to ensure type narrowing (e.g., `typeof data === 'object' && data !== null ? data as Record<string, unknown> : {}`).
- **Justification**: Does this measurably improve stability or performance? Yes, it measurably improves stability by preventing `TypeError` crashes when an API unexpectedly returns an array, a string, or `null` instead of an object, which would otherwise crash downstream property access.
