# Cachy-App Status & Risk Report
## 🔴 CRITICAL

### Data Integrity & Mapping
- **Floating Point Inaccuracies (TradeService, Mappers):** Found usage of `JSON.parse` directly on API responses that might contain large numbers or high-precision decimals, risking silent data corruption (e.g. 19-digit IDs). Should use a safe JSON parser.
- **Type Safety with `any` (MarketWatcher, TradeService, NewsService):** Extensive use of `any` in payload serialization/deserialization bypasses TypeScript. Specifically, mapping API responses blindly to arrays without schema validation.
- **Inconsistent Decimal.js usage:** Found instances of `Number()` parsing and `price.toNumber()` being used for UI conversion, risking precision loss in financial data.

### Resource Management
- **WebSocket Memory Leaks (BitunixWs, OMSService):** Missing or incomplete teardown inside `destroy()` methods. `clearInterval` and `clearTimeout` are sometimes skipped, and inner collections are not consistently cleared (`.clear()`).
- **Timer Types:** Timer IDs are typed inconsistently or missing proper cleanup.

## 🟡 WARNING

### UI/UX & A11y
- **Missing i18n Keys:** Hardcoded fallback strings found in `tradeService.ts` (e.g., "Flash Close Failed"). Errors from catch blocks are sometimes cast to `any` and raw messages are propagated without translation mapping.
- **Error Handling:** Catch blocks use `catch (e: any)` instead of `catch (e: unknown)`. The error messaging lacks standardized mappings to actionable user prompts.

## 🔵 REFACTOR

- **Test coverage placeholders:** Make sure empty test files contain valid placeholder tests.

## Action Plan

1. **Fix Critical Type Safety & Data Integrity (CRITICAL):**
   - Replace `JSON.parse` with custom safe parsing in critical paths.
   - Replace `any` in `tradeService` and `marketWatcher` with explicit interfaces (e.g., `TpSlOrder`) and `unknown`.
2. **Fix Resource Leaks (CRITICAL):**
   - Review all `destroy()` methods in services (e.g., `omsService`, `bitunixWs`). Ensure `.clear()` is called on Maps/Sets and all timers are cleared.
3. **Fix i18n & Error Handling (WARNING):**
   - Replace `catch (e: any)` with `catch (e: unknown)` and type narrow.
   - Replace hardcoded errors in `tradeService.ts` with centralized constant keys.

### Extended Analysis: JSON Parsing (CRITICAL)
- **`src/services/apiQuotaTracker.svelte.ts`**: Uses `JSON.parse` directly on `localStorage.getItem(QUOTA_STORAGE_KEY)`. If the storage is corrupted or contains unexpected data, it throws without safe fallback. Should use `safeJsonParse`.
- **`src/services/backupService.ts`**: Uses `JSON.parse` to validate JSON and deserialize backups. If a backup file is very large or has large precision numbers (e.g., timestamps or IDs), it risks precision loss.
- **`src/components/shared/GlobalTracker.svelte`**: Uses `JSON.parse(contextStr)` without using the centralized `safeJsonParse`, risking unhandled exceptions or data loss.

### Extended Analysis: Resource Management (CRITICAL)
- **`src/services/omsService.ts`**: The `destroy()` method successfully clears `this.watchdogInterval`. However, it does NOT clear the inner maps (`orders` and `positions`) during teardown, which causes memory leaks if the service is recreated (e.g. during HMR or provider switching). `.clear()` is only used in `reset()`.
- **`src/services/apiService.ts`**: The `destroy()` method clears the `cleanupInterval` but it's typed inconsistently elsewhere.
- **`src/services/bitunixWs.ts`**: The `destroy()` method clears `globalMonitorInterval` and removes event listeners, clears `syntheticSubs` and `pendingSubscriptions`. However, checking the timers reveals `pingTimerPublic` and `pingTimerPrivate` exist but are not explicitly cleared in the `destroy()` block (relying on `cleanup()`, but it should be explicitly handled for redundancy).

### Extended Analysis: i18n & Error Handling (WARNING)
- **`src/services/newsService.ts`**: Found explicit usages of `catch (e: any)` around lines 283, 340, and 508. These need to be converted to `catch (e: unknown)` and properly narrowed to prevent passing raw unknown objects down the chain.
- **`src/services/tradeService.ts`**: Contains multiple instances of `catch (e) {` without explicit typing (which defaults to `any` in some contexts). Furthermore, error toasts use hardcoded fallback strings like `"Flash Close Failed"` and `"Flash Close Failed for"` instead of centralized string constants, violating i18n maintainability.
- **`src/services/marketWatcher.ts`**: Contains multiple instances of `catch (e) {` without explicit typing, leading to the same issues.

### Action Plan Details & Refactoring Justifications
1. **Fix Critical Type Safety & Data Integrity (CRITICAL):**
   - Replace `JSON.parse` with custom safe parsing in critical paths.
   - Replace `any` in `tradeService` and `marketWatcher` with explicit interfaces (e.g., `TpSlOrder`) and `unknown`.
   - **Test Case:** Create `src/tests/hardening/server_precision_repro.test.ts` to reproduce native `JSON.parse` corrupting 19-digit integers.

2. **Fix Resource Leaks (CRITICAL):**
   - Review all `destroy()` methods in services (e.g., `omsService`, `bitunixWs`). Ensure `.clear()` is called on Maps/Sets and all timers are cleared.
   - **Test Case:** Create a memory leak test `src/services/bitunixWs.leak.test.ts` to verify the instance's map cleanup and simulate active connections closing.

3. **Fix i18n & Error Handling (WARNING):**
   - Replace `catch (e: any)` with `catch (e: unknown)` and type narrow.
   - Replace hardcoded errors in `tradeService.ts` with centralized constant keys.

### Refactoring Justifications
- **Strict Typing for Errors:** Replacing `any` with `unknown` and strict typing for error messaging measurably improves stability by preventing runtime exceptions when unknown error shapes are thrown, reducing the risk of UI crashes in edge cases.
- **WebSocket/OMS Resource Teardown:** Adding exhaustive `clear()` calls and manual timer clearances in `destroy()` measurably improves performance by preventing memory leaks during provider switching and hot module replacement, which can otherwise crash the browser over time.
- **Safe JSON Parsing:** Enforcing `safeJsonParse` measurably improves stability by preventing critical loss of precision for large IDs, which could result in ghost orders or incorrect data mappings. Purely cosmetic refactoring (e.g., renaming variables for style) is postponed.
