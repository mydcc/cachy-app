# Systematic Maintenance & Hardening Report for cachy-app

## 🔴 CRITICAL

**Risk of financial loss, crash, or security vulnerability.**

1.  **Precision Loss in Timestamp/Numeric Parsing**:
    -   In `src/services/bitunixWs.ts:1297`, `src/services/mdaService.ts:102, 120`, and `src/services/mappers.ts:114`, timestamps or generic numeric values are cast using `Number()`. If timestamps or prices arrive as strings that exceed safe integer limits or require high precision, native float conversion can cause data corruption.
    -   **Fix/Action**: For timestamps, ensure safe conversion limits or use `Number(val)` strictly only when safe, but for financial math always use `new Decimal(val).toNumber()` if absolutely needed for standard arrays, or better, keep as `Decimal`.

2.  **Unsafe Stream Response Handling (`response.text()`)**:
    -   Throughout `src/routes/api/orders/+server.ts`, `src/routes/api/account/+server.ts`, `src/services/apiService.ts`, and `src/services/newsService.ts`, `response.text()` is called without wrapping it in a `try...catch` block.
    -   **Risk**: If the body is malformed, stream reading fails, or connection is lost during body download, this will throw an unhandled exception that can crash the execution flow or worker thread, leaving state inconsistent.
    -   **Fix/Action**: Wrap all `await response.text()` calls in a try-catch block. On failure, throw a generic localized error such as `apiErrors.invalidResponseFormat` and do not expose raw infrastructure details.

3.  **Potential Zombie Timers / Memory Leaks**:
    -   In `src/stores/notes.svelte.ts:104`, a `setTimeout` is instantiated via `this.notifyTimer = setTimeout(...)`. There is no `onDestroy` hook or cleanup mechanism observed that explicitly clears this timer when the store instance is destroyed or hot-reloaded.
    -   **Fix/Action**: Implement `onDestroy` within the Svelte store or ensure all intervals/timeouts are cleaned up.

4.  **Floating Point Logic Error**:
    -   `src/components/inputs/TradeSetupInputs.svelte:109`: Computes `priceDeviation` by converting a `Decimal` object to a standard number via `.toNumber()`. While possibly okay for visual UI display, if this is sent back down for API execution later, it violates strict financial math standards.

## 🟡 WARNING

**Performance issue, UX error, missing i18n.**

1.  **Hardcoded and Widespread `console.error` Logs**:
    -   The application contains a robust centralized `logger` service, yet numerous components directly invoke `console.error` (e.g., `src/components/settings/tabs/VisualsTab.svelte`, `src/components/shared/Charts/*`, `src/components/shared/TpSlList.svelte`, `src/stores/ai.svelte.ts`, `src/stores/quiz.svelte.ts`).
    -   **Risk**: Clutters the production console, bypasses centralized log tracking/telemetry, and can potentially leak sensitive application state directly into the browser console.
    -   **Fix/Action**: Replace all occurrences of `console.error` with localized `logger.error("category", message)` calls.

2.  **Unlocalized Error Strings**:
    -   Several thrown errors (e.g., in `src/routes/api/orders/+server.ts` or `src/services/newsService.ts`) concatenate strings like `"Bitget API Error"` or `"Cancel failed:"`.
    -   **Fix/Action**: Route strings through i18n translation keys.

## 🔵 REFACTOR

**Code smell, technical debt.**

1.  **`any` Typings in Critical Services**:
    -   The `mapToOMSPosition` and `mapToOMSOrder` in `src/services/mappers.ts` use `data: any`. While mapping from a dynamic JSON source, these should ideally use a `Record<string, unknown>` and proper runtime assertions (e.g. Zod `.passthrough()`) to ensure the shape matches expectations, reducing logic errors.
    -   **Fix/Action**: Migrate generic `any` usage to `unknown` or `Record<string, unknown>`.

# Action Plan

## Phase 1: Hardening Response Parsing (CRITICAL)
- **Action**: Add `try...catch` around `await response.text()` everywhere.
- **Specific test cases before fix**: Create a Vitest unit test suite (e.g., `apiService_response.test.ts`) that intercepts network requests using `msw` or `vi.mock` to return an invalid or abruptly closed readable stream. Ensure that calling the service currently crashes with an unhandled rejection, and verify that after the fix, it throws the expected `apiErrors.invalidResponseFormat` error string safely.

## Phase 2: Eliminating Native Number Conversions (CRITICAL)
- **Action**: Locate `Number()` usages in mapping/websocket services and convert them to secure numeric conversions using `new Decimal(val).toNumber()` where strings must be cast, or retain as `Decimal`.
- **Specific test cases before fix**: Create a unit test for `mappers.ts` or `bitunixWs.ts` that feeds an extreme large integer timestamp (e.g., `9007199254740993`) or highly precise price string. Verify that current `Number()` usage loses precision before applying the fix, and strictly passes the original precision after.

## Phase 3: Cleanup Timers & Leaks (CRITICAL)
- **Action**: Add explicit timer cleanup (`clearTimeout`, `clearInterval`) using Svelte's `onDestroy` or specific module-level teardown hooks in stores like `notes.svelte.ts`.
- **Specific test cases before fix**: Create a memory leak test where the store is initialized and destroyed multiple times in a loop. Verify using Vitest `vi.advanceTimersByTime` that un-cleared timers continue to fire and mutate mock states. Post-fix, ensure the store is strictly quiet after destruction.

## Phase 4: UI Error Centralization (WARNING)
- **Action**: Grep for `console.error` across components and replace with `logger.error("ui", ...)`. Group changes by file type or directory to minimize disruption.

## Phase 5: Refactoring Data Type Safety (REFACTOR)
- **Action**: Replace `any` types in OMS serializers (`mappers.ts`) with `Record<string, unknown>` or specific Zod validators.
- **Justification**: Does this measurably improve stability or performance? Yes, eliminating `any` directly mitigates critical logic errors and runtime crashes caused by unexpected undefined fields or mismatched type shapes from third-party APIs. It measurably improves stability by forcing compile-time and run-time safety checks for incoming OMS positions. Pure cosmetic refactors have been avoided here.
