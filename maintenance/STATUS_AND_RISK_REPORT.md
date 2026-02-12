# Status & Risk Report

**Date:** 2026-02-20
**Author:** Jules (Senior Lead Developer & Systems Architect)
**Status:** FINAL (Forensic Audit Completed)

This report summarizes the findings of the deep code analysis of the `cachy-app` repository. The focus was on data integrity, security, and stability for professional trading use.

---

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1.  **Precision Loss in `BitunixWs` "Fast Path"**
    *   **Location:** `src/services/bitunixWs.ts` (`handleMessage` method).
    *   **Issue:** The "Fast Path" optimization manually casts data fields (like `ip`, `lastPrice`) to strings *after* `safeJsonParse` has already executed. `safeJsonParse` uses `JSON.parse` internally. If the regex in `safeJsonParse` fails to catch a specific number format (or if the number is less than 15 digits but has high decimal precision), `JSON.parse` converts it to a native JavaScript `number`, causing immediate precision loss before the "Fast Path" code can cast it to a string.
    *   **Risk:** Financial calculations (Index Price, Funding Rate) may be based on inaccurate floating-point values.
    *   **Recommendation:** Remove the "Fast Path" logic or strictly ensure `safeJsonParse` handles *all* numeric values by wrapping them in strings, not just "large integers".

2.  **Use of Native `number` in Financial Logic (`MarketWatcher`)**
    *   **Location:** `src/services/marketWatcher.ts` (`fillGaps` method).
    *   **Issue:** The `fillGaps` method iterates through candle data and performs arithmetic/assignments using native `number` types (e.g., `curr.time`, `prev.close`). The `KlineRaw` interface seems to expect numbers.
    *   **Risk:** Cumulative floating-point errors in chart data (gap filling), leading to inaccurate technical analysis signals.
    *   **Recommendation:** Refactor `fillGaps` and `KlineRaw` to use `Decimal` exclusively.

3.  **GC Thrashing & Performance Risk in `MarketManager`**
    *   **Location:** `src/stores/market.svelte.ts` (`applySymbolKlines`).
    *   **Issue:** The method performs heavy array manipulations (`splice`, `push`, spread operators) and extensive object allocations (`new Decimal`) on every WebSocket update. The `BufferPool` implementation is partial and complex, potentially leading to memory leaks or "thrashing" where buffers are created and discarded rapidly.
    *   **Risk:** UI stuttering during high-volatility periods; browser memory bloat leading to crashes.
    *   **Recommendation:** Simplify the buffer logic or switch to a strictly circular buffer implementation for real-time data.

---

## 🟡 WARNING (Performance issue, UX error, missing i18n)

1.  **Fragile JSON Parsing Strategy**
    *   **Location:** `src/utils/safeJson.ts`.
    *   **Issue:** The regex `\d[\d.eE+-]{14,}` targets numbers with 15+ characters. This catches large integers (IDs) but might miss smaller numbers with critical precision requirements or misinterpret strings that look like numbers in edge cases.
    *   **Recommendation:** Replace regex-based patching with a robust `JSON.parse` reviver function or a dedicated library like `json-bigint` to safely handle all numeric types.

2.  **Potential Race Condition in `TradeService`**
    *   **Location:** `src/services/tradeService.ts` (`ensurePositionFreshness`).
    *   **Issue:** The method fetches positions from API if the cache is stale, but if multiple calls happen simultaneously, it might trigger redundant API calls or race conditions in updating the `omsService`.
    *   **Recommendation:** Implement a "Promise Lock" or request deduplication for the position fetch, similar to `MarketWatcher`.

3.  **Missing I18n Keys / Hardcoded Strings**
    *   **Location:** Various components.
    *   **Issue:** While `PortfolioInputs.svelte` uses `$_`, the "Fast Path" in `BitunixWs` logs warnings in English (hardcoded). `STATUS_AND_RISK_REPORT_FINAL.md` noted missing keys in `settings.errors`, though `en.json` seems to have `invalidApiKey`. However, `ipNotAllowed` and others might be missing or mismatched.
    *   **Recommendation:** Run a full audit script to match all `$_('key')` usages against `en.json`.

---

## 🔵 REFACTOR (Technical Debt)

1.  **Complex Logic in `shouldFetchNews`**
    *   **Location:** `src/services/newsService.ts`.
    *   **Issue:** The conditional logic for determining cache validity is deeply nested and hard to unit test.
    *   **Recommendation:** Extract into a pure function `isCacheValid(entry, now, quotaStatus)` and add unit tests.

2.  **Redundant Code in `BitunixWs`**
    *   **Location:** `src/services/bitunixWs.ts`.
    *   **Issue:** The manual "Fast Path" parsing duplicates the logic of Zod schemas but with less safety.
    *   **Recommendation:** Consolidate validation logic. If Zod is too slow, optimize the Zod schema or use a faster validator (e.g., TypeBox), but don't maintain two parallel parsing paths.

---

## ✅ STATUS QUO (Positive Findings)

*   **Strict Decimal Usage:** `TradeService` correctly uses `Decimal.js` for all order calculations.
*   **Architecture:** The `MarketWatcher` uses a hybrid Polling/WebSocket approach which is robust against socket disconnects.
*   **Safety:** `flashClosePosition` implements excellent "Two Generals" problem mitigation.
*   **Modern Svelte:** The codebase consistently uses Svelte 5 Runes (`$state`, `$derived`, `$effect`).
