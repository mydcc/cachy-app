# In-Depth Analysis Report: cachy-app Hardening

## Step 1: In-Depth Analysis & Report (Status Quo)

### 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1. **Type Safety & `any` in Critical Execution Paths (`src/services/tradeService.ts`)**:
   *   **Finding**: The `signedRequest` method accepts `payload: Record<string, any>` and serializes it using `serializePayload(payload: any...)`.
   *   **Risk**: Bypassing the TypeScript compiler with `any` means the backend might receive malformed execution payloads (e.g. nested objects that should be strings, or missing critical fields).
   *   **Impact**: Financial loss if order structures are incorrectly serialized or validated before hitting the API.

2. **WebSocket Memory Leaks via Unbounded Reference Counting (`src/services/bitunixWs.ts`)**:
   *   **Finding**: `pendingSubscriptions` and `syntheticSubs` handle active subscriptions as Maps. While they are cleared on `.destroy()`, there is no bounded eviction if stray logic or unexpected disconnects fail to correctly decrement the counter (value never reaches 0).
   *   **Risk**: Memory exhaustion over long trading sessions due to zombie subscriptions piling up, leading to a browser tab crash.
   *   **Impact**: User misses critical market movements because the application crashes from an Out-of-Memory (OOM) error.

### 🟡 WARNING (Performance issue, UX error, missing i18n)

1. **Missing i18n Error Reporting (`src/services/tradeService.ts`)**:
   *   **Finding**: The code throws literal strings like `throw new Error("apiErrors.missingCredentials")` or `throw new Error("apiErrors.invalidAmount")`. While some map directly to translation keys, others might not be correctly tied to `TRADE_ERRORS` constants or validated against `schema.d.ts`.
   *   **Risk**: The frontend i18n library will display raw translation keys instead of readable messages if there's a mismatch.
   *   **UX Impact**: Non-actionable error messages when the API fails or a position is missing.

2. **Performance Hot Paths with `Decimal` Conversions (`src/services/marketWatcher.ts` / `src/services/activeTechnicalsManager.svelte.ts`)**:
   *   **Finding**: Rapid instantiations and `.toNumber()` conversions on `Decimal` objects during high-frequency market updates.
   *   **Risk**: Excessive object instantiation in the UI thread can cause micro-stutters during volatile market conditions, degrading the trading experience.

### 🔵 REFACTOR (Code smell, technical debt)

1. **Widespread Test Mocks Bypassing Types**:
   *   **Finding**: Extensive use of `as any` in test files (e.g., `marketWatcher as any`).
   *   **Impact**: If the underlying interfaces change, the tests will silently continue to pass because `any` defeats the type checker, eroding confidence in the test suite.

---

## Step 2: Action Plan

### Group 1: Hardening Financial Execution Types (CRITICAL)

**Justification:** Measurably improves stability by ensuring the execution engine never receives structurally invalid data from the UI or misinterprets generic payloads.
*   **Action**: In `tradeService.ts`, refactor `signedRequest` and `serializePayload` to accept `Record<string, unknown>` and `unknown` respectively, forcing explicit type checking before property access.
*   **Unit Test to Reproduce (Before Fix)**:
    *   **Test Case**: `should fail to compile or throw type errors when sending invalid payload structures`.
    *   **Inputs**: `await tradeService.signedRequest("POST", "/api/orders", { amount: { broken: "object" } });`
    *   **Assertion**: Assert that with strict typing, the compiler catches this, and dynamically, it throws a localized error rather than sending it to the exchange.

### Group 2: Hardening WebSocket Memory Management (CRITICAL)

**Justification:** Measurably improves stability by preventing unbounded memory growth and platform crashes during prolonged, high-frequency trading sessions.
*   **Action**: Audit `bitunixWs.ts`. Implement bounded eviction strategies (e.g., maximum queue sizes of 500) for `pendingSubscriptions` and `syntheticSubs`. Ensure eviction logic iterates via `.entries()` to safely evict only inactive entries (`val === 0`).
*   **Unit Test to Reproduce (Before Fix)**:
    *   **Test Case**: `should enforce bounded size on syntheticSubs and pendingSubscriptions`.
    *   **Inputs**: Mock 1000 fast subscribe/unsubscribe pairs where some unsubscribes drop.
    *   **Assertion**: Assert that `syntheticSubs.size` never exceeds the safety limit (e.g., 500) and that active entries (`val > 0`) are preserved.

### Group 3: Standardizing i18n Error Reporting (WARNING)

**Justification:** Measurably improves UX and stability by ensuring broken states provide localized, actionable feedback, reducing user confusion during outages.
*   **Action**: Centralize literal string throws in `tradeService.ts` to strictly reference constants that are validated against `src/locales/schema.d.ts` (e.g., `tradeErrors.positionNotFound`).
