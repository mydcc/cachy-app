# Codebase Analysis & Hardening Report

## Status Summary
The codebase generally demonstrates high maturity (Svelte 5 Runes, Zod, Decimal.js). However, a few specific risks regarding memory management in Stores and missing features in Trade Services were identified.

*Note: A previous analysis suggested a memory leak in OMS. Verification confirms `omsService.ts` **does** implement pruning (`MAX_ORDERS = 500`), but it is limited to finalized orders. This is a partial mitigation, not a complete fix for extreme scenarios.*

## 1. Findings

### 🔴 CRITICAL (Immediate Action Required)
*None found.*
*   **Security:** API keys redacted, Zod validation active.
*   **Math:** `Decimal.js` usage is pervasive and correct.

### 🟡 WARNING (Stability & UX Risks)

1.  **Unbounded State Arrays (`src/stores/trade.svelte.ts`)**
    *   **Finding:** The `tags` and `targets` arrays in `TradeManager` have no enforced size limits.
    *   **Risk:** Malicious or accidental input (e.g., importing a large JSON) could bloat the state and LocalStorage, leading to performance degradation.
    *   **Recommendation:** Implement `.slice()` limits in the `load()` and `update()` methods.

2.  **Missing `closeAllPositions` Logic (`src/services/tradeService.ts`)**
    *   **Finding:** The `TradeService` class lacks a `closeAllPositions` method.
    *   **Risk:** If the UI (e.g., a "Panic Button") attempts to call this expected feature, it will fail.
    *   **Recommendation:** Implement the method by iterating over `omsService.getPositions()` and calling `closePosition` for each.

3.  **Weak Typing in `TradeService` (`src/services/tradeService.ts`)**
    *   **Finding:** `signedRequest` accepts and returns `any`, bypassing TypeScript safety.
    *   **Risk:** API schema changes might cause silent runtime failures.
    *   **Recommendation:** Use Generics `<T>` for the return type.

4.  **Hardcoded UI Strings (`src/components/shared/OrderHistoryList.svelte`)**
    *   **Finding:** Strings like "Limit", "Market", "Fee:", "Buy", "Sell" are hardcoded.
    *   **Risk:** Incomplete localization.
    *   **Recommendation:** Extract to `en.json`.

5.  **Reference Counting Risk (`src/services/marketWatcher.ts`)**
    *   **Finding:** WebSocket subscriptions rely on manual reference counting.
    *   **Risk:** If a component throws an error during unmount and skips `unregister`, the subscription leaks.
    *   **Recommendation:** Add a global `cleanup()` safety valve.

### 🔵 REFACTOR (Technical Debt)
1.  **OMS Pruning Edge Case**: `omsService` only prunes finalized orders. If >500 *active* orders exist, they are kept. Consider a hard cap for active orders too (rejecting new ones).

## 2. Recommendations for Phase 2 (Hardening)

1.  **Store Hardening**: Add bounds to `trade.svelte.ts`.
2.  **Feature Completion**: Implement `closeAllPositions`.
3.  **Type Safety**: Refactor `signedRequest`.
4.  **I18n**: Extract strings.
