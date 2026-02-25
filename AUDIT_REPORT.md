# Cachy App Audit Report - Phase 1

**Date:** 2026-05-22
**Status:** Initial Analysis Complete
**Auditor:** Senior Lead Developer (Jules)

---

## Executive Summary

The codebase demonstrates a strong foundation with modern architectural patterns (Svelte 5 Runes, Service/Store separation, Worker offloading). Key critical areas like financial calculation using `Decimal.js` and WebSocket resilience are largely in place. However, several high-risk areas were identified regarding data integrity, particularly around "Fast Path" optimizations and loose typing in API responses.

## 🔴 CRITICAL: Risk of financial loss, crash, or data corruption

### 1. Fragile "Fast Path" Regex in WebSocket Parsing
- **Location:** `src/services/bitunixWs.ts` (Lines ~350, ~460)
- **Issue:** The service uses a regex replacement to quote numeric values in raw JSON strings before parsing:
  ```typescript
  const regex = /"(p|v|...|close)":\s*(-?\d+(\.\d+)?([eE][+-]?\d+)?)/g;
  ```
  This is extremely fragile. If the API changes spacing (e.g., adds a space after colon) or sends a new field name that matches the partial regex but isn't a number, this logic could corrupt the JSON or fail to quote a high-precision number, leading to silent precision loss (e.g., `0.00000001` becoming `1e-8` which might be mishandled by downstream logic expecting strings).
- **Recommendation:** Remove regex parsing. Use `json-bigint` or a custom `JSON.parse` reviver that handles large numbers safely, or strictly validate that the regex covers all edge cases (it currently misses `SPACE` after colon).

### 2. Unsafe Type Casting in Trade Service
- **Location:** `src/services/tradeService.ts`
- **Issue:** `fetchTpSlOrders` casts API responses to `TpSlOrder[]` without runtime validation (Zod).
  ```typescript
  return (Array.isArray(data) ? data : data.rows || []) as TpSlOrder[];
  ```
  The `TpSlOrder` interface uses `[key: string]: unknown`, effectively bypassing type safety. If the API changes the structure of `triggerPrice` or `qty` (e.g., from string to number), the application will crash or miscalculate when it tries to use these fields.
- **Recommendation:** Implement a strict Zod schema for `TpSlOrder` and use `safeParse` similar to `PositionRawSchema`.

### 3. Potential Data Integrity Risk in `MarketWatcher`
- **Location:** `src/services/marketWatcher.ts` (Line ~330 `fillGaps`)
- **Issue:** The gap filling logic has a fallback:
  ```typescript
  if (klines[0] && !(klines[0].open instanceof Decimal)) { return klines; }
  ```
  This suggests that `klines` might contain raw numbers mixed with Decimals. If `fillGaps` returns mixed types, downstream consumers expecting `Decimal` methods (like `.plus()`, `.times()`) will crash.
- **Recommendation:** Enforce `Decimal` conversion at the *boundary* (API/WS ingress) and remove loose checks deep in the logic.

## 🟡 WARNING: Performance, UX, or potential instability

### 1. Hardcoded Error Strings & Missing i18n
- **Location:** `src/services/tradeService.ts`, `src/components/`
- **Issue:** Error messages like `throw new Error("apiErrors.missingCredentials")` are good (keys), but `throw new BitunixApiError(...)` often passes raw English messages from the API directly to the UI.
  - `src/routes/api/orders/+server.ts`: Logic mixes localized error constants (`ORDER_ERRORS`) with raw text.
- **Recommendation:** Create a comprehensive `ErrorService` that maps all backend error codes to i18n keys.

### 2. Resource Management: Unbounded Buffer Growth Risk
- **Location:** `src/stores/market.svelte.ts`
- **Issue:** `pendingKlineUpdates` has a hard limit (`KLINE_BUFFER_HARD_LIMIT = 2000`). While this prevents OOM, hitting this limit triggers a forced flush which might cause UI stutters during high volatility.
- **Recommendation:** Implement a dynamic backpressure mechanism or adaptive sampling if the buffer fills too quickly.

### 3. "Zombie" Request Handling
- **Location:** `src/services/marketWatcher.ts`
- **Issue:** The `pruneZombieRequests` logic relies on `requestStartTimes` and a fixed timeout (20s). If the system clock drifts or the browser throttles heavily (background tab), valid long-polling requests might be killed prematurely, causing unnecessary re-fetching.
- **Recommendation:** Use `performance.now()` for monotonic time tracking instead of `Date.now()`.

## 🔵 REFACTOR: Technical Debt & Maintainability

### 1. Mixed Exchange Logic in API Route
- **Location:** `src/routes/api/orders/+server.ts`
- **Issue:** The `POST` handler contains large `if (exchange === "bitunix") ... else if (exchange === "bitget")` blocks. This violates the Open/Closed principle. Adding a new exchange requires modifying this monolithic file.
- **Recommendation:** Refactor into a `ExchangeAdapter` pattern where each exchange has its own class implementing a common `IExchange` interface.

### 2. Duplicate Type Definitions
- **Location:** `src/types/` vs `src/services/*Types.ts`
- **Issue:** There seems to be overlap between `apiSchemas.ts` and `omsTypes.ts` / `technicalsTypes.ts`.
- **Recommendation:** Consolidate domain entities into a single source of truth.

---
**Next Steps:** Proceed to Phase 2 (Hardening & Remediation) to address the Critical issues first.
