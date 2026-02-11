# Status & Risk Report

## Executive Summary
The codebase demonstrates a sophisticated architecture with advanced performance optimizations (buffers, fast paths) and strong financial safety (Decimal.js). However, there are critical risks related to type safety in high-frequency paths, test infrastructure instability, and potential regressions in core services.

## 🔴 CRITICAL (Risk of loss, crash, or security vulnerability)

1.  **WebSocket "Fast Path" Risks (`src/services/bitunixWs.ts`)**
    *   **Finding:** The `handleMessage` method implements a "Fast Path" that manually parses JSON and casts numbers to strings/Decimals to bypass Zod validation for performance.
    *   **Risk:** It relies on `isSafe` (`!isNaN && isFinite`) and manual casting. If the API returns a number that JavaScript formats exponentially (e.g., `1e-7`), `String(val)` might break downstream parsers if they expect standard notation.
    *   **Evidence:** `src/services/bitunixWs.ts` contains logs for "CRITICAL PRECISION LOSS" detection, confirming this is a known active risk.
    *   **Recommendation:** Harden the "Fast Path" with a specialized, allocation-free number parser that strictly handles scientific notation, or verify `Decimal.js` handles the specific `String()` output safely in all edge cases.

2.  **Test Infrastructure Failure**
    *   **Finding:** A significant number of unit tests (Stores, Settings) fail with `ReferenceError: localStorage is not defined` or `window is not defined`.
    *   **Risk:** We are flying blind on regressions in these areas. Features might be broken without detection.
    *   **Recommendation:** Configure `vitest` to use `happy-dom` or `jsdom` environment globally or per-file.

3.  **Active Logic Regressions**
    *   **Finding:** `src/services/bitunixWs.test.ts` is failing due to a mismatch in `nextFundingTime`.
    *   **Finding:** `src/services/newsService_limit.test.ts` is failing (pruning logic broken).
    *   **Risk:** WebSocket updates might be sending undefined values to the store, and News service database might grow unbounded.

## 🟡 WARNING (Performance, UX, Minor Bugs)

1.  **Loose Typing in `TradeService`**
    *   **Finding:** `fetchTpSlOrders` returns `any[]` and uses `signedRequest<any>`.
    *   **Risk:** Runtime errors if API response structure changes.
    *   **Recommendation:** Define and use `TpSlOrderSchema` (Zod) for these responses.

2.  **Unbounded Runtime Arrays in `JournalManager`**
    *   **Finding:** `addEntry` pushes to `this.entries` without a runtime limit (unlike `load` which slices).
    *   **Risk:** Long-running sessions with heavy activity could degrade performance.
    *   **Recommendation:** Implement `checkLimit` in `addEntry`.

3.  **Hardcoded "Trusted" Markdown**
    *   **Finding:** `ChartPatternsView` uses `renderTrustedMarkdown`. While currently safe (static data), it sets a precedent.
    *   **Mitigation:** `renderTrustedMarkdown` correctly sanitizes on the client, mitigating XSS risk.

## 🔵 REFACTOR (Technical Debt)

1.  **Duplicate I18n Keys & Hardcoded Fallbacks**
    *   **Finding:** Components use hardcoded fallbacks like `"No market data available"` (though often translated via `$_("apiErrors.noMarketData") || ...`).
    *   **Recommendation:** Centralize all default strings in `en.json`.

2.  **Complex "Hybrid" Logic in `MarketWatcher`**
    *   **Finding:** The mix of polling, WS, and "Gap Filling" is complex and hard to test.
    *   **Recommendation:** Simplify by making WS the primary source and Polling strictly a "recovery" mechanism, rather than checking "staleness" constantly.

## 🟢 GOOD PRACTICES OBSERVED

*   **Financial Precision:** Consistent use of `Decimal.js` in `TradeService` and `MarketStore`.
*   **Performance:** `Float64Array` buffers for Klines (`MarketStore`). Explicit object reuse in `MarketManager`.
*   **Security:** `DOMPurify` used strictly. `serializePayload` recursion limits.
*   **Safety:** "Naked Stop Loss" protection in `flashClosePosition`.
