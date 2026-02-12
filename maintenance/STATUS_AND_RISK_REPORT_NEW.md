# Status & Risk Report (Current Analysis)

**Date:** 2026-05-21
**Auditor:** Jules (Senior Lead Developer & Systems Architect)
**Status:** DRAFT / ANALYSIS PHASE

## 1. Executive Summary

The `cachy-app` codebase demonstrates a solid foundation with modern technologies (Svelte 5, Vite, Decimal.js). However, it currently operates at an "MVP/Beta" level rather than "Institutional Grade". Critical paths in data ingestion (WebSocket) and trade execution utilize optimization shortcuts ("Fast Paths") that compromise type safety and data integrity. Financial calculations are mostly safe due to `Decimal.js`, but data ingress points remain vulnerable to precision loss before safe conversion occurs.

## 2. Prioritized Findings

### 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1.  **Unsafe "Fast Path" in WebSocket Ingestion (`src/services/bitunixWs.ts`)**
    *   **Issue:** The `handleMessage` method bypasses Zod validation for high-frequency events (`price`, `ticker`, `trade`) to improve performance. It manually casts properties: `const ip = typeof data.ip === 'number' ? String(data.ip) : data.ip;`.
    *   **Risk:** If the raw JSON parser (even with `safeJsonParse`) produces a number that has already lost precision (e.g., a very large integer ID or price), casting it to a String *after* the fact is too late. The data is already corrupted.
    *   **Remediation:** The "Fast Path" must use a parser that guarantees strings for all financial fields *before* any JavaScript number conversion, or strictly validate that incoming numbers are within safe integer limits (`Number.MAX_SAFE_INTEGER`).

2.  **Implicit `any` Casting in Market Logic (`src/services/marketWatcher.ts`)**
    *   **Issue:** The `fillGaps` method and `ensureHistory` flow rely on implicit `any` types for `klines`.
    *   **Risk:** If the API response structure changes (e.g., `volume` becomes `vol`), `fillGaps` might propagate `undefined` or `NaN` into the `Decimal` constructor, causing runtime crashes or silent data corruption in charts.
    *   **Remediation:** Introduce strict `KlineRawSchema` validation before passing data to `fillGaps`.

3.  **Fragile Flash Close Logic (`src/services/tradeService.ts`)**
    *   **Issue:** `flashClosePosition` throws errors up the stack. If the UI component calling it does not catch them perfectly, the user receives no feedback that their emergency close failed.
    *   **Risk:** A user clicks "Close", an error occurs (e.g., network), no toast appears, and the user assumes the position is closed while it remains open ("Naked Position").
    *   **Remediation:** Catch errors within `flashClosePosition`, return a standardized `Result<T, E>` object, and trigger a global "Critical Error" modal via `uiState` if the close fails.

4.  **Serialization Recursion Risk (`src/services/tradeService.ts`)**
    *   **Issue:** `serializePayload` uses recursion to convert Decimals to strings. While it has a depth limit (20), it iterates over all object keys.
    *   **Risk:** Sending a complex circular object (accidental pass of a Store or DOM element) could still cause performance hiccups or stack errors before hitting the limit.
    *   **Remediation:** Use a `JSON.stringify` replacer function or a non-recursive approach for flat payloads.

### 🟡 WARNING (Performance issue, UX error, missing i18n)

5.  **Hardcoded Strings (i18n Violation)**
    *   **Issue:** `src/components/settings/EngineDebugPanel.svelte` and `src/components/layout/Header.svelte` contain hardcoded English strings ("Capabilities", "Engine Stats", "Cachy App").
    *   **Risk:** Alienation of non-English users and inconsistency in UI.
    *   **Status:** Automated audit (`scripts/audit_translations.py`) shows 0 missing keys for *existing* references, but manual inspection reveals extensive hardcoded strings that are not yet using the translation system.
    *   **Remediation:** Extract all text to `src/locales/en.json` and use the `$_()` helper.

6.  **Garbage Collection Pressure in Klines (`src/stores/market.svelte.ts`)**
    *   **Issue:** `applySymbolKlines` frequently creates new arrays via spread syntax `[...history, ...newKlines]` or `slice()`, and re-allocates `Float64Array` buffers on every update.
    *   **Risk:** High-frequency updates (e.g., 10 symbols @ 100ms) will cause frequent GC pauses, causing UI stutter (jank) during trading.
    *   **Remediation:** Implement a ring buffer or pre-allocated array strategy for `klinesBuffers` to minimize allocations.

7.  **Unsafe HTML Injection (`src/components/inputs/PortfolioInputs.svelte`)**
    *   **Issue:** Uses `{@html icons.refresh}`.
    *   **Risk:** While `icons` are currently constant, this pattern encourages developers to inject HTML strings. If an icon were ever loaded dynamically from an external source, it becomes an XSS vector.
    *   **Remediation:** Replace `{@html ...}` with a dedicated `<Icon data={icons.refresh} />` component that sanitizes or treats content as SVG nodes safely.

8.  **Optimistic UI Desync Risk (`src/services/tradeService.ts`)**
    *   **Issue:** Optimistic orders are added via `omsService.addOptimisticOrder`. If the network request hangs indefinitely (timeout), the optimistic order might persist locally while the server never received it.
    *   **Remediation:** Ensure a background "reconciliation" process runs every few seconds to verify optimistic orders against actual open orders.

### 🔵 REFACTOR (Technical debt)

9.  **Standardization of `Decimal` Handling**
    *   **Issue:** WebSocket service mixes `number`, `string`, and `Decimal` handling logic.
    *   **Action:** Move all "Safe Math" logic to a central `MathUtils` or factory that ensures nothing enters the system as a native number if it represents money.

10. **Complex Polling Logic (`src/services/marketWatcher.ts`)**
    *   **Issue:** The hybrid polling/WS logic with `staggerTimeouts` and `performPollingCycle` is complex and hard to test.
    *   **Action:** Simplify into a `DataScheduler` class that abstracts the "Pull vs Push" decision logic.

## 3. Conclusion

To reach "Institutional Grade", the application requires immediate remediation of the WebSocket "Fast Path" (Critical #1) and implicit type casting (Critical #2). Following that, a sweep for i18n strings (Warning #5) and GC optimization (Warning #6) is recommended.
