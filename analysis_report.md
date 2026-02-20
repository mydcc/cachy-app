# Cachy-App Status & Risk Report
**Date:** 2026-05-24
**Auditor:** Jules (Senior Lead Developer)
**Scope:** Full Codebase Audit (Phase 1)

## Executive Summary
The codebase generally exhibits a strong architectural foundation with advanced features like "SoA" (Struct of Arrays) buffering in `market.svelte.ts` and dedicated WebSocket services. However, critical vulnerabilities exist regarding **floating-point precision safety** in the Bitget integration and **accessibility/standards compliance** in the UI.

## 🔴 CRITICAL RISK
**Risk of financial loss or data corruption.**

1.  **Bitget WebSocket Precision Vulnerability (`src/services/bitgetWs.ts`)**
    *   **Finding:** The Bitget WebSocket service relies on `safeJsonParse` (from `src/utils/safeJson.ts`), which protects large integers (>15 digits) but **ignores** high-precision floating point numbers (e.g., `0.000000001`). It lacks the regex-based JSON pre-processing found in `bitunixWs.ts`.
    *   **Impact:** If Bitget transmits a price or quantity as a JSON `number` (not a string), it will be parsed as a native JavaScript 64-bit float. This causes immediate, silent precision loss before `Decimal.js` can handle it.
    *   **Recommendation:** Port the "Fast Path" regex pre-processor from `bitunixWs.ts` to `bitgetWs.ts` to forcibly wrap all numeric fields in quotes before JSON parsing.

2.  **Unsafe Type Casting in Market Data**
    *   **Finding:** `bitgetWs.ts` instantiates `Decimal` directly from parsed message data without guaranteeing the source is a string.
    *   **Impact:** Reinforces the precision risk above. `new Decimal(number)` inherits the inaccuracy of the JavaScript number.
    *   **Recommendation:** Enforce `String()` casting or strict type checks before `Decimal` instantiation in all WebSocket handlers.

## 🟡 WARNING
**Performance issues, UX defects, or missing standards.**

1.  **Accessibility (A11y) Regressions (`src/routes/+layout.svelte`)**
    *   **Finding:** The "Jules Report Overlay" uses `svelte-ignore a11y_click_events_have_key_events` and `a11y_no_static_element_interactions` on `div` elements acting as buttons/modals.
    *   **Impact:** Violates accessibility standards and "Institutional Grade" requirements.
    *   **Recommendation:** Replace `div` with `button` or implement full keyboard handlers (`onkeydown`, `tabindex`).

2.  **Incomplete i18n & Error Leaks (`src/routes/api/orders/+server.ts`)**
    *   **Finding:** While error codes are standardized (e.g., `bitunixErrors.INVALID_JSON`), the API often returns raw `e.message` or `details` in the response.
    *   **Impact:** Users may see English technical errors instead of localized messages.
    *   **Recommendation:** Ensure all error paths return a translation key or a sanitized, localized message.

3.  **Potential Memory Churn in Market Store (`src/stores/market.svelte.ts`)**
    *   **Finding:** The `applyUpdate` method creates new `Decimal` instances frequently. While optimization logic exists (`currentVal.toString() === valStr`), it depends on the input format matching exactly.
    *   **Recommendation:** Profile and refine the equality check to minimize allocation.

4.  **Hardcoded Strings**
    *   **Finding:** Hardcoded strings detected in `TradeService` (e.g., "Flash Close Failed") and logs.
    *   **Recommendation:** Move all user-facing strings to `src/locales`.

## 🔵 REFACTOR
**Technical debt and maintainability.**

1.  **WebSocket Logic Duplication**
    *   **Finding:** `bitunixWs.ts` and `bitgetWs.ts` share ~80% of their logic (heartbeat, reconnection, subscription management).
    *   **Recommendation:** Extract a `BaseWebSocketService` abstract class.

2.  **Magic Strings**
    *   **Finding:** Provider names ("bitunix", "bitget") are used as string literals throughout the codebase.
    *   **Recommendation:** Use a shared `Provider` enum or constant object.
