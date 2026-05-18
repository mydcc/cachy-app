# Cachy App Code Analysis & Status Report

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1. **`tradeService.ts` / Decimal serialization:** The `serializePayload` helper explicitly returns strings for `Decimal` objects (`if (payload instanceof Decimal) return payload.toString();`). However, this object comparison (`instanceof`) might fail across different JavaScript execution contexts (e.g., worker vs main thread, hot-module-reloading). Although `Decimal.isDecimal(payload)` is checked as a fallback, there is a risk that nested decimals are coerced to floats in standard `JSON.stringify` later on if `serializePayload` misses them (e.g., deeply nested objects > depth 20 limit, or edge cases).
2. **`safeJson.ts` implementation:** Need to verify if `safeJsonParse` is consistently used. A `grep` check shows native `JSON.parse` is still heavily used across critical files (e.g., `src/utils/WasmTechnicalsCalculator.ts`, `src/stores/ai.svelte.ts`, `src/stores/quiz.svelte.ts`, `src/stores/settings.svelte.ts`, `src/stores/indicator.svelte.ts`, `src/stores/favorites.svelte.ts`, `src/lib/server/chatStore.ts`, etc.). This causes precision loss for 64-bit integer IDs or high-precision floats when dealing with REST/WebSocket APIs, corrupting data.
3. **Number conversion over Decimal in `mdaService.ts` / `bitunixWs.ts`:** Variables are cast using `Number()` (e.g., `Number(k.time)`, `Number(item.t)`). While timestamps are generally fine as `Number` (they fit within `Number.MAX_SAFE_INTEGER`), using `Number()` on stringified prices or amounts directly will cause IEEE 754 precision loss. Instances in `stores/ai.svelte.ts` (`Number(data.confluence.score.toFixed(2))`) and Svelte files should be examined for price calculations.
4. **`catch (e: any)` in `newsService.ts`:** Several places in `newsService.ts` use `catch (e: any)` which bypasses TypeScript type checking and can lead to unexpected crashes if the error object doesn't have a `.message` property (e.g., string errors, null errors).
5. **No `catch` handling for text parsing (`await res.text()`) in `newsService.ts`:** If the stream fails, this throws unhandled promise rejections.

## 🟡 WARNING (Performance issue, UX error, missing i18n)

1. **Memory Leaks in Maps:** `MarketWatcher` uses several unbounded `Map` objects (`requests`, `pendingUpdates`, `backingBuffers`, `pendingKlineUpdates`) and sets `staggerTimeouts`. While there is an `exhaustedHistory` Map, unbounded Maps without a strict pruning mechanism can cause memory bloat if thousands of symbols or channels are requested over time.
2. **Zombie Timers:** `setInterval` is used in multiple services (e.g., `omsService.ts`, `apiService.ts`, `bitunixWs.ts`, `bitgetWs.ts`, `market.svelte.ts`). If the service is destroyed or re-instantiated (especially during HMR or navigating between instances), and `.clearInterval()` is not explicitly called, it leads to zombie timers and background loops eating CPU.
3. **Missing translations:** Several hardcoded strings and missing keys in UI elements.
4. **Missing or improper error translation mappings:** Raw API status codes or texts shouldn't be exposed directly to the user interface.

## 🔵 REFACTOR (Stability/maintainability technical debt)

1. **`tradeErrors` structure in `en.json`:** The error keys are duplicated (`"connectionFailed": "Connection failed"`) in `cloud` section, which causes confusion.
2. **Type Safety for Order Objects:** Instances of generic `Record<string, any>` or raw `any` mappings in `trade.svelte.ts` (`currentTradeData: Record<string, any> | null;`) break type safety.

## Step 2: Action Plan (Implementation)

### Group 1: Data Integrity & Typing Hardening (CRITICAL)
- **Replace `catch (e: any)`**: In `newsService.ts`, change all instances of `catch (e: any)` to `catch (e: unknown)`. Use `e instanceof Error ? e.message : String(e)` to safely extract messages. Add a `try/catch` block around `await res.text()` to handle stream reading errors safely.
- **Replace `JSON.parse` with `safeJsonParse`**: In critical service files (`src/utils/WasmTechnicalsCalculator.ts` and others that parse API/WebSocket payloads), replace native `JSON.parse` with the imported `safeJsonParse` to prevent 64-bit integer corruption and high-precision decimal loss.
- **Strict `any` Replacements**: In `trade.svelte.ts`, replace `Record<string, any>` and `any` state variables with explicit type interfaces like `Record<string, unknown>` or specific Order/Trade state shapes from `types/orderSchemas.ts` or `types/apiSchemas.ts` (e.g. `currentTradeData: unknown`). In `market.svelte.ts` (and `tradeService.ts`), strongly type `any` payloads.

### Group 2: Memory & Resource Management (WARNING)
- **Bounded Maps & Pruning**: In `MarketWatcher` (`marketWatcher.ts`) and `market.svelte.ts`, implement bounded eviction strategies for growing maps (like `prunedRequestIds`, `requests`, `backingBuffers`). E.g. avoid `.clear()` indiscriminately, and use `Map` deletion or size-based bounding instead.
- **Timer & Resource Cleanup**: In `market.svelte.ts` and other services using `setInterval`, ensure `ReturnType<typeof setInterval>` is used instead of `any`, and guarantee that `.clearInterval` is called within the `destroy()` or cleanup methods. Use the `import.meta.hot.dispose` trick for HMR cleanup.

### Group 3: i18n & Error Handling (WARNING/REFACTOR)
- **Deduplicate `en.json` Keys**: Remove the duplicate `"connectionFailed": "Connection failed"` entries in `src/locales/locales/en.json`.
- **API Error Handling**: Ensure `tradeService.ts` handles failed fetch calls by throwing standard i18n constant map values (like `TRADE_ERRORS.FETCH_FAILED`) instead of hardcoded strings or raw status messages.

### Test Cases required before fixing Logic Errors
- **Test 1**: Verify `newsService.ts` does not throw an unhandled rejection when `await response.text()` fails.
- **Test 2**: Verify `JSON.parse` is NOT used in `safeJsonParse` dependent services to prevent large integer corruption. (A unit test checking precision loss for large numbers will be made).


### Refactoring Justifications
- **Deduplicating `en.json` Keys**: Removing the duplicate `"connectionFailed"` entries prevents potential runtime resolution errors or unintended key collisions during language pack loading, which measurably improves application stability when loading localization data.
- **Type Safety in `trade.svelte.ts`**: Replacing `Record<string, any>` with strict types ensures that the compiler catches missing or mismatched fields in critical financial order states, directly improving runtime stability by preventing `TypeError` crashes when accessing deeply nested properties.
