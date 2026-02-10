# Status & Risk Report - Cachy App

**Date:** 2026-05-20
**Role:** Senior Lead Developer & Systems Architect
**Scope:** Core Systems (Market Data, Trading, WebSocket, UI/i18n)

## Executive Summary
The codebase shows a solid foundation with professional features (Decimal.js usage, Zod validation, Reactive Stores). However, recent expansions have introduced critical stability risks in the WebSocket "Fast Path", gaps in error handling for trading operations, and performance bottlenecks in high-frequency data processing. Additionally, hardcoded strings in the UI compromise the application's internationalization compliance.

## Findings

### 🔴 CRITICAL (Immediate Action Required)

1.  **WebSocket "Fast Path" Vulnerability (`src/services/bitunixWs.ts`)**
    *   **Finding:** The `handleMessage` function implements a "Fast Path" optimization (lines ~430+) that manually parses incoming JSON to bypass Zod validation for performance. This logic casts fields like `data.lastPrice` directly.
    *   **Risk:** If the API sends an unexpected type (e.g., `null`, `object`, or `number` when `string` is expected) or changes a field name, this code block may crash the WebSocket handler or pollute the store with invalid data (NaN).
    *   **Recommendation:** Wrap the Fast Path in a dedicated `try-catch` block that falls back to the standard Zod validation on failure. Add explicit `typeof` guards before assignment.

2.  **Silent Failures in TP/SL Fetching (`src/services/tradeService.ts`)**
    *   **Finding:** The `fetchTpSlOrders` method iterates through all active symbols to fetch orders. If one API call fails (e.g., rate limit or specific symbol maintenance), the error is caught and logged, but the function continues and returns a partial list.
    *   **Risk:** The user may see an empty or incomplete list of pending orders, leading them to believe they have no open risk, while orders actually exist on the exchange.
    *   **Recommendation:** Implement a mechanism to flag partial failures to the UI (e.g., return `{ orders: [], errors: [] }` or push a warning notification) so the user knows the data is incomplete.

3.  **Market History Backfill Freeze Risk (`src/services/marketWatcher.ts`)**
    *   **Finding:** The `fillGaps` function fills missing candles in a `while` loop. Although capped by `MAX_GAP_FILL`, a misconfiguration or API bug returning a 0ms interval could cause a main-thread freeze.
    *   **Recommendation:** Add a sanity check for `intervalMs > 0` and enforce a stricter loop timeout or yield control.

### 🟡 WARNING (High Priority)

1.  **Performance Bottleneck in Market Store (`src/stores/market.svelte.ts`)**
    *   **Finding:** `applySymbolKlines` rebuilds the entire `Float64Array` buffer set (`rebuildBuffers`) on every update if the update path is not strictly "new candle append". For high-frequency updates (live price ticking on the current candle), this is unnecessary object allocation.
    *   **Impact:** Increased GC pressure and CPU usage during high volatility, potentially causing UI stutter.
    *   **Recommendation:** Implement an "in-place update" strategy for the current candle (update last index) to avoid rebuilding the array.

2.  **Hardcoded Strings & i18n Violations (`src/components/shared/SidePanel.svelte`)**
    *   **Finding:** The Side Panel contains hardcoded German strings ("Analysiere den Markt...", "Erstelle eine technische Analyse...") in the AI Quick Actions, regardless of the selected language. UI labels like "You" and "AI" are also hardcoded.
    *   **Impact:** Breaks the application for non-German users and violates i18n standards.
    *   **Recommendation:** Extract all strings to `en.json` and `de.json` and use the `$_()` translation helper.

3.  **Complex News Service Logic (`src/services/newsService.ts`)**
    *   **Finding:** `fetchNews` mixes logic for CryptoPanic, NewsAPI, Discord, and RSS in a single massive function.
    *   **Impact:** Hard to test and maintain.
    *   **Recommendation:** Refactor into separate provider classes (Strategy Pattern) in a future cycle.

### 🔵 REFACTOR (Technical Debt)

1.  **Manual Promise Management in MarketWatcher**
    *   **Finding:** `pendingRequests` maps are used for deduplication, but lack a unified interface for cancellation or timeout handling beyond manual `setTimeout`.
    *   **Recommendation:** Use a dedicated `RequestManager` class to handle request lifecycles.

## Action Plan
The immediate focus is on **Financial Safety** (WebSocket/TradeService) and **Performance** (Market Store).

1.  **Harden WebSocket:** Add type guards and fallback logic.
2.  **Fix Trade Service:** Expose partial errors.
3.  **Optimize Store:** Implement zero-allocation updates for live candles.
4.  **Fix i18n:** Externalize hardcoded strings.
