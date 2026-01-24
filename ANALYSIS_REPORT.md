# Code Analysis & Risk Report (Status Quo)

**Date**: 2026-05-21
**Role**: Senior Lead Developer
**Scope**: `cachy-app` High-Frequency Trading Platform

## Executive Summary
The codebase exhibits a generally solid architecture with clear separation of concerns (Services, Stores, UI). However, **CRITICAL** risks exists regarding financial data precision (Floating Point issues) and **WARNING** level issues regarding Resource Management and Internationalization (i18n).

## 1. Data Integrity & Precision (🔴 CRITICAL)
*   **Floating Point Usage in API**: The file `src/routes/api/orders/+server.ts` aggressively converts API response data (prices, amounts) using `parseFloat()`. This permanently strips precision from the exchange data before it reaches the frontend.
    *   *Risk*: Financial discrepancies (e.g., seeing 1.000000001 as 1.0) which can lead to incorrect PnL calculations or order sizing.
*   **Type Mismatches**: `tradeState` (Store) uses `number | null` for prices, while `tradeService` expects `Decimal`. The conversion often happens late, relying on native JS numbers which are IEEE 754 floats.
*   **Serialization**: `TradeExecutionService` converts `Decimal` objects back to `toNumber()` before sending to the Bitunix API. While Bitunix accepts numbers, this introduces a round-trip precision risk.

## 2. Resource Management & Performance (🟡 WARNING)
*   **WebSocket Fast Path**: `bitunixWs.ts` implements a "Fast Path" that bypasses Zod validation for performance. While effective, it lacks robust error handling. If the API schema changes slightly, this path could crash the socket worker or causing UI freezes.
*   **Polling Intervals**: `MarketWatcher` uses `setInterval` for fallback polling. While it has logic to pause, we must ensure these are strictly cleared on component unmounts to prevent "zombie" polling in the background.

## 3. UI/UX & Internationalization (🟡 WARNING)
*   **Hardcoded Backend Errors**: `src/routes/api/orders/+server.ts` returns hardcoded English strings (e.g., "Invalid quantity formatting"). These cannot be translated by the frontend `$_` mechanism, leading to a mixed-language experience for non-English users.
*   **Error Feedback**: The API returns generic `500` errors for some logic failures, which are not "Actionable" for the user.

## 4. Security & Validation (🔵 REFACTOR)
*   **Redaction**: The system correctly attempts to redact API keys from logs.
*   **Zod Usage**: Validation is present but inconsistent. The WebSocket "Fast Path" bypasses it completely.

---

## Action Plan Strategy
1.  **Harden Data Types**: Introduce `raw` string fields in Order interfaces to preserve precision from Backend to Frontend.
2.  **Sanitize API Inputs**: Enforce `Decimal` -> `String` conversion for API payloads to avoid scientific notation issues (e.g., `1e-7`).
3.  **Externalize Errors**: Move backend error strings to a constant map to allow for potential future localization or code-based mapping on the frontend.
4.  **Bulletproof Hot Paths**: Wrap `bitunixWs` fast-path in try-catch blocks to prevent crashes.
