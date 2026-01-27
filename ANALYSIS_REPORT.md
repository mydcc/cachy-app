# Deep Code Analysis & Status Report (Updated)

**Role:** Senior Lead Developer & Systems Architect
**Date:** 2026-05-21
**Scope:** `cachy-app` codebase (Systematic Maintenance & Hardening)

## Executive Summary

Following a deep analysis of the current codebase, several critical and high-priority issues were identified. While the core architecture (Svelte 5 Runes, Decimal.js, Zod) is modern and generally robust, there are specific areas in Order Management (OMS) and Error Handling that pose stability and memory risks.

## Prioritized Findings

### 🔴 CRITICAL (Immediate Action Required)

1.  **Memory Leak in OMS (`src/services/omsService.ts`)**
    *   **Finding:** The `OrderManagementSystem` stores every order and position in a `Map` (`this.orders`, `this.positions`) without any eviction policy.
    *   **Risk:** Over long sessions (e.g., a pro trader running the app for days), this map will grow indefinitely, eventually causing a browser crash (OOM).
    *   **Recommendation:** Implement a `pruneOrders` method to keep only the last N (e.g., 500) finalized orders.

2.  **Unimplemented "Close All" Logic (`src/services/tradeService.ts`)**
    *   **Finding:** The `closeAllPositions` method explicitly throws `"NOT_YET_IMPLEMENTED"`.
    *   **Risk:** In a panic scenario, if the UI exposes a "Close All" button calling this method, it will fail, potentially causing massive financial loss.
    *   **Recommendation:** Implement iteration over `omsService.getPositions()` to trigger individual closes.

### 🟡 WARNING (Quality & Maintainability)

3.  **Hardcoded Error Strings (`src/services/tradeService.ts`)**
    *   **Finding:** Critical errors like `UNAUTHORIZED` or `VALIDATION_ERROR` are hardcoded in English.
    *   **Risk:** Non-English users receive untranslated error messages, reducing usability and trust.
    *   **Recommendation:** Switch to error codes (e.g., `TRADE_ERRORS.UNAUTHORIZED`) and handle translation in the UI layer.

4.  **Fragile API Payload Handling (`src/routes/api/orders/+server.ts`)**
    *   **Finding:** The server manually deletes undefined keys (`delete payload[key]`) before signing.
    *   **Risk:** If the signature generation logic drifts from the payload cleaning logic, authentication will fail. It's also "dirty" code.
    *   **Recommendation:** Use a strict cleaning utility or Zod transformation to ensure the payload matching the signature is exactly what is sent.

5.  **Heuristic Number Parsing (`src/utils/utils.ts`)**
    *   **Finding:** `parseDecimal` guesses between German (1.200) and English (1,200) formats.
    *   **Risk:** Ambiguous inputs (e.g., "1.200") could be misinterpreted (1.2 vs 1200) depending on invisible heuristics.
    *   **Recommendation:** Long-term, enforce strict localized input parsing based on user settings, rather than guessing.

### 🔵 REFACTOR (Technical Debt)

6.  **Unbounded State Arrays (`src/stores/trade.svelte.ts`)**
    *   **Finding:** `targets` and `tags` arrays have no hard limits.
    *   **Risk:** Minor memory risk if abused.
    *   **Recommendation:** Add limits (max 20 targets, max 50 tags).

## Implementation Plan (Step 2 Preview)

The following plan is proposed to address these findings:

1.  **Fix OMS Memory Leak**: Add pruning logic to `omsService`.
2.  **Implement Close All**: Activate `closeAllPositions` in `tradeService`.
3.  **Hardening API**: Refactor `+server.ts` payload handling.
4.  **i18n Improvements**: Refactor `tradeService` errors to use codes.
