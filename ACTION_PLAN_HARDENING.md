# Hardening Action Plan (Phase 2)

## Phase 1: Security & Data Integrity (Highest Priority)

### 1. Refactor `TradeService.flashClosePosition` ("Safe Close")
- **Objective:** Prevent "Naked Stop Loss" scenarios.
- **Action:**
    - Introduce a `SafeClose` method that *first* checks for open orders.
    - If cancellation fails, *abort* the close (unless force flag is set).
    - Add explicit `try-catch` around the cancellation call that *propagates* the error to the UI, asking for confirmation ("Failed to cancel orders. Force close anyway?").

### 2. Centralize TP/SL Logic & Secure `api/tpsl`
- **Objective:** Eliminate manual request construction and secure backend logging.
- **Action:**
    - Update `src/services/tradeService.ts` to include `modifyTpSlOrder` (if missing) and ensure `fetchTpSlOrders` / `cancelTpSlOrder` are robust.
    - Refactor `src/components/shared/TpSlEditModal.svelte` to use `tradeService.modifyTpSlOrder` instead of `fetch`.
    - Update `src/routes/api/tpsl/+server.ts` to use Zod validation for `params` and explicitly redact keys in error logs (copy logic from `api/orders`).

### 3. Harden `BitunixWs` Validation
- **Objective:** Ensure "Fast Path" optimization doesn't crash on bad data.
- **Action:**
    - Wrap the "Fast Path" block in `src/services/bitunixWs.ts` with a strict `try-catch`.
    - If fast path fails, fall back to the standard Zod validation path.
    - Add telemetry/logging for Fast Path failures to detect schema drift.

## Phase 2: Type Safety & Resource Management

### 1. Strict Typing in `MarketWatcher`
- **Objective:** Remove `any` usage.
- **Action:**
    - Define strict `Kline` interface (aligned with `src/services/technicalsTypes.ts`).
    - Update `src/services/marketWatcher.ts` `ensureHistory` to return `Promise<Kline[]>` instead of `Promise<any[]>`.
    - Update `apiService.fetchBitunixKlines` to return typed data.

## Phase 3: UI/UX & i18n

### 1. Localization for `TpSlEditModal`
- **Objective:** Remove hardcoded strings.
- **Action:**
    - Add keys to `src/locales/en.json` (e.g., `trade.triggerPrice`, `trade.amount`, `actions.save`, `actions.cancel`).
    - Update component to use `$_`.

### 2. Actionable Error Messages
- **Objective:** Improve `apiService` error reporting.
- **Action:**
    - Map common Bitunix error codes (e.g., "Invalid Price", "Insufficient Balance") to user-friendly i18n keys in `apiService.ts`.
