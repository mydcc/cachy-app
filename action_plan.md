# Implementation Plan: Cachy-App Hardening & Maintenance

Based on the findings in `report.md`, this is the actionable plan to address the issues, grouped by related fixes.

## Group 1: Financial Logic & Decimal Fixes (CRITICAL)

**Objective:** Eliminate floating-point inaccuracies in all price, quantity, and financial calculations by strictly enforcing `decimal.js`.

**Action Items:**
1.  **Refactor `src/services/mdaService.ts`:** Replace `Number(k.time || ...)` and floating-point logic with strict `Decimal` instantiations where appropriate for prices/quantities. Timestamps can remain as integers (using `parseInt(..., 10)` or `Math.trunc(Number(...))` to avoid float weirdness), but price/volume must use Decimal.
2.  **Refactor `src/stores/ai.svelte.ts`:** Remove `new Decimal(...).toNumber()` chains. If numbers must be formatted for UI, use `.toFixed()` directly on the `Decimal` instance and keep the type as string/Decimal as long as possible before rendering.
3.  **Refactor `src/stores/market.svelte.ts`:** Fix the "buffer directly" optimization. If TypedArrays (Float64Array) are strictly required for WebGL/Canvas rendering performance, the conversion `val.toNumber()` must be documented and isolated. For business logic, maintain Decimal.

**Suggested Unit Tests (Before Fix):**
*   Create `mdaService.precision.test.ts` to mock MDA data containing large precision prices (e.g., `0.000000123456789`) and assert that the output exactly matches the string representation using `Decimal`, proving the current `Number()` implementation loses precision.

## Group 2: Memory Management & WebSocket Teardowns (CRITICAL / WARNING)

**Objective:** Fix memory leaks caused by lingering intervals and unbounded arrays.

**Action Items:**
1.  **Fix `src/stores/chat.svelte.ts` & `src/services/apiService.ts`:** Ensure every `setInterval` has its return ID stored. Implement a `destroy()` or `cleanup()` method in these classes/stores that calls `clearInterval()`.
2.  **Bounded Arrays (`src/services/omsService.ts`, `src/services/tradeService.ts`):** Implement a maximum length cap (e.g., 1000 items) or a time-based eviction strategy for historical order caches. When pushing new items, if length exceeds cap, use `.slice(-cap)` or a rolling window.

**Suggested Unit Tests (Before Fix):**
*   Create `apiService.leak.test.ts`: Instantiate `ApiService`, call the method that sets the interval, then call `destroy()`. Assert that the interval is cleared (e.g., using `vi.useFakeTimers()`).
*   Create `omsService.bounds.test.ts`: Push 2000 mock orders into the cache and assert the array length never exceeds 1000.

## Group 3: Robustness & Error Handling (CRITICAL / WARNING)

**Objective:** Handle API failures gracefully and ensure error messages are localized and actionable.

**Action Items:**
1.  **Wrap API Parsing:** Identify key `fetch` and WebSocket message handlers. Wrap `await response.json()` or `JSON.parse(msg)` in `try/catch`. Catch parsing failures and map them to generic localized error keys (e.g., `apiErrors.invalidResponseFormat`).
2.  **I18n Constants:** Replace raw string errors in `TradeService` (e.g., `throw new Error("Insufficient margin")`) with `TRADE_ERRORS` constants (e.g., `throw new Error(TRADE_ERRORS.INSUFFICIENT_MARGIN)`). Ensure the keys exist in translation files.

## Group 4: UI/UX & Security Refactoring (WARNING / REFACTOR)

**Objective:** Minimize XSS risk and ensure type safety.

**Action Items:**
1.  **Sanitize `@html`:** Audit `{@html ...}` usages. For user-provided or API-provided text, strictly use `use:markdown` with DOMPurify. For static icons, the current usage is acceptable but should be isolated.
2.  **Zod Parsing (Strict Justification):** Only refactor generic API payloads to Zod schemas if they directly feed into the order execution or risk management engine, as this measurably improves stability by preventing malformed data from triggering unintended trades. Postpone cosmetic schema refactoring for non-critical informational endpoints.
