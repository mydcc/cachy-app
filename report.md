# In-Depth Code Analysis & Status Report

## Status Quo & Vulnerabilities (Step 1)

### 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1.  **Generic API Serialization Risk (`src/services/tradeService.ts`)**:
    *   **Finding**: The `signedRequest` method accepts `payload: Record<string, unknown>` and serializes it using `serializePayload(payload: unknown...)` but then returns `any` inside the serialization recursive calls which defeats type safety for properties.
    *   **Risk**: If a deeply nested float/number sneaks into the payload instead of a `Decimal.js` instance, it could be serialized with floating-point inaccuracies (e.g., `0.30000000000000004`), resulting in rejected API requests or incorrect order amounts.
    *   **Impact**: Execution of orders with wrong amounts, resulting in unexpected positions or failures.

2.  **WebSocket Memory Management and Memory Leak (`src/services/bitunixWs.ts`)**:
    *   **Finding**: `src/services/bitunixWs.ts` manages a complex state of subscriptions (`syntheticSubs`, `pendingSubscriptions`). A memory leak test (`src/services/bitunixWs.leak.test.ts`) exists for this.
    *   **Risk**: Memory exhaustion over long trading sessions if bounded eviction is not actively enforced during active use (even though `destroy()` is correctly mapped).
    *   **Impact**: Memory exhaustion over long trading sessions, leading to a browser tab crash.

### 🟡 WARNING (Performance issue, UX error, missing i18n)

1.  **Missing i18n & Hardcoded Errors (`src/services/tradeService.ts`)**:
    *   **Finding**: `tradeService.ts` explicitly throws hardcoded string arrays for some errors, such as `throw new Error("apiErrors.missingCredentials")` instead of referencing central constants strictly, leading to duplication of literals.
    *   **Risk**: The frontend i18n library (e.g., `svelte-i18n`) may break or have duplicate references, violating DRY principles and decoupling.
    *   **UX Impact**: Non-actionable error messages or raw keys displayed to the user when the API fails.

### 🔵 REFACTOR (Code smell, technical debt)

1.  **Widespread Test Mocks Bypassing Types**:
    *   **Finding**: Extensive use of `as any` in test files.
    *   **Impact**: If the underlying interfaces change, the tests will silently continue to pass because `any` defeats the type checker, eroding confidence in the test suite.

---

## Action Plan (Planning Phase - Step 2)

### Group 1: Hardening Financial Execution Types (CRITICAL)
**Justification:** Measurably improves stability by ensuring the execution engine never receives structurally invalid data from the UI.
*   **Action**: In `tradeService.ts`, thoroughly review recursive `serializePayload` logic to guarantee that every nested numerical property strictly enforces strict typing by returning `unknown` instead of `any`.
*   **Unit Test to Reproduce (Before Fix)**: Implement a test mocking an API request with an imprecise float. The system should normalize it explicitly and the type checker should fail if `any` is still used.

### Group 2: Standardizing i18n Error Reporting (WARNING)
**Justification:** Improves UX by ensuring broken states provide localized, actionable feedback to the user.
*   **Action**: Centralize the literal strings like `apiErrors.missingCredentials` into the `TRADE_ERRORS` constant mapping structure.

### Group 3: Hardening WebSocket Memory Management (CRITICAL)
**Justification:** Prevents platform crashes during long trading sessions (measurably improves stability/performance).
*   **Action**: Audit `bitunixWs.ts`. Ensure bounding limits are actively enforced on `pendingSubscriptions` rather than only relying on explicit teardown in `destroy()`.
*   **Unit Test to Reproduce (Before Fix)**: Expand `bitunixWs.leak.test.ts` to simulate 10,000 rapid subscribe/unsubscribe cycles. Assert that the active buffers do not continuously grow unchecked.

### Execution Guidelines Adherence
*   **Defensive Programming**: We assume payloads might contain garbage and ensure they fall back safely.
*   **No Regressions**: No structural API payload changes are proposed, only strict enforcement.
*   **Financial Standards**: Decimals strictly enforced.
