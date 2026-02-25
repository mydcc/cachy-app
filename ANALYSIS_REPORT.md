# Status Report: Cachy App Codebase Audit

**Date:** 2025-05-18
**Author:** Jules (Senior Lead Developer & Systems Architect)
**Scope:** Full Repository Audit (Step 1)

## Executive Summary
The codebase demonstrates a modern, high-performance architecture using **Svelte 5 Runes** and **Decimal.js** for financial calculations. However, critical vulnerabilities in number parsing and localization pose significant financial risks. Immediate remediation is required before further feature development.

---

## 🔴 CRITICAL FINDINGS (Immediate Action Required)

### 1. High-Risk Ambiguity in `parseDecimal` (Financial Loss Risk)
**Location:** `src/utils/utils.ts`
**Severity:** CRITICAL
**Description:** The helper function `parseDecimal` attempts to "guess" the locale (DE vs EN) based on the number of decimal places.
- Logic: `else if (suffix.length === 3) { str = str.replace(/,/g, ""); }`
- **Scenario:** A German user enters "1,000" intending "1.0".
- **Result:** The system interprets this as "1000" (English thousands separator).
- **Impact:** Order size error of 1000x magnitude.
**Recommendation:** Remove heuristic guessing. Enforce explicit locale settings or strictly reject ambiguous formats.

### 2. Potential Precision Loss in WebSocket Parsing
**Location:** `src/services/bitunixWs.ts`
**Severity:** CRITICAL
**Description:** `Number(item.t ?? ...)` is used for timestamps. While safe for current Unix timestamps, `Number()` is also used elsewhere without strict checks.
- **Risk:** If an Order ID or Price is accidentally parsed with `Number()` instead of `Decimal`, precision is lost for large values (above `MAX_SAFE_INTEGER`).
- **Audit:** Confirmed usages of `Number(payload.id)` or similar in other services must be strictly refactored to `String` or `Decimal`.

### 3. Zod Validation Gaps in API
**Location:** `src/routes/api/orders/+server.ts`
**Severity:** CRITICAL
**Description:** The API validates `OrderRequestSchema`, but the internal `BitunixOrderPayload` interface allows `qty` and `price` to be `string | number`.
- **Risk:** If a malicious payload passes Zod as a number (e.g., `1e-7`), it might bypass `formatApiNum` safeguards if not strictly cast to string *before* processing.

---

## 🟡 WARNINGS (High Priority)

### 1. Missing Internationalization (i18n)
**Location:** Various Components
**Severity:** WARNING
**Description:** Hardcoded strings detected in UI components, bypassing the translation system.
- `src/components/settings/EngineDebugPanel.svelte`: "TS", "WASM", "Server Security"
- `src/components/shared/PerformanceMonitor.svelte`: "active"
- `src/components/shared/TakeProfitRow.svelte`: "TP {index + 1}"
**Impact:** Broken UX for non-English users.

### 2. `{@html}` Injection Risks
**Location:** `src/components/shared/ChartPatternsView.svelte`, `src/routes/+page.svelte`
**Severity:** WARNING
**Description:** Extensive use of `{@html}`.
- While `DOMPurify` is used in `ContentRenderer.svelte`, other usages like `{@html renderTrustedMarkdown(...)}` rely on the assumption that the input is safe.
- **Action:** Audit `renderTrustedMarkdown` to ensure it strictly sanitizes HTML.

### 3. Unbounded Gap Filling in MarketWatcher
**Location:** `src/services/marketWatcher.ts` -> `fillGaps`
**Severity:** WARNING
**Description:** `MAX_GAP_FILL = 5000`.
- **Scenario:** If a user disconnects for a week and reconnects, the system might try to synthesize 5000 candles per symbol.
- **Impact:** Memory spike and UI freeze.
**Recommendation:** Implement a "Too Many Gaps -> Force Refetch" strategy instead of synthesizing thousands of candles.

---

## 🔵 REFACTOR (Technical Debt)

### 1. Complex Timeframe Normalization
**Location:** `src/utils/utils.ts` -> `normalizeTimeframeInput`
**Severity:** REFACTOR
**Description:** The function uses complex Regex to handle "1T" -> "1d".
- **Issue:** Hard to maintain and test.
**Recommendation:** Move to a strict lookup map or a dedicated `Timeframe` class.

### 2. `MarketManager` Buffer Limits
**Location:** `src/stores/market.svelte.ts`
**Severity:** REFACTOR
**Description:** `KLINE_BUFFER_HARD_LIMIT` is 2000.
- **Issue:** This is a magic number. It should be configurable or derived from the viewport size to optimize memory.

---

## Next Steps (Step 2 Preview)

1.  **Fix `parseDecimal`**: Implement strict locale-based parsing.
2.  **Harden WebSocket**: Replace all `Number()` casts on IDs/Prices with `Decimal` or `String`.
3.  **Audit i18n**: Extract hardcoded strings to `en.json`.
4.  **Sanitize HTML**: Review all `{@html}` instances.
