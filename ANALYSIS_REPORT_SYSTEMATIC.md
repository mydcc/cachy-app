# Systemic Analysis Report: Institutional Grade Verification
**Date:** 2026-05-25
**Version:** 1.0 (Systematic)
**Scope:** Data Integrity, Resource Management, UI/UX, Security

## Executive Summary
The codebase demonstrates a high level of maturity ("Institutional Grade") in core trading logic and resource management. `TradeService` and `MarketManager` are robust against common financial engineering pitfalls (precision loss, memory leaks). However, specific regressions were identified in the API layer and UI internationalization that require immediate attention.

---

## 1. Data Integrity & Mapping

### Status: 🟡 WARNING

**✅ Strengths:**
*   **Decimal.js Usage:** `TradeService` and `MarketManager` correctly use `Decimal` for all financial calculations, preventing floating-point errors (e.g., `0.1 + 0.2`).
*   **Safe Serialization:** `TradeService.signedRequest` explicitly serializes payloads using `serializePayload` to ensure `Decimal` values are transmitted as strings.
*   **Response Parsing:** `apiService.safeJson` helper correctly employs `safeJsonParse` (regex-based protection) for handling large integers.

**🔴 CRITICAL FINDINGS:**
*   **Unsafe API Parsing in `fetchTicker24h`:** In `src/services/apiService.ts`, the method `fetchTicker24h` (specifically the Bitget/Bitunix logic block) calls `response.json()` directly.
    *   *Risk:* If the exchange returns a large integer ID or high-precision price in this specific endpoint, it will be corrupted by JavaScript's native JSON parser before validation.
    *   *Location:* `src/services/apiService.ts` (~line 388).

---

## 2. Resource Management & Performance

### Status: 🟢 HEALTHY

**✅ Strengths:**
*   **Buffer Hard Limits:** `MarketManager` enforces `KLINE_BUFFER_HARD_LIMIT` (2000 items) on WebSocket kline updates. This effectively prevents memory leaks during high-frequency storms.
*   **Zombie Request Pruning:** `MarketWatcher` implements a `pruneZombieRequests` mechanism with a 30s threshold, preventing stalled promises from locking up the polling queue indefinitely.
*   **Efficient Batching:** `MarketManager` uses a 4 FPS (250ms) flush cycle to batch UI updates, reducing render thrashing.

**🔵 REFACTOR OPPORTUNITIES:**
*   **Throttle Map Cleanup:** `BitunixWebSocketService` uses a crude `throttleMap.size > 1000` check to clear the map. A proper TTL-based cleanup (like in `RequestManager`) would be more consistent, though the current risk is low.

---

## 3. UI/UX & Accessibility (i18n)

### Status: 🟡 WARNING

**✅ Strengths:**
*   **Robust Locale Structure:** `src/locales/locales/en.json` is comprehensive and well-structured.
*   **Sanitized Rendering:** HTML injection via `{@html ...}` is generally safe due to widespread use of `DOMPurify`.

**🟡 WARNING FINDINGS:**
*   **Hardcoded Strings:** Confirmed presence of hardcoded English strings in `src/components/settings/tabs/`.
    *   *Example:* `<label>API Key</label>` in `ConnectionsTab.svelte` (and potentially others).
    *   *Impact:* Prevents full localization and creates a disjointed experience for non-English users.
*   **Inconsistent Usage:** While keys exist in `en.json` (e.g., `settings.connections.apiKey`), they are not being used in the components.

---

## 4. Security & Validation

### Status: 🟢 HEALTHY

**✅ Strengths:**
*   **Input Validation:** `TradeSetupInputs` employs strict local state validation (`parseInputVal`) and visual feedback for price deviation (>10%).
*   **Markdown Sanitization:** `src/utils/markdownUtils.ts` enforces `DOMPurify` even for "trusted" content on the client-side, mitigating XSS risks from dynamic content.
*   **Optimistic UI Handling:** `TradeService.flashClosePosition` correctly handles the "Two Generals Problem" by not removing optimistic orders blindly upon network failure.

---

## Prioritized Action Plan

### 1. Fix Critical Data Integrity Issue (Immediate)
*   **Task:** Refactor `apiService.fetchTicker24h` to use `apiService.safeJson(response)` instead of `response.json()`.
*   **Test:** Verify Ticker data loads correctly after change.

### 2. Complete i18n Migration (High Priority)
*   **Task:** systematic sweep of `src/components/settings/tabs/*.svelte`. Replace all hardcoded labels with `$_('settings.tabs...')` keys.
*   **Task:** Verify keys exist in `en.json` or add missing ones.

### 3. Maintain Hardening Checks
*   **Task:** Add a regression test or linter rule to forbid `response.json()` usage in `src/services/`.
