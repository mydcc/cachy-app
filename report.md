# System Analysis Report

## Status Quo & Vulnerabilities (Step 1)

### 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1.  **Type Safety & Validation in Execution Paths (`src/services/tradeService.ts`)**:
    *   **Finding**: The system relies on `any` for parsing API responses in critical functions (e.g. `cancelOrder` casts result to `any`).
    *   **Risk**: The backend might receive malformed execution payloads (e.g., missing `orderId` or `symbol`), resulting in silently failed cancellations while the frontend assumes success.
    *   **Impact**: Financial loss if a user attempts to cancel a stop-loss or take-profit order, but it executes anyway due to a malformed payload.

2.  **Potential WebSocket Resource Leaks (`src/services/bitunixWs.ts`)**:
    *   **Finding**: While timers are generally cleared on explicit closures, repeated reconnects or missing unmount calls in UI components could cause internal sets (`syntheticSubs`, `pendingSubscriptions`) to grow unboundedly.
    *   **Risk**: Memory exhaustion over long trading sessions, leading to a browser tab crash.
    *   **Impact**: User misses critical market movements or is unable to close positions fast enough because the client froze.

### 🟡 WARNING (Performance issue, UX error, missing i18n)

1.  **Missing i18n & Hardcoded Errors (`src/services/tradeService.ts`)**:
    *   **Finding**: The system throws hardcoded string messages (e.g., `throw new Error("tradeErrors.fetchFailed")`) instead of using centralized error constants that map to localization schema keys (e.g., `TRADE_ERRORS.FETCH_FAILED`).
    *   **Risk**: If the underlying translation keys change, the hardcoded strings will silently fail to translate in the UI.
    *   **UX Impact**: Non-actionable error messages when the API fails or a position is missing.

2.  **Unsafe JSON Parsing**:
    *   **Finding**: Widespread use of native `JSON.parse()` across stores (`ai.svelte.ts`, `quiz.svelte.ts`, `settings.svelte.ts`).
    *   **Risk**: Large numeric IDs (e.g., order IDs from the API) will suffer silent precision loss when parsed natively.
    *   **Impact**: Broken data relationships or failed API updates because the ID sent back to the server is slightly modified.

3.  **Unsafe Response Text parsing (`response.text()`)**:
    *   **Finding**: Code fetches `await response.text()` without wrapping it in a try/catch.
    *   **Risk**: Network interruptions during streaming text parsing can throw uncaught exceptions, potentially crashing the execution flow and leaving UI spinners indefinitely active.

### 🔵 REFACTOR (Code smell, technical debt)

1.  **Type Unsafe Catch Blocks**:
    *   **Finding**: Extensive use of `catch (e: any)` across workers and services.
    *   **Impact**: Bypasses TypeScript safety and masks potential structural changes in Error objects.

---

## Action Plan (Planning Phase - Step 2)

### Group 1: Hardening Execution & Data Parsing (CRITICAL & WARNING)

**Justification:** Measurably improves stability by ensuring the execution engine never receives structurally invalid data from the UI, and large order IDs don't get silently truncated.
*   **Action**: Replace native `JSON.parse` with `safeJsonParse` in all non-test TypeScript/Svelte files.
*   **Action**: Wrap `await response.text()` calls in `try/catch` blocks across services and API routes, throwing standardized localized errors (e.g., `apiErrors.invalidResponseFormat`) on failure.
*   **Action**: Audit `tradeService.ts` for raw `any` casts and ensure proper typing or Zod schema validation is applied.
*   **Unit Test to Reproduce (Before Fix)**: Create a mock test where `cancelTpSlOrder` is called with `{ wrongField: 123 }`. In the current state, it compiles and sends an invalid payload. The fix will cause a compilation error, proving the vulnerability is closed.

### Group 2: Hardening WebSocket & Interval Management (CRITICAL)

**Justification:** Prevents platform crashes during long trading sessions (measurably improves stability/performance).
*   **Action**: Audit `bitunixWs.ts` and `bitgetWs.ts`. Ensure `syntheticSubs` and `pendingSubscriptions` implement bounded eviction (e.g., max size) or are unconditionally cleared during teardown.
*   **Action**: Check Svelte stores (e.g., `market.svelte.ts`) with `setInterval` to ensure they expose and correctly call `destroy()` or cleanup functions.
*   **Unit Test to Reproduce (Before Fix)**: Expand `bitunixWs.leak.test.ts` to simulate 10,000 rapid subscribe/unsubscribe cycles. Assert that the size of `syntheticSubs` does not continuously grow.

### Group 3: Standardizing i18n Error Reporting & Catch Blocks (WARNING & REFACTOR)

**Justification:** Improves UX by ensuring broken states provide localized, actionable feedback, and measurably improves stability by ensuring errors are safely handled.
*   **Action**: In `tradeService.ts`, replace literal string throws (e.g., `throw new Error("tradeErrors.fetchFailed")`) with centralized constants (`throw new Error(TRADE_ERRORS.FETCH_FAILED)`).
*   **Action**: Replace all instances of `catch (e: any)` with `catch (e: unknown)` and type-narrow using `e instanceof Error ? e.message : String(e)`.

### Execution Guidelines Adherence
*   **Defensive Programming**: We assume the network will fail during `response.text()` and handle it gracefully.
*   **No Regressions**: Replacing `JSON.parse` with `safeJsonParse` uses our internal battle-tested implementation without altering expected output structures.
*   **Financial Standards**: Using `safeJsonParse` guarantees large numeric strings stay as strings/Decimals instead of becoming imprecise floats.
