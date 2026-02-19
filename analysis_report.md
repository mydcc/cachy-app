# Analysis Report: Cachy App Maintenance & Hardening

**Date:** 2026-05-21
**Auditor:** Jules (Senior Lead Developer)
**Scope:** Full codebase review (Data Integrity, Performance, UI/UX, Security)

## Executive Summary
The codebase demonstrates a high level of sophistication in `bitunixWs.ts` and `tradeService.ts`, utilizing `Decimal.js` and strict Zod validation effectively. However, significant inconsistencies exist in legacy modules (`bitgetWs.ts`, `apiUtils.ts`) and specific hot paths (`marketWatcher.ts`). Critical risks involving potential precision loss in numeric parsing and main-thread blocking loops have been identified.

---

## 🔴 CRITICAL: Financial Risk, Crash Risk, Security

### 1. Precision Loss in Data Parsing (Financial Risk)
*   **`src/lib/server/apiUtils.ts`**: `fetchBitgetKlines` uses `parseInt` for timestamps but does not strictly validate or cast price/volume fields to strings before returning them. `JSON.parse` (implicit in `response.json()` or `safeJsonParse`) casts numbers like `0.00000001` to native numbers, risking precision loss before `Decimal.js` can intervene.
*   **`src/services/bitgetWs.ts`**: Lacks the "Fast Path" regex pre-processing found in `bitunixWs.ts`. WebSocket messages are parsed as standard JSON, meaning high-precision floating point numbers are converted to JavaScript numbers immediately.
*   **`src/routes/api/positions/+server.ts`**: Explicit usage of `parseFloat(p.size || "0")` was found. This converts safe strings back to unsafe floats for filtering.

### 2. Main-Thread Blocking Loops (Performance/Stability)
*   **`src/services/marketWatcher.ts`**: The `fillGaps` method contains a synchronous loop that can run up to 5000 iterations (`MAX_GAP_FILL`). If multiple symbols trigger this simultaneously during a network recovery, it will freeze the UI thread, causing "jank" or unresponsive controls during critical trading moments.

### 3. Content Security Policy (Security)
*   **`svelte.config.js`**: The CSP includes `unsafe-inline` and `unsafe-eval` for `script-src` and `style-src`. This significantly broadens the attack surface for XSS (Cross-Site Scripting).

### 4. Input Validation Gaps (Stability/Security)
*   **`src/routes/api/klines/+server.ts`**: The `limit` parameter is parsed via `parseInt` but not capped server-side. A malicious or buggy client requesting `limit=1000000` could exhaust server memory or downstream API rate limits.

---

## 🟡 WARNING: UX, Performance, i18n

### 1. Inconsistent i18n (UI/UX)
*   **Hardcoded Strings**: Multiple error messages and UI states rely on hardcoded English strings instead of translation keys.
    *   `src/routes/+layout.svelte`: "An unexpected error occurred."
    *   `src/lib/server/apiUtils.ts`: "Symbol is required", "Failed to fetch klines".
    *   `src/services/tradeService.ts`: "Flash Close Failed".

### 2. Hot Path Inefficiency (Performance)
*   **`src/services/bitunixWs.ts`**: The `syntheticSubs` logic inside `handleMessage` iterates over a map for *every* kline message received. While currently manageable, this O(N) operation inside the highest-frequency loop is a scalability bottleneck.

### 3. Error Handling "Broken States" (UX)
*   **API Errors**: `src/lib/server/apiUtils.ts` catches errors and returns generic 500 JSONs. The frontend components (e.g., `MarketDashboardModal`) need to be verified to ensure they display these errors gracefully rather than showing a blank spinner or crashing.

---

## 🔵 REFACTOR: Technical Debt

### 1. Code Duplication
*   **Kline Fetching**: Similar logic exists in `fetchBitunixKlines` (apiUtils) and `MarketWatcher`. This should be centralized to ensure consistent `Decimal` handling and gap filling.

### 2. Legacy Type Casting
*   **`src/utils/technicalsCalculator.ts`**: Uses `parseFloat(k.high.toString())`. If the input is already a `Decimal`, converting to string and then float is redundant and lossy. If technicals require numbers (for performance), this boundary should be explicit and documented.

---

## Recommended Action Plan (Next Steps)

1.  **Harden Data Parsing**: Port the "Fast Path" regex logic from `bitunixWs.ts` to `bitgetWs.ts` and `apiUtils.ts` to ensure zero precision loss.
2.  **Optimize MarketWatcher**: Refactor `fillGaps` to be non-blocking (chunked execution or Web Worker) or strictly capped.
3.  **Strict Validation**: Add Zod schemas for all API endpoints (`limit` caps, strict type checks).
4.  **i18n Sweep**: Replace identified hardcoded strings with `$_('key')` calls and add keys to `en.json`/`de.json`.
5.  **CSP Tightening**: Investigate removing `unsafe-eval` if possible, or strictly scoping it.
