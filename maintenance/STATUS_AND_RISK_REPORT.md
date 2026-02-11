# Status & Risk Report: Cachy App Hardening
**Date:** 2026-05-25
**Author:** Senior Lead Developer (Jules)
**Scope:** Core Services, State Management, UI Components

## 1. Executive Summary
The codebase demonstrates a high level of maturity with extensive use of `Decimal.js` for financial calculations, strict TypeScript typing in most areas, and a robust `marketWatcher` architecture. However, several critical risks were identified in the "Fast Path" WebSocket processing and error handling logic that could lead to data inconsistency or silent failures during trading operations.

## 2. Risk Assessment

### 🔴 CRITICAL (Immediate Action Required)

1.  **WebSocket "Fast Path" Data Integrity Risk**
    *   **Location:** `src/services/bitunixWs.ts` (Lines ~500-600)
    *   **Issue:** The "Fast Path" optimization manually casts incoming data (e.g., `ip`, `fr`) to strings or Decimals without strict `undefined` checks.
    *   **Risk:** If the API response format changes slightly (e.g., `ip` becomes missing), `new Decimal(undefined)` or `String(undefined)` operations could crash the WebSocket worker or result in `NaN` propagating through the system.
    *   **Recommendation:** Implement strict guards in the Fast Path or fallback to Zod validation if fields are missing.

2.  **Silent Failure in Order Cancellation**
    *   **Location:** `src/services/tradeService.ts` (`cancelAllOrders` method)
    *   **Issue:** The method defaults to `throwOnError = false`.
    *   **Risk:** If a cancellation fails (e.g., during a "Flash Close" or panic operation), the error is logged but swallowed. The subsequent close operation might proceed, leaving "naked" Stop Loss orders active.
    *   **Recommendation:** Change default to `throwOnError = true` for critical paths, or strictly enforce it in `flashClosePosition`.

3.  **Markdown Sanitization Configuration Review**
    *   **Location:** `src/utils/markdownUtils.ts`
    *   **Issue:** `DOMPurify` is used (Good), but the configuration is default.
    *   **Risk:** Default sanitization is generally safe, but for institutional grade security, we should explicitly forbid sensitive tags (e.g., `<form>`, `<input>`) and ensure `target="_blank"` links have `rel="noopener noreferrer"`.
    *   **Recommendation:** Harden `DOMPurify.sanitize` config in `markdownUtils.ts`.

### 🟡 WARNING (High Priority)

4.  **Journal Memory Leak / Regression**
    *   **Location:** `src/stores/journal.svelte.ts`
    *   **Issue:** The `addEntry` method pushes new entries to `this.entries` without enforcing the documented 1000-item limit. The limit is only applied during `load()`.
    *   **Risk:** Long-running sessions with high-frequency trading could cause `this.entries` to grow unbounded, leading to UI lag or crashes.
    *   **Recommendation:** Implement `if (this.entries.length > limit) this.entries.shift()` in `addEntry`.

5.  **MarketWatcher Polling Safety**
    *   **Location:** `src/services/marketWatcher.ts`
    *   **Issue:** `performPollingCycle` accesses `marketState.data[symbol]` directly.
    *   **Risk:** While initialized in constructor, race conditions during symbol switching might lead to undefined access if `marketState.data` keys are removed.
    *   **Recommendation:** Add optional chaining `marketState.data[symbol]?.lastUpdated`.

6.  **Telemetry Reactivity Overhead**
    *   **Location:** `src/stores/market.svelte.ts`
    *   **Issue:** `telemetry` is a single `$state` object updated frequently (API calls, latency).
    *   **Risk:** Components subscribing to `marketState` might re-render on every telemetry update if they don't use fine-grained selectors.
    *   **Recommendation:** Verify usage or split telemetry into a separate store if performance degrades.

### 🔵 REFACTOR (Technical Debt)

7.  **TradeService Type Safety**
    *   **Location:** `src/services/tradeService.ts` (`fetchTpSlOrders`)
    *   **Issue:** Uses `any[]` return type and `any` in internal mapping.
    *   **Recommendation:** Define strict `TpSlOrder` interface and use it.

8.  **Store Complexity**
    *   **Location:** `src/stores/market.svelte.ts`
    *   **Issue:** `subscribe` method uses manual `$effect.root` management for Svelte 4 compatibility.
    *   **Recommendation:** Simplify if Svelte 5 is the exclusive target.

## 3. Implementation Plan (Next Steps)

1.  **Harden WebSocket Fast Path:** Add explicit checks for `undefined` before casting.
2.  **Fix Trade Safety:** Ensure `cancelAllOrders` throws on failure during Flash Close.
3.  **Sanitize Markdown:** Audit and fix `src/actions/markdown.ts`.
4.  **Cap Journal Size:** Add limit logic to `journal.svelte.ts`.
5.  **Refactor Types:** Apply `TpSlOrder` types.

---
*End of Report*
