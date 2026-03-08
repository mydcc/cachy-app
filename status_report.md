# Codebase Analysis & Status Report
## cachy-app - Professional Crypto Trading Platform

### 🔴 CRITICAL: Risk of financial loss, crash, or security vulnerability.

1.  **Unsafe Type Casts in TradeService Error Handling**
    *   **Location:** `src/services/tradeService.ts`, Lines 294-297
    *   **Issue:** The error handler uses `(e as any).code` and `(e as any).status` to identify validation or auth errors. This bypasses TypeScript's safety checks and can cause runtime exceptions if `e` is null, undefined, or a primitive type (like a string thrown as an error), leading to a crash in the critical path of order rollback.
    *   **Fix:** Replace `as any` with explicit object type guards (e.g., `typeof e === 'object' && e !== null && 'code' in e`).

2.  **Unsafe Parsing in CSV Service**
    *   **Location:** `src/services/csvService.ts`, Line 346
    *   **Issue:** Uses `parseFloat(originalIdAsString)` to parse IDs. This can lead to loss of precision for large integer IDs common in trading systems, potentially corrupting trade data or causing mismatched IDs. Although it checks `isTooLarge`, using `parseFloat` for IDs is inherently risky.
    *   **Fix:** Ensure IDs are treated as strings throughout or parsed using `BigInt` or deterministic UUIDs.

3.  **Potential Floating Point Inaccuracies in AI Store**
    *   **Location:** `src/stores/ai.svelte.ts` (multiple lines)
    *   **Issue:** Widespread use of `Number(value.toFixed(x))` and nested `Number` conversions for financial data (scores, prices, ATR, RSI, etc.). While this might be for AI reporting rather than direct execution, any financial value conversion using native floats poses a risk of inaccuracies that might mislead the AI or user.
    *   **Fix:** Strict enforcement of `Decimal.js` for all calculations, formatting only at the very end when generating the final string payload for the AI, avoiding intermediate `Number` conversions.

4.  **Bitunix WS Fastpath Date Parsing**
    *   **Location:** `src/services/bitunixWs.ts`, Line 1324
    *   **Issue:** `t: Number(item.t ?? item.ts ?? item.time ?? Date.now())`. Fallback to `Date.now()` on missing timestamp could mask data integrity issues in historical data or real-time feeds, leading to silently incorrect chart rendering or strategy execution.
    *   **Fix:** Reject invalid data or use a safer timestamp extraction method.

### 🟡 WARNING: Performance issue, UX error, missing i18n.

1.  **Memory Leaks in Stores & Services (Intervals/Timeouts)**
    *   **Location:** `src/stores/market.svelte.ts` (and potentially others like `apiService.ts`, `bitunixWs.ts`, etc.)
    *   **Issue:** The `market.svelte.ts` store correctly clears intervals in `destroy()`, but uses `this.notifyTimer` and `this.statusNotifyTimer` which are *not* cleared in the `destroy()` method. This will leak timeouts if the store is recreated or destroyed. Same applies to WS services that have complex reconnect/watchdog timers.
    *   **Fix:** Ensure all `setTimeout` IDs are tracked and cleared in the `destroy` lifecycle of Svelte stores and cleanup methods of services.

2.  **Hardcoded Strings / Missing i18n fallback enforcement**
    *   **Location:** `src/components/shared/OfflineBanner.svelte` (e.g., `{$_("offline.title")}`) and components using the pattern `val === null || val === undefined ? "" : String(val);`.
    *   **Issue:** While the custom i18n linter says "No hardcoded UI strings detected", we must ensure that all `$_('key')` calls actually resolve to valid strings, and that components don't silently fallback to empty strings or technical keys if translations are missing.
    *   **Fix:** Review the `i18n.ts` implementation to ensure a robust fallback mechanism (e.g., to English) is in place and logs warnings for missing keys.

3.  **UI Thread Blocking via Heavy Operations**
    *   **Location:** `src/services/activeTechnicalsManager.svelte.ts`
    *   **Issue:** Uses a polyfill with `setTimeout` to simulate `requestIdleCallback`. If the calculation is heavy, `setTimeout(..., 0)` will still block the main thread once it executes.
    *   **Fix:** Ensure heavy calculations are strictly offloaded to Web Workers (`technicals.worker.ts`, `aggregator.worker.ts`) or WebGPU (`webGpuCalculator.ts`) and not run on the main thread even if deferred.

### 🔵 REFACTOR: Code smell, technical debt.

1.  **Inconsistent Decimal/Number Conversions**
    *   **Location:** `market.svelte.ts` uses `.toNumber()` aggressively for backing buffers.
    *   **Issue:** "Skip Decimal.toNumber() overhead" comment indicates an attempt to optimize. While necessary for WebGL/Charting libraries that require Float32Arrays or native arrays, this boundary needs strict typing to prevent native floats from leaking back into domain logic.
    *   **Fix:** Clearly segregate domain models (100% Decimal) from view models (Native arrays for charts).
