# Status & Risk Report: cachy-app

## 🔴 CRITICAL
*   **Data Integrity (Decimal usage vs native floats):**
    *   While `Decimal.js` is widely used, there are instances where Decimals are converted back to numbers, potentially losing precision, especially in the UI components and `activeTechnicalsManager.svelte.ts` (e.g., `price.toNumber()`).
    *   Mapping errors in `tradeService` where API response data isn't aggressively validated against being null/undefined. The `try/catch` in `TradeService.flashClose` can fail silently.
*   **Data Serialization / Deserialization (JSON.parse / safeJsonParse):**
    *   Many parts of the application still use `JSON.parse` directly or `as any`, bypassing strict validation and risking silent failures or precision loss with large numerical IDs (e.g., `tradeService.ts`, `bitunixWs.ts`).
*   **Type Safety (any usage):**
    *   Extensive use of `as any` and `Record<string, any>` in type definitions (`src/types/`) and services (e.g. `webGpuCalculator.ts`, `bitunixWs.ts`), which defeats TypeScript's protections against malformed external data.
*   **Memory Leaks (Unbounded collections):**
    *   `MarketWatcher.ts` uses Maps and Sets extensively, some potentially without proper eviction limits (`requests`, `historyLocks`).
    *   `bitunixWs.ts` and `bitgetWs.ts` have complex reconnection logic that might leak subscriptions if the WebSocket unexpectedly drops without cleaning up the internal Maps of active streams.

## 🟡 WARNING
*   **UI/UX Error Handling (Actionable Errors):**
    *   Error messages from `tradeService` are sometimes generic or swallow the actual root cause (e.g., `try { ... } catch (e: any) { ... }`).
    *   Raw proxy HTML or network errors could be exposed if `safeJsonParse` is not utilized or if exceptions are not handled and mapped to `i18n` keys.
*   **Missing i18n:**
    *   Several hardcoded strings exist, particularly in error handling logs or fallbacks.
*   **Performance (Re-renders & Hot Paths):**
    *   The `activeTechnicalsManager` runs on a polyfilled `requestIdleCallback` (using `setTimeout`) which might block the main thread if computations take too long.
    *   Frequent DOM updates or store updates during market data storms without sufficient throttling/debouncing.
*   **Security (XSS Risks):**
    *   Several components use `{@html ...}` without `DOMPurify.sanitize()` (e.g., `ChartPatternsView.svelte`, `MarketOverview.svelte`). While some are just icon rendering, any dynamic data passed into `{@html}` poses an XSS risk.

## 🔵 REFACTOR
*   **Timers & Resource Management:**
    *   Use of `setTimeout` and `setInterval` without always typing the return as `ReturnType<typeof setTimeout>`. Some components may not reliably call `clearTimeout`/`clearInterval` `onDestroy`.
*   **Error Typings:**
    *   Widespread use of `catch (e: any)` instead of `catch (e: unknown)` and proper type narrowing.

# Action Plan

## 1. Type Safety & Decimal Preservation (Data Integrity & Financial Standards)
*   **Fix `any` usage in try-catch:** Refactor `catch (e: any)` to `catch (e: unknown)` across critical services (`tradeService.ts`, `dataRepairService.ts`, `newsService.ts`, `bitunixWs.ts`). Implement type narrowing (`e instanceof Error ? e.message : String(e)`).
*   **Eliminate `.toNumber()` where possible:** Audit and replace instances where `Decimal` is downcast to `number` (e.g., in `activeTechnicalsManager.svelte.ts`) to ensure calculations retain precision. Ensure UI components accept `Decimal` directly.
*   **JSON Parsing:** Enforce usage of a `safeJsonParse` utility over native `JSON.parse` or casting `as any` when handling API responses to prevent silent precision loss with large IDs.
*   **Strict Typing:** Replace instances of `Record<string, any>` with `Record<string, unknown>` and add runtime type checks.

## 2. Resource Management & Memory Leaks (Hardening)
*   **WebSocket Teardown:** Ensure that when a WebSocket service (e.g., `BitunixWs`) is destroyed or disconnected, `.clear()` is unconditionally called on internal Maps and Sets (like `pendingSubscriptions`, `requests`) to prevent memory leaks.
*   **Bounded Collections:** Implement bounded eviction logic for `Map` and `Set` caches (e.g., `requests` in `MarketWatcher.ts`). Iterate using `.entries()` rather than blindly taking the first key to safely evict inactive entries.
*   **Intervals/Timeouts:** Ensure all timer IDs (like `setInterval`, `setTimeout`) are typed correctly as `ReturnType<typeof setTimeout>` to prevent mismatch issues across environments.

## 3. UI/UX, Security & i18n
*   **XSS Prevention:** Ensure that all dynamic content passed to `{@html ...}` in Svelte components is wrapped with `DOMPurify.sanitize()`.
*   **Actionable & Safe Errors:** When extracting error messages (e.g., `rawMessage`), check for HTML content. Map raw proxy errors or HTML to safe localized `i18n` keys (e.g., `apiErrors.invalidResponse`) instead of passing raw HTML to the `toastService`.
*   **Optimistic UI Stability:** In `tradeService.ts`, if an API request fails with a network timeout, do not unconditionally roll back the optimistic UI state (e.g., deleting the order locally). Instead, mark it as `_isUnconfirmed = true` to prevent double-ordering if the exchange actually executed it.

## 4. Test Cases for Critical Issues
*   **Decimal Precision Loss:** Write a unit test ensuring that large numeric IDs or highly precise values passed through the WebSocket/API layer are not truncated.
*   **Optimistic Order Fallback:** Write a test simulating a network timeout during order placement and assert that the optimistic order remains in the state marked as `_isUnconfirmed = true`.

## 5. Justification for Refactoring
*   **Does this measurably improve stability or performance?** Yes. Strict typing and Decimal preservation prevent silent financial calculation errors. Memory leak fixes directly prevent browser crashes during long-running sessions. Handling HTML error responses prevents XSS and improves user trust.
