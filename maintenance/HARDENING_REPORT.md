# Status & Risk Report (Hardening Phase)

**Date:** 20.02.2026
**Author:** Jules (Senior Lead Developer & Systems Architect)
**Status:** DRAFT (Analysis Complete)

This report summarizes the findings of the in-depth analysis of the `cachy-app` repository. The focus was on data integrity, security, and stability for professional trading use.

---

## 🔴 CRITICAL (CRITICAL)
*Risks of financial loss, crashes, or security vulnerabilities.*

1.  **Precision Loss in `BitunixWs` ("Fast Path")**:
    *   **Location:** `src/services/bitunixWs.ts` (`handleMessage` method -> Fast Path Block).
    *   **Description:** The "Fast Path" optimization manually casts `number` values to strings (`safeString(data.ip, ...)`). However, since `JSON.parse` (via `safeJsonParse`) has *already* run before this block, floating-point numbers have already been converted to native JavaScript numbers. This leads to irreversible precision loss for large integers (e.g., Order IDs > `2^53`) or small decimals (e.g., `0.00000001` -> `1e-8`) before they reach `Decimal.js`.
    *   **Risk:** Financial calculations could be based on inaccurate values. Order IDs could be corrupted.
    *   **Recommendation:** Remove the "Fast Path" or restrict it strictly to fields known to be safe. Use Zod schemas that handle string transformation (which is already implemented in the "Slow Path").

2.  **GC Thrashing ("Memory Churn") in `MarketManager`**:
    *   **Location:** `src/stores/market.svelte.ts` (`rebuildBuffers`, `appendBuffers`).
    *   **Description:** On every Kline update that changes the array size (new candle), completely new `Float64Array` instances are allocated from the `BufferPool`. While `BufferPool` recycles memory, `appendBuffers` creates a *new* buffer and copies data every time. This results in $O(N)$ allocation behavior for every single candle update.
    *   **Risk:** High Garbage Collection load leads to UI stuttering and increased memory usage, unacceptable for high-frequency trading.
    *   **Recommendation:** Implement a "Capacity"-based system where buffers are over-allocated (e.g., doubled) and `length` is tracked separately to avoid re-allocation on every update.

---

## 🟡 WARNING (WARNING)
*Performance issues, UX errors, or missing i18n.*

1.  **Main Thread Blocking in `MarketWatcher` (`fillGaps`)**:
    *   **Location:** `src/services/marketWatcher.ts` (`fillGaps`).
    *   **Description:** The gap-filling logic iterates up to `MAX_GAP_FILL = 5000` times. If called frequently with large data gaps (e.g., network outage recovery), this synchronous loop can freeze the main thread.
    *   **Risk:** UI unresponsiveness during data recovery.
    *   **Recommendation:** Move gap-filling logic to a Web Worker or optimize the loop (e.g., batch processing or yielding).

2.  **Potential "Naked Position" Risk in `TradeService`**:
    *   **Location:** `src/services/tradeService.ts` (`flashClosePosition`).
    *   **Description:** The function attempts to cancel open orders *before* closing the position. If cancellation fails (e.g., API timeout), the close operation is aborted (`throw new Error("trade.closeAbortedSafety")`).
    *   **Risk:** The user intends to close the position immediately (Panic Button behavior), but the system refuses because it couldn't cancel a TP/SL. This leaves the user exposed to the market against their will.
    *   **Recommendation:** Change logic to "Best Effort": Try to cancel orders, log errors if it fails, but *proceed* with closing the position (perhaps with a user warning).

---

## 🔵 REFACTOR (Technical Debt)
*Maintainability and Code Quality.*

1.  **Duplicate/Complex Validation Logic**:
    *   **Location:** `src/services/bitunixWs.ts` vs `src/types/bitunixValidation.ts`.
    *   **Description:** The "Fast Path" duplicates validation logic that exists in Zod schemas. This violates DRY and increases the risk of inconsistencies.

2.  **`PortfolioInputs` Empty String Handling**:
    *   **Location:** `src/components/inputs/PortfolioInputs.svelte`.
    *   **Description:** While currently hardened (`if (value === "") return "0"`), the logic relies on implicit behaviors between local state and store updates.
    *   **Recommendation:** Explicitly handle `null` vs `""` vs `"0"` in the store schemas to avoid ambiguity.

---

## ✅ STATUS QUO (Positive Findings)

*   **Decimal.js Usage:** `TradeService` and `MarketManager` (mostly) use `Decimal.js` correctly for price math.
*   **I18n Coverage:** An automated audit (`scripts/check_translations.sh`) confirmed that translation keys are synchronized between EN and DE.
*   **Safety:** `safeJsonParse` is used globally to prevent crashes on malformed API responses.
*   **Zod Validation:** Strict schemas are in place for API responses (when not bypassed by Fast Path).

