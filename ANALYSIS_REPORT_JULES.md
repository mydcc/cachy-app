# Analysis Report - Systematic Maintenance & Hardening

**Date:** 2026-05-23
**Author:** Jules (Senior Lead Developer)
**Target:** cachy-app (Pro Trading Platform)

## 1. Status Overview

The codebase demonstrates a high level of maturity in several areas, particularly in using `Decimal.js` for financial calculations and `Zod` for schema validation. The architecture separates concerns well (Services, Stores, Components).

However, **CRITICAL** vulnerabilities related to user input parsing were identified that could lead to immediate financial loss (e.g., selling 1 unit instead of 1,000).

## 2. Findings

### 🔴 CRITICAL (Financial Loss / Security)

1.  **Input Parsing Ambiguity ("The 1,000 -> 1 Bug")**
    *   **Location:** `src/utils/utils.ts` (`parseDecimal`) and `src/components/inputs/TradeSetupInputs.svelte` (`parseInputVal`).
    *   **Issue:** The input logic often blindly replaces `,` with `.` (`val.replace(",", ".")`).
    *   **Scenario:** A user enters or pastes "1,000" (English notation for one thousand). The code converts this to "1.000", which `Decimal` parses as `1`.
    *   **Impact:** Orders are executed with 1/1000th of the intended quantity.
    *   **Remediation:** Implement strict localization parsing. Ambiguous inputs like "1,000" should either be rejected or parsed based on strict heuristics (e.g., "comma followed by exactly 3 digits" = thousands separator).

2.  **Missing Quantity Validation in TradeService**
    *   **Location:** `src/services/tradeService.ts` (`flashClosePosition`).
    *   **Issue:** While `omsService` is trusted, corrupt state (NaN/Zero) could propagate to API calls. `flashClosePosition` does not explicitly validate that `position.amount` is positive before sending a "SELL" order.
    *   **Impact:** API might reject the order (best case) or behave unpredictably.
    *   **Remediation:** Add explicit `qty.gt(0)` checks.

### 🟡 WARNING (UX / Performance / Stability)

1.  **Uncaught Promises in MarketWatcher**
    *   **Location:** `src/services/marketWatcher.ts` (`performPollingCycle`).
    *   **Issue:** The polling loop fires async `pollSymbolChannel` tasks but does not await them or attach a `.catch()` handler within the cycle loop (it relies on internal try/catch, but a sync error before the promise wraps could bubble up).
    *   **Impact:** Potential unhandled rejection if the Promise construction fails.

2.  **Hardcoded Strings (i18n)**
    *   **Location:** `PerformanceMonitor.svelte`, `AiTab.svelte`, `TechnicalsPanel.svelte`.
    *   **Issue:** UI text is hardcoded in English.
    *   **Impact:** Non-English users (DE) see mixed languages.

3.  **Zombie Request Risk**
    *   **Location:** `src/services/marketWatcher.ts`.
    *   **Issue:** While `pruneZombieRequests` exists, the complexity of locks (`pendingRequests`, `requests` Map) invites race conditions.
    *   **Remediation:** Robustify the locking mechanism.

### 🔵 REFACTOR (Technical Debt)

1.  **Duplicate Kline Fetching Logic**
    *   `src/routes/api/klines/+server.ts` and `src/services/apiService.ts` share similar logic for Bitunix/Bitget kline fetching.
    *   **Recommendation:** Centralize this logic if possible, though separation of concern (Client vs Server) justifies it partially.

## 3. Implementation Plan

A hardening plan has been devised to address these issues, starting with the critical Input Parsing vulnerability.
