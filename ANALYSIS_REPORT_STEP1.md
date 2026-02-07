# Status & Risk Report (Phase 1)

## Executive Summary
The codebase demonstrates a high level of sophistication with advanced features like "Fast Path" WebSocket parsing, `Float64Array` buffers for market data, and server-side Markdown rendering. However, critical vulnerabilities exist in the order execution path ("Naked Stop Loss") and data validation layers (`api/tpsl`).

## 🔴 CRITICAL FINDINGS (Immediate Action Required)

### 1. "Naked Stop Loss" Risk in `TradeService`
- **Location:** `src/services/tradeService.ts` (`flashClosePosition`)
- **Issue:** The `flashClosePosition` method attempts to cancel open orders (TP/SL) *before* closing the position. If cancellation fails (network error), it logs the error but proceeds to close the position.
- **Risk:** A user could be left with a closed position but active Stop Loss orders, which could trigger a new unintended position if the price moves.
- **Recommendation:** Implement a "Safe Close" mechanism that retries cancellation or aborts the close if cancellation is impossible, or at least alerts the user definitively.

### 2. "Fast Path" Bypass Validation in `BitunixWs`
- **Location:** `src/services/bitunixWs.ts`
- **Issue:** The WebSocket handler explicitly bypasses Zod validation for `price`, `ticker`, and `depth` messages for performance. While manual casting exists, it relies on `safeJsonParse` logic without schema guarantees.
- **Risk:** If the API schema changes (e.g. `lastPrice` becomes an object), the app could crash or process corrupted data.
- **Recommendation:** Wrap the "Fast Path" in a strict `try-catch` block that falls back to the standard Zod validation path on *any* error, and add telemetry for Fast Path failures.

### 3. Security Vulnerability in `TpSlEditModal` & `api/tpsl`
- **Location:** `src/components/shared/TpSlEditModal.svelte`, `src/routes/api/tpsl/+server.ts`
- **Issue:**
    1. The modal constructs a raw `fetch` request, sending `apiKey` and `apiSecret` in the JSON body.
    2. The server endpoint (`api/tpsl`) accepts `params` as `any` without Zod validation.
    3. The server endpoint does not explicitly redact keys in its error logs (unlike `api/orders`).
- **Risk:** Potential key leakage in logs and lack of input sanitization for financial parameters (`triggerPrice`, `qty`).
- **Recommendation:**
    1. Refactor `TpSlEditModal` to use `TradeService`.
    2. Secure `api/tpsl` with Zod validation and key redaction.

## 🟡 WARNINGS (High Priority)

### 1. Type Safety in `MarketWatcher`
- **Location:** `src/services/marketWatcher.ts`
- **Issue:** `ensureHistory` and `fetchBitunixKlines` use `any[]` return types.
- **Risk:** Downstream components (`MarketOverview`, `ChartWindow`) rely on implicit data structures. If `apiService` changes, these breaks will be runtime errors, not build-time errors.

### 2. Missing i18n & Hardcoded Strings
- **Location:** `src/components/shared/TpSlEditModal.svelte`
- **Issue:** Strings like "Trigger Price", "Amount (Qty)", "Save" are hardcoded.
- **Risk:** Poor UX for non-English users.

## 🔵 REFACTORING OPPORTUNITIES

### 1. Centralize TP/SL Logic
- Move `fetchTpSl` and `cancelTpSl` from `TradeService` (where they exist but are unused by the modal) to be the *sole* source of truth.

### 2. Standardize Error Handling
- `apiService` throws `apiErrors.generic` often. It should propagate more specific codes where possible.
