# In-Depth Analysis Report: cachy-app Hardening

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1. **Type Safety & Validation in Execution Paths (`src/services/tradeService.ts`)**:
   - **Finding**: Critical execution methods like `cancelTpSlOrder(order: any)` skip type checking, allowing malformed payload executions. `signedRequest` uses `any` resulting in risky serialization.
   - **Risk**: Financial loss due to silently failed API modifications disguised as successful execution requests.

2. **Generic API Serialization Risk (`src/services/tradeService.ts`)**:
   - **Finding**: `serializePayload` maps objects typed as `any`, leaving open vectors for JavaScript numbers to sneak in and be serialized with floating point inaccuracies instead of using `Decimal.js`.
   - **Risk**: Rejecting valid API requests due to float inaccuracies like `1.000000000000001`.

3. **Potential WebSocket Resource Leaks (`src/services/bitunixWs.ts`)**:
   - **Finding**: `syntheticSubs` and `pendingSubscriptions` collect subscriptions. While logic exists to untrack them, they must be rigorously cleared via `.clear()` in disconnection/destruction paths to guarantee no unbounded memory growth.
   - **Risk**: Browser crash from memory exhaustion on long-running tabs.

## 🟡 WARNING (Performance issue, UX error, missing i18n)

1. **Missing i18n & Hardcoded Errors (`src/services/tradeService.ts`)**:
   - **Finding**: Hardcoded strings thrown instead of proper mapped `TRADE_ERRORS` constants (`throw new Error("tradeErrors.fetchFailed")`). The `TRADE_ERRORS.POSITION_NOT_FOUND` maps to `"trade.positionNotFound"`, but `"tradeErrors.positionNotFound"` is sometimes thrown explicitly.
   - **Risk**: Unresolved translation keys shown to end users during trading errors.

2. **Performance "Hot Paths"**:
   - **Finding**: Various components and UI sections convert `Decimal` instances frequently inside render loops or high-frequency sockets instead of mapping once.

## 🔵 REFACTOR (Code smell, technical debt)

1. **Test Suite Type Bypassing**:
   - **Finding**: Use of `as any` everywhere in `test` files negates the TypeScript safety net for refactoring the architecture.


# Action Plan

## Group 1: Hardening Financial Execution Types & Math (CRITICAL)
*Justification: Measurably improves stability by ensuring the execution engine never receives structurally invalid data and floats are mathematically sound.*
1. **File:** `src/services/tradeService.ts`
2. **Action:** Refactor `cancelTpSlOrder(order: any)` to strongly typed `(order: TpSlOrder)`.
3. **Action:** Change `serializePayload(payload: any...)` to accept `unknown` and gracefully narrow the type before processing.
4. **Action:** Change `signedRequest` to explicitly accept `Record<string, unknown>`.
5. **Unit Test Reproducer:** Explicitly add tests ensuring malformed objects correctly fail TS compilation rather than quietly passing into `serializePayload`.

## Group 2: Hardening WebSocket Memory Management (CRITICAL)
*Justification: Prevents platform crashes during long trading sessions.*
1. **File:** `src/services/bitunixWs.ts`
2. **Action:** Implement rigorous `.clear()` calls on `syntheticSubs` and `pendingSubscriptions` maps during websocket cleanup cycles (`cleanup` and/or `disconnect`).
3. **Unit Test Reproducer:** Extend `src/services/bitunixWs.leak.test.ts` to assert `syntheticSubs.size === 0` after cleanup.

## Group 3: Standardizing i18n Error Reporting (WARNING)
*Justification: Improves UX by ensuring broken states provide localized, actionable feedback.*
1. **File:** `src/services/tradeService.ts`
2. **Action:** Update the `TRADE_ERRORS` map to align perfectly with `src/locales/schema.d.ts` (e.g. `POSITION_NOT_FOUND: "tradeErrors.positionNotFound"`).
3. **Action:** Replace hardcoded strings in `throw new Error(...)` with centralized error constants (e.g. `TRADE_ERRORS.FETCH_FAILED`).
