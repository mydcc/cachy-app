# Cachy-App Status & Risk Report

## Phase 1: Findings Categorized by Severity

### 🔴 CRITICAL
- **Floating Point Inaccuracies (Decimal.js violations):**
  - `src/services/activeTechnicalsManager.svelte.ts`: Casts Decimals to native numbers (`.toNumber()`) during real-time price updates on lines 658, 670, which risks precision loss in price calculations.
  - `src/services/csvService.ts`: Uses `parseFloat` on line 353 instead of strict Decimals, which could corrupt large numerical values.
- **Memory Leak / Zombie Connections:**
  - `src/services/bitunixWs.ts`: Sets intervals for heartbeats but might not always clear them properly on unexpected disconnects, potentially causing zombie polling instances.
  - `src/services/marketAnalyst.ts`: Sets timeouts that aren't strictly cleared when the service is destroyed.
- **XSS Risk / Unsafe DOM Manipulation:**
  - Widespread use of `{@html}` in Svelte components without explicit `DOMPurify.sanitize` wrapping in all instances (e.g., `MarketOverview.svelte`, `SummaryResults.svelte`, `DepthBar.svelte`, `NewsSentimentPanel.svelte`).

### 🟡 WARNING
- **Missing i18n:**
  - `src/services/tradeService.ts`: Hardcoded fallback strings (e.g., `"Flash Close Failed"`) in `toastService.error` instead of localized `$_` keys.
- **Performance / Hot Paths:**
  - `src/components/shared/DepthBar.svelte`: Executes repetitive `.toNumber()` calculations directly in derived state for volume percentages.
- **Memory Leak / Unbounded Arrays:**
  - `src/services/apiService.ts`: Map eviction strategy uses a pruning interval, but relying purely on interval-based cleanup without a strict max-size eviction during insertion could allow unbounded memory growth under heavy load.

### 🔵 REFACTOR
- **Global setInterval Usage:** Relying on global `setInterval` for watchdogs (e.g., `omsService.ts`) instead of a robust task scheduler. Justification: Migrating this measurably improves background task predictability and stability, preventing overlapping watchdog executions. Purely cosmetic changes are omitted.

---

## Phase 2: Action Plan

### 1. Hardening Precision & Calculations (CRITICAL)
- **Action:** Refactor `activeTechnicalsManager.svelte.ts` and `csvService.ts` to strictly maintain `Decimal` objects throughout the pipeline. Remove `.toNumber()` and `parseFloat` where precision is critical.
- **Specific Test Case (activeTechnicalsManager):**
  - Write a unit test `activeTechnicalsManager_precision.test.ts`.
  - Input: Simulate a WebSocket update with `price = new Decimal("0.00000000000001")`.
  - Assertion: Assert that the internal store array (if using Decimals) or the passed value retains the exact precision without dropping to `0` due to native JS float limits.
- **Specific Test Case (csvService):**
  - Write a unit test `csvService_largeId.test.ts`.
  - Input: A CSV row containing a highly precise numeric string ID `99999999999999999.99`.
  - Assertion: Assert that the parsed value strictly matches the original string using Decimal representation rather than `parseFloat` rounding it.

### 2. Hardening WebSocket & Memory Management (CRITICAL)
- **Action:** Ensure all intervals/timeouts (`setInterval`/`setTimeout`) in `bitunixWs.ts`, `marketAnalyst.ts`, and `apiService.ts` store their references and explicitly invoke `clearInterval`/`clearTimeout` upon service teardown/disposal.
- **Specific Test Case (bitunixWs.ts):**
  - Write a unit test mocking `setInterval` and `clearInterval`.
  - Input: Initialize `BitunixWebSocketService`, start heartbeat, and call `destroy()`.
  - Assertion: Expect `clearInterval` to have been called with the exact timer IDs for `pingTimerPublic` and `pingTimerPrivate`.

### 3. XSS Remediation & Secure UI (CRITICAL)
- **Action:** Audit all `.svelte` components. Import `DOMPurify` and wrap all dynamic data rendered via `{@html}` with `DOMPurify.sanitize(content)`.
- **Justification:** Measurably improves security by preventing cross-site scripting vulnerabilities.

### 4. All i18n Fixes (WARNING)
- **Action:** Replace hardcoded strings in `tradeService.ts` (e.g., `"Flash Close Failed"`) with proper translation keys using Svelte's `$()` or `get(_)` store mechanisms.
