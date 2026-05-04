# Code Analysis & Risk Report

## 🔴 CRITICAL: Risk of financial loss, crash, or security vulnerability.

1. **Incorrect Exception Throw in `tradeService.ts`**:
   - In `closePosition`, the error for missing `amount` throws an unregistered literal string `"apiErrors.invalidAmount"`, which causes the Vitest suite (`tradeService_errors.test.ts`) to falsely pass or fail (as the test expects exactly this string but should use a constant or a registered key).
   - *Fix:* Ensure it throws using a centralized constant or proper i18n key logic. Also, update test cases to verify the exact error constant.

2. **Memory Leak in Map without eviction bounds (`omsService.ts` & others)**:
   - Several services heavily use Maps (like `historyLocks`, `exhaustedHistory`, `pendingRequests` in `marketWatcher.ts`, `cache` in `apiService.ts`). Indiscriminate `.clear()` calls might lose all active state, while infinite growth without bound will cause memory exhaustion.
   - *Fix:* Check and add bounded eviction strategies, such as retaining only the N most recent entries or using timestamp-based threshold eviction.

3. **Type Safety issues in API Response Parsing**:
   - Although Decimal types are widely used, there are weak validations when parsing generic payloads (e.g. TpSl orders in `tradeService.ts`). Blind type assertions like `as TpSlOrder[]` or usage of `any` are prevalent.
   - *Fix:* Apply rigorous Zod schema parsing (with `.passthrough()` for future compatibility) instead of generic casting.

4. **Missing Exception Handlers / Incorrect Catch Types**:
   - `fetchTpSlOrders` casts exceptions to string arrays blindly.
   - *Fix:* Ensure all network interactions are properly caught and standard error envelopes are returned.

## 🟡 WARNING: Performance issue, UX error, missing i18n.

1. **Hardcoded Missing Translations**:
   - Many log messages and fallback error strings in `tradeService.ts` and `newsService.ts` are hardcoded in English instead of utilizing the `i18n` framework.

2. **Performance Bottleneck in Reactivity**:
   - Arrays in persistent state stores might be blindly truncated or manipulated in ways that trigger massive re-renders.

## 🔵 REFACTOR: Code smell, technical debt.

1. **Redundant `clear()` calls**:
   - Using `.clear()` in teardown/reset functions is fine, but in active data streams (e.g. `apiService.cache`), bounded LRU strategies are preferable to wholesale clearing.
