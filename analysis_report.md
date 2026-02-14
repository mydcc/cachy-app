# Systematic Maintenance & Hardening Analysis Report

## Summary
This report analyzes the current state of the `cachy-app` codebase, focusing on data integrity, resource management, UI/UX, and security.

### Prioritized Findings

#### 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1.  **Missing i18n Keys in Error Handling (`src/services/tradeService.ts`)**:
    *   **Finding:** The keys `trade.closeAbortedSafety` and `trade.apiError` are thrown as errors but do not exist in `src/locales/locales/en.json`.
    *   **Impact:** Users will see raw key strings instead of localized error messages during critical failures (e.g., closing a position fails). This can lead to confusion and panic during high-stress trading scenarios.
    *   **Recommendation:** Add these keys to `en.json` immediately.

2.  **Potential Data Gap in `MarketWatcher` (`src/services/marketWatcher.ts`)**:
    *   **Finding:** The `fillGaps` method has a hard limit of `MAX_GAP_FILL = 5000`. If a gap exceeds this (e.g., prolonged downtime), the loop terminates, and the next candle is appended without filling the remaining gap. This creates a discontinuous data series.
    *   **Impact:** Technical indicators relying on continuous time series may produce incorrect signals.
    *   **Recommendation:** Add a warning log when this limit is hit to alert developers/operators. Consider implementing a backfill trigger or smarter gap handling for large gaps.

#### 🟡 WARNING (Performance issue, UX error, missing i18n)

1.  **Confusing Logic in WebSocket "Fast Path" (`src/services/bitunixWs.ts`)**:
    *   **Finding:** Comments in the "Fast Path" section explicitly state it bypasses Zod validation for performance. However, the implementation *uses* `StrictPriceDataSchema.safeParse` (Zod) inside the block. This contradicts the comment and potentially misleads maintainers about the performance characteristics.
    *   **Impact:** Maintenance confusion. If the intent was truly to bypass Zod for speed, the implementation fails. If safety is paramount (which it is), the comment is wrong.
    *   **Recommendation:** Update comments to reflect reality: "Fast Path prioritizes specific channels but still validates structure using strict schemas."

2.  **Numeric Precision warnings in Logs**:
    *   **Finding:** `bitunixWs.ts` has logic to warn about numeric precision loss if values are numbers instead of strings. While good, if the API starts sending numbers (e.g. for `lastPrice`), this could flood logs if not throttled correctly (it throttles every 60s per symbol, which is reasonable).
    *   **Recommendation:** Ensure this logging is monitored in production.

#### 🔵 REFACTOR (Code smell, technical debt)

1.  **Redundant Error Handling Keys**:
    *   **Finding:** `tradeService.ts` defines `TRADE_ERRORS` constants but also uses string literals in some `throw new Error(...)` calls.
    *   **Recommendation:** Unify error throwing to use the constants consistently.

2.  **Market Manager Object Growth**:
    *   **Finding:** `MarketManager` stores data in a plain object `data`. While `enforceCacheLimit` exists, rapid symbol switching could theoretically bloat memory before cleanup runs.
    *   **Recommendation:** Continue monitoring memory usage. The current LRU implementation is adequate for now.

## Conclusion
The codebase is generally robust with good use of `Decimal.js` for financial calculations and defensive programming patterns. The critical issues identified are primarily related to missing localization keys for error states, which is a low-effort, high-impact fix.
