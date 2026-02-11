# Status & Risk Report (Institutional Grade Audit)

**Date:** 2026-05-21
**Auditor:** Jules (Senior Lead Developer)
**Scope:** Core Services (Trade, Market, News), Data Integrity, Resource Management

## Executive Summary
The codebase demonstrates a solid foundation with widespread use of `Decimal.js` for financial precision and `zod` for validation. However, several "hot paths" exhibit potential for memory pressure, and error handling in critical trade execution paths relies on optimistic assumptions or fragile string matching.

---

## 🔴 CRITICAL (Immediate Action Required)

### 1. Fragile Error Mapping in UI
*   **Location:** `src/components/inputs/PortfolioInputs.svelte` (`mapApiErrorToLabel`)
*   **Risk:** UX / Operational Confusion
*   **Details:** The logic relies on regex matching of English error messages (e.g., `/api key/i`). If the backend locale changes or error formats update, users will see raw, unhelpful errors or no feedback.
*   **Recommendation:** Implement error code based mapping (e.g., `10002` -> `settings.errors.invalidApiKey`) instead of string scraping.

### 2. Error Swallowing in Trade Cancellation
*   **Location:** `src/services/tradeService.ts` (`cancelAllOrders`)
*   **Risk:** Financial Risk (Naked Positions)
*   **Details:** The method defaults to `throwOnError = false`. While `flashClosePosition` uses `true`, other future implementations might rely on the default behavior, leading to silent failures where open orders remain active after a strategy assumes them cancelled.
*   **Recommendation:** Change default to `throwOnError = true` or enforce explicit handling in all call sites.

### 3. Allocation Hot Spot in Market Data Stream
*   **Location:** `src/services/marketWatcher.ts` (`fillGaps`)
*   **Risk:** Performance / GC Pressure
*   **Details:** The `fillGaps` function creates new object literals in a loop for every gap. During high volatility or network catch-up, this generates significant garbage for the collector, potentially causing frame drops.
*   **Recommendation:** Reuse a static "Zero/Flat Candle" object or flyweight pattern where possible, or optimize the loop to avoid allocation.

---

## 🟡 WARNING (High Priority)

### 1. Loose Typing in Order Management
*   **Location:** `src/services/tradeService.ts` (`fetchTpSlOrders`)
*   **Risk:** Runtime Errors
*   **Details:** Uses `any` type for `o` in map/filter operations (`o.id || o.orderId || o.planId`). This defeats TypeScript's safety guarantees and risks `undefined` access if the API schema drifts.
*   **Recommendation:** Define a strict `TpSlRawSchema` using Zod and parse strictly before access.

### 2. Hardcoded Concurrency Limits
*   **Location:** `src/services/marketWatcher.ts`
*   **Risk:** Rate Limiting / Latency
*   **Details:** `maxConcurrentPolls` is hardcoded to `6`. This does not account for different API tier limits or changing network conditions.
*   **Recommendation:** Move to a dynamic `TokenBucket` managed by `apiQuotaTracker` or `settingsState`.

### 3. Hardcoded Coin Aliases
*   **Location:** `src/services/newsService.ts`
*   **Risk:** Maintenance Burden / Missed Data
*   **Details:** `COIN_ALIASES` is a static object. New coins require code changes.
*   **Recommendation:** Move aliases to an external config or fetch dynamically.

---

## 🔵 REFACTOR (Technical Debt)

*   **Serialization Depth:** `TradeService.serializePayload` uses an arbitrary depth limit of 20. Should be configurable or iterative.
*   **Duplicate Validation Logic:** `MarketManager` and `TradeService` both implement partial validation logic. Should centralize in `src/services/mappers.ts`.
*   **Frontend Validation:** `PortfolioInputs` uses regex `/^\d*\.?\d*$/` which allows `.5` but maybe not locale-specific formats (commas). Should use `Intl.NumberFormat` aware parsing.

---

## Next Steps (Action Plan)

1.  **Refactor Error Handling:** Centralize API error codes in `src/utils/errorUtils.ts`.
2.  **Harden Trade Service:** Enforce strict Zod schemas for all order types.
3.  **Optimize Market Watcher:** Rewrite `fillGaps` for zero-allocation where possible.
