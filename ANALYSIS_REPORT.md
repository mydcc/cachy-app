# Status & Risk Report: Cachy-App Codebase Analysis

**Date:** 2026-05-25
**Auditor:** Jules (Senior Lead Developer)
**Scope:** Full Repository Scan (Services, Stores, UI)
**Status:** 🟡 WARNING (Requires Hardening before Production)

## Executive Summary

The codebase demonstrates a high degree of sophistication ("Institutional Grade") in several areas:
- **State Management:** `market.svelte.ts` uses advanced buffering, SoA (Structure of Arrays) for Klines, and Svelte 5 runes correctly.
- **Resilience:** `TradeService` implements "Two Generals" problem handling for network failures during closing.
- **Performance:** `BitunixWs` employs a "Fast Path" to bypass Zod validation for high-frequency ticks.

However, critical vulnerabilities related to floating-point precision in API handling and widespread I18n gaps in the UI pose significant risks.

---

## 🔴 CRITICAL (High Priority)
*Risk of financial loss, data corruption, or severe crash.*

1.  **Precision Vulnerability in `apiService.ts` (`fetchTicker24h`)**
    -   **Location:** `src/services/apiService.ts` (Line ~442)
    -   **Issue:** The method calls `const data = await response.json()` directly.
    -   **Risk:** This bypasses `safeJsonParse`. Large numeric values (prices, volumes) will be parsed as native JavaScript numbers, causing precision loss for assets with high decimal granularity or large integers (e.g. SHIB volume).
    -   **Fix:** Replace with `await apiService.safeJson(response)`.

2.  **Unsafe Default in `closePosition`**
    -   **Location:** `src/services/tradeService.ts`
    -   **Issue:** If `amount` is not provided to `closePosition`, it defaults to closing the **entire** position.
    -   **Risk:** Accidental full closure of a position when a partial close was intended, if the UI passes `undefined`.
    -   **Fix:** Throw an error if `amount` is missing, or require an explicit `closeAll` flag.

3.  **Direct API Calls bypassing Service Layer**
    -   **Location:** `src/components/shared/TpSlEditModal.svelte`
    -   **Issue:** Uses `fetch("/api/tpsl", ...)` directly instead of `tradeService`.
    -   **Risk:** Bypasses centralized error handling, retry policies, and logging defined in `TradeService`.
    -   **Fix:** Refactor to use `tradeService.modifyPosition()`.

---

## 🟡 WARNING (Medium Priority)
*UX degradation, potential instability, or missing standards.*

1.  **Recursive Polling Risk in `MarketWatcher`**
    -   **Location:** `src/services/marketWatcher.ts`
    -   **Issue:** Uses `setTimeout` to recursively call `runPollingLoop`. If `performPollingCycle` hangs (promise never resolves), the loop terminates permanently.
    -   **Fix:** Wrap `performPollingCycle` in a `Promise.race` with a timeout to ensure the loop always continues.

2.  **Loose Type Guards in WebSocket Fast Path**
    -   **Location:** `src/services/bitunixWs.ts`
    -   **Issue:** `isPriceData` relies on negative checks (`typeof d !== 'object'`). While currently safe, it is fragile against API schema changes.
    -   **Fix:** Add stronger property existence checks.

3.  **Widespread Missing I18n (Hardcoded Strings)**
    -   **Locations:**
        -   `src/components/shared/MarketDashboardModal.svelte` (Headers, Status, Empty States)
        -   `src/components/shared/TpSlEditModal.svelte` (Entire component)
        -   `src/components/settings/tabs/SystemTab.svelte` (`alert` messages)
    -   **Issue:** UI contains English strings mixed with translation keys.
    -   **Fix:** Extract all strings to `src/locales/locales/en.json`.

4.  **Blocking User Experience (`alert()`)**
    -   **Location:** `TpSlList.svelte`, `VisualsTab.svelte`.
    -   **Issue:** Uses native `window.alert()` for errors.
    -   **Fix:** Replace with `toastService.error()`.

5.  **Use of `parseFloat` in Financial Inputs**
    -   **Location:** `src/components/inputs/TradeSetupInputs.svelte`
    -   **Issue:** `parseFloat` is used for `atrMultiplier` and `priceStep`.
    -   **Risk:** Minor precision issues.
    -   **Fix:** Use `new Decimal()` or string manipulation for all input logic.

---

## 🔵 REFACTOR (Low Priority)
*Technical debt and code hygiene.*

1.  **Console Log Leftovers**
    -   **Location:** `src/routes/+layout.svelte`, `src/services/bitunixWs.ts` (commented out logs).
    -   **Action:** Remove `console.log` in production code; use `logger` service.

2.  **JSON.parse usage in Stores**
    -   **Location:** `trade.svelte.ts`, `journal.svelte.ts`.
    -   **Action:** Verify if these stores persist large numbers. If so, switch to `safeJsonParse`.

---

## Next Steps (Action Plan)

1.  **Fix Criticals:** Patch `apiService` and `tradeService`.
2.  **Hardening:** Secure `MarketWatcher` loop and remove `alert()`.
3.  **Localization:** Extract strings for `MarketDashboardModal` and `TpSlEditModal`.
