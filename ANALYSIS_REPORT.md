# Code Analysis & Risk Report

**Date:** 2026-10-25
**Scope:** `src/services`, `src/stores`, `src/components/inputs`
**Focus:** Data Integrity, Resource Management, UI/UX, Security

## Executive Summary

The codebase exhibits a high degree of "Institutional Grade" maturity. Critical financial logic uses `Decimal.js` consistently, ensuring precision. The WebSocket and API layers employ sophisticated resilience patterns (deduplication, token bucket rate limiting, circuit breakers, and "Fast Path" optimization).

However, there are localized UX/I18n gaps and specific architectural trade-offs (e.g., "Best Effort" order cancellation) that present operational risks.

## Findings

### 🔴 CRITICAL (Financial Risk / Data Integrity)

*   **"Naked Stop Loss" Risk in `TradeService.ts`**:
    *   **Context:** `flashClosePosition` calls `cancelAllOrders(symbol, false)`. The `false` flag means if the cancellation fails (e.g., network timeout), the code *proceeds* to close the position anyway.
    *   **Risk:** If the close succeeds but the cancellation failed, the user is left with a closed position but active Stop Loss/Take Profit orders. If price moves, these could trigger unintended new positions.
    *   **Recommendation:** This is a design trade-off (Prioritize Closing > Clean State). It requires a robust "Unconfirmed Order" UI notification to alert the user to manually check open orders.

*   **Numeric Precision in WebSocket (`bitunixWs.ts`)**:
    *   **Context:** Fast Path parsing casts `data.lastPrice` to string.
    *   **Risk:** If the exchange sends a standard JavaScript number for a price with >15 digits of precision, native JSON parsing *before* our handler runs could lose precision.
    *   **Mitigation:** The code includes a check (`lastNumericWarning`) to log this. No immediate fix possible without a custom JSON parser, but the current string casting is the correct mitigation.

### 🟡 WARNING (UX / I18n / Performance)

*   **Missing I18n Keys (Hardcoded Strings)**:
    *   `src/components/inputs/PortfolioInputs.svelte`:
        *   "Failed to fetch balance"
        *   "Invalid balance data received"
        *   "Error fetching balance"
    *   `src/components/inputs/TradeSetupInputs.svelte`:
        *   "Failed to copy to clipboard"
    *   **Impact:** Poor UX for non-English users.

*   **Error Swallowing in `TradeService`**:
    *   **Context:** `fetchOpenPositionsFromApi` catches errors and logs them (`logger.warn`), but does not propagate them up to the UI in some flows.
    *   **Impact:** User might see stale data without an error banner if the sync fails silently.

*   **Hardcoded Coin Aliases (`NewsService.ts`)**:
    *   **Context:** `COIN_ALIASES` contains a hardcoded list (BTC, ETH, etc.).
    *   **Risk:** Missing coverage for new assets (e.g., SUI, APT) without code changes.

### 🔵 REFACTOR (Technical Debt)

*   **`MarketWatcher` Complexity**: The class mixes polling, WebSocket coordination, and history backfilling. While robust, it is difficult to test.
*   **Magic Numbers**: `TradeSetupInputs` uses `1000` as a deviation threshold. Should be a constant.

## Recommendations for Step 2 (Implementation)

1.  **I18n Hardening:** Extract all identified hardcoded strings to `src/locales/locales/en.json` and regenerate types.
2.  **Safety Verification:** Add a regression test for `TradeService.flashClosePosition` to verify the "Unconfirmed" state handling.
3.  **News Service:** Externalize `COIN_ALIASES` or fetch from a dynamic list.

## Conclusion

The system is solid. The primary tasks are "polishing" (I18n) and ensuring the "Risk Trade-offs" (like the naked SL) are visible to the user via the UI.
