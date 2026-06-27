# Cachy-App: Security & Stability Code Analysis Report

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1. **Unsafe JSON Parsing in API/Services**:
   - Multiple instances of raw `JSON.parse` were found (e.g., `src/services/apiService.ts:419`, `src/services/backupService.ts`, `src/services/tradeService_flashClose.test.ts`), risking floating point precision loss and 53-bit integer overflow, which can lead to broken big IDs in financial transactions.
   - Note: The mappers service (`src/services/mappers.ts`) checks numeric IDs *after* parsing, by which time data precision might already be compromised. Must replace with `safeJsonParse`.

2. **Dangerous Float Arithmetic and `toNumber()` Conversions**:
   - The use of `.toNumber()` on `Decimal` objects (e.g., `src/components/shared/MarketOverview.svelte`, `src/components/shared/PositionsList.svelte`) causes calculations to revert back to native JavaScript floats, threatening precision loss in financial UI operations and position size calculations.

3. **Unsanitized Direct DOM Manipulations (`{@html}`)**:
   - `{@html}` tags are used in multiple UI components (e.g., `src/components/results/SummaryResults.svelte`, `src/components/shared/MarketOverview.svelte`, `src/components/shared/NewsSentimentPanel.svelte`, `src/components/settings/SettingsContent.svelte`) without wrapping the input in `DOMPurify.sanitize()`. This introduces potential Cross-Site Scripting (XSS) vulnerabilities if dynamic properties or SVG strings contain malicious payloads.

## 🟡 WARNING (Performance issue, UX error, missing i18n)

1. **Performance/Memory Leaks**:
   - The `MarketWatcher` class tracks subscriptions (`requests` Map), but lacks an explicit validation of map size bounds. Additionally, we need to inspect `tradeService` to ensure `WebSocket` or `polling` unmounting does not leak memory in background services.

2. **UX / Accessibility (A11y)**:
   - Error messages during `JSON.parse` failure (e.g., in `apiService.ts:420`) throw `"apiErrors.invalidJson"` directly, which is localized, but logging lacks complete context.
   - Broken states: Components might show incomplete state rather than a fallback UI if external APIs return incomplete or malformed JSON payloads, since error catching in some services merely returns an empty object or throws immediately.

## 🔵 REFACTOR (Code smell, technical debt)

1. **Refactor `JSON.parse` to `safeJsonParse`**:
   - Search the codebase for remaining native `JSON.parse` invocations that are not in tests, and migrate them entirely to use `safeJsonParse`.

2. **Standardize sanitizeHtml/DOMPurify usage**:
   - All `{@html ...}` interpolations must strictly be wrapped inside `DOMPurify.sanitize(...)` to harden security in-depth against UI rendering vulnerabilities.

## Step 2: Action Plan

### 1. Fix Unsafe JSON Parsing (CRITICAL)
**Goal:** Prevent floating-point precision loss and 53-bit integer overflow which corrupts big IDs.
**Justification:** Measurably improves stability by ensuring order IDs and precision-critical financial data are correctly parsed and not modified by JavaScript engine float parsing limits.
**Action:** Replace `JSON.parse` with `safeJsonParse` in `src/services/backupService.ts`, `src/services/apiService.ts`, and `src/components/shared/GlobalTracker.svelte`.
**Test Cases (Unit Tests):**
- Add tests in `src/services/backupService.test.ts` where the backup contains order IDs larger than `Number.MAX_SAFE_INTEGER` and extremely precise decimals (e.g., `1234567890123456789`), asserting that they remain exactly identical post-parsing.

### 2. Remediate `.toNumber()` on Decimals (CRITICAL)
**Goal:** Retain full mathematical precision during position calculations and UI renders.
**Justification:** Measurably improves stability (and prevents financial loss representations) by ensuring calculations avoid JS native float inaccuracies.
**Action:** In `src/components/shared/MarketOverview.svelte`, `src/components/shared/PositionsList.svelte`, and `src/components/shared/TakeProfitRow.svelte`, remove `.toNumber()` on `Decimal` objects and ensure components/stores use and accept `Decimal` values natively.
**Test Cases (Unit Tests):**
- Add test assertions in UI component logic (e.g., in a dedicated `precision.test.ts` or component test) feeding edge-case decimal sizes that would lose precision in JS floats, confirming that `PositionsList` displays exactly the right amount.

### 3. Sanitize `{@html}` Directives (CRITICAL)
**Goal:** Prevent Cross-Site Scripting (XSS).
**Justification:** Measurably improves stability and security by removing XSS vectors.
**Action:** Wrap all instances of `{@html ...}` in `src/components/results/SummaryResults.svelte`, `src/components/settings/SettingsContent.svelte`, `src/components/shared/DashboardNav.svelte`, `src/components/shared/MarketOverview.svelte`, `src/components/shared/NewsSentimentPanel.svelte`, and `src/components/shared/ToastItem.svelte` with `DOMPurify.sanitize(...)`.
**Test Cases (Unit Tests):**
- Add a test injecting `<script>alert(1)</script>` into properties mapped to icons or content rendered via `{@html}`, asserting that `DOMPurify` strips the payload before rendering.

### 4. Hardening WebSocket & Memory Management (WARNING)
**Goal:** Prevent unclosed WebSocket subscriptions and unbounded arrays in stores.
**Justification:** Measurably improves performance and prevents memory leaks that eventually cause browser crashes.
**Action:** Check `MarketWatcher.ts` for cleanup of `requests` and `pendingRequests`. Introduce bounded eviction strategies for arrays/maps where they grow indefinitely, and unconditionally call `.clear()` in teardown/destroy methods.

### 5. UI/UX Error State Hardening (WARNING)
**Goal:** Avoid showing broken pages on network timeouts or 500s.
**Justification:** Measurably improves stability by ensuring users can comprehend UI states when APIs are unresponsive, reducing frantic retry requests.
**Action:** Introduce explicit generic error message mappings in `apiService.ts` for parsing errors (e.g., `apiErrors.invalidResponseFormat`), and assure that UI components render offline/error fallbacks when the state lacks data due to exceptions.
