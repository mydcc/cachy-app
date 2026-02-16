# Code Audit Report: Cachy App

**Status:** Completed
**Role:** Senior Lead Developer & Systems Architect
**Date:** 2026-05-21

This report outlines the findings from the comprehensive code audit focusing on stability, security, and performance.

---

## 1. Data Integrity & Mapping

### 🔴 CRITICAL
*   **Type Mismatch in API Aggregation (`src/services/apiService.ts`):**
    In `fetchBitunixKlines`, the synthetic aggregation logic (lines ~480) assigns `high: high.toString()` while other fields like `low` are kept as `Decimal`. This violates the `Kline` interface consistency and will likely cause runtime errors in downstream consumers (charts, indicators) that expect uniform types.
    *   *Risk:* Chart crashes or incorrect calculation results.

### 🟡 WARNING
*   **Gap Filling Discontinuities (`src/services/marketWatcher.ts`):**
    The `fillGaps` method imposes a hard limit of 5000 candles (`MAX_GAP_FILL`). If a data gap exceeds this (e.g., prolonged downtime), the time series will have a discontinuity (time jump) despite "filling".
    *   *Risk:* Technical indicators sensitive to time continuity might produce artifacts.

### 🔵 REFACTOR
*   **Weak Type Casting (`src/services/tradeService.ts`):**
    `fetchTpSlOrders` casts API responses `as TpSlOrder[]` after generic parsing. While functional, explicitly parsing with Zod (like in `account/+server.ts`) would be safer.

---

## 2. Resource Management & Performance

### 🔴 CRITICAL
*   **Polling Race Condition (`src/stores/chat.svelte.ts`):**
    The `ChatManager` uses `setInterval` to trigger an async `poll()` function without checking if the previous request has completed. On slow networks, this leads to overlapping requests, congestion, and potential out-of-order updates.
    *   *Risk:* Network congestion, UI jank, memory bloom.

### 🟡 WARNING
*   **Potential Stack Overflow (`src/stores/market.svelte.ts`):**
    The `applySymbolKlines` method uses `history.push(...newKlines)` to merge data. If `newKlines` contains a massive backfill (>30,000 items), this will throw a "Maximum call stack size exceeded" error.
    *   *Risk:* Crash during heavy history loads.
*   **Inefficient Array Operation (`src/services/bitunixWs.ts`):**
    The synthetic subscription handler uses `unshift` inside a loop (`bucketCandles.unshift`). For large buckets, this is O(N^2) complexity.
    *   *Risk:* High CPU usage during synthetic candle updates.

---

## 3. UI/UX & Accessibility (A11y)

### 🟡 WARNING
*   **Accessibility Regression (`src/routes/+layout.svelte`):**
    The Jules Report Overlay uses `<!-- svelte-ignore -->` directives to bypass a11y warnings instead of implementing proper `onkeydown` handlers and ARIA roles. This contradicts the project's accessibility standards.
    *   *Risk:* Poor experience for screen reader/keyboard users.
*   **Hardcoded Strings (`src/routes/+layout.svelte`):**
    Fallback error messages ("An unexpected error occurred.") are hardcoded and not localized via `i18n`.
    *   *Risk:* Inconsistent language for non-English users.

---

## 4. Security & Validation

### 🟡 WARNING
*   **Production Logging (`src/routes/api/klines/+server.ts`):**
    Usage of `console.log` detected in production code path.
    *   *Risk:* Log pollution, potentially leaking non-sensitive but unnecessary operational data.

### 🔵 REFACTOR
*   **Timing Attack Mitigation (`src/routes/api/stream-logs/+server.ts`):**
    The token verification uses `crypto.timingSafeEqual` correctly for content, but the preceding length check (`secretBuffer.length !== tokenBuffer.length`) theoretically leaks the secret's length.
    *   *Recommendation:* Use HMAC comparison for constant-time verification including length.

---

## 5. Summary of Best Practices Found
*   **Strong Validation:** `AccountRequestSchema` and `TpSlRequestSchema` (Zod) are strictly enforced in API endpoints.
*   **Safe Parsing:** `safeJsonParse` is used consistently to prevent JSON bombing.
*   **Memory Management:** `MarketManager` correctly implements an LRU cache and uses a `BufferPool` to manage memory pressure.
*   **Performance:** `MarketWatcher` implements a "Fast Path" for high-frequency updates.
