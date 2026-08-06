# cachy-app: Status & Risk Report

## Overview
This report provides an in-depth code analysis of the `cachy-app` codebase, focusing on Data Integrity & Mapping, Resource Management & Performance, UI/UX & Accessibility, and Security & Validation, to raise it to institutional-grade standards.

## Step 1: Analysis & Findings

### Data Integrity & Mapping

🔴 **CRITICAL**
* **Type Safety in TradeService**: `tradeService.ts` casts raw payloads via `as T` and utilizes `unknown` for deserialization (e.g., `let data: Record<string, unknown>`). This bypasses strict typing and could lead to runtime errors when handling unexpected API responses.
* **Inaccurate Error Parsing**: `tradeService.ts` uses `rawMessage` from `BitunixApiError`. This field could contain raw HTML proxy error pages (e.g., 502 Bad Gateway), which must never be exposed to the UI or logs.
* **Loss of Decimal Precision**: `marketWatcher.ts` contains loops re-assigning numbers (e.g., `.close` property defaulting to native numbers) and uses `parseFloat`/`Number()` within loops. Strict institutional standards require `Decimal.js` for all price and quantity calculations end-to-end to prevent floating-point inaccuracies.

🟡 **WARNING**
* **Inconsistent Null Checks**: `tradeService.ts` and `apiService.ts` have scattered undefined checks (e.g., `if (!d.open || !d.close)`). Missing explicit handling for malformed data from exchange WebSocket feeds could lead to silent data dropping.

### Resource Management & Performance

🔴 **CRITICAL**
* **Memory Leaks in WebSockets & Intervals**: `setInterval` and `setTimeout` loops without clear disposal in core services (e.g., `marketWatcher.ts` lacks clear disposal for background polling upon `destroy()`). If `clearInterval` isn't predictably invoked on service teardown/HMR, memory leaks are guaranteed.
* **Unbounded Map/Set Growth**: `marketWatcher.ts` tracks requests (`this.inFlight`), but eviction mechanisms in caching arrays/Maps must avoid the `Map.prototype.keys().next().value` anti-pattern as specified in memory constraints to prevent corrupting active application state.

🟡 **WARNING**
* **Hot Paths (Re-renders & Calculations)**: `activeTechnicalsManager.svelte.ts` and charting files rely heavily on array manipulation (e.g., `closes: createAndCopy(...)`) in tight loops. Recalculating technical indicators natively on the main thread for high-frequency WebSocket updates (executed >10x per sec) creates UI judder.

### UI/UX & Accessibility (A11y)

🟡 **WARNING**
* **Missing i18n Keys**: Extensive hardcoded strings found in `SettingsContent.svelte` (e.g., 'active', 'Vol MA', 'Choppiness'). Institutional grade requires localization support via the `$_('key')` syntax.
* **Unhelpful Error States**: `tradeService.ts` throws generic errors like `throw new Error("apiErrors.generic", { cause: e })`. Exposing generic or raw message states during a network outage is not an actionable error message for traders (broken states).

### Security & Validation

🔴 **CRITICAL**
* **Cross-Site Scripting (XSS) via `{@html}`**: Instances of `{@html}` found across components (`SummaryResults.svelte`, `SettingsContent.svelte`). Dynamic values using `{@html}` *must* be strictly sanitized using `DOMPurify.sanitize()` to prevent injection attacks.
* **Unsafe API Payload Submission**: Ensure user inputs (e.g., order quantities) are validated against schema constraints (Zod) before dispatch to the API.

---

## Step 2: Action Plan (Implementation)

### 1. Harden Data Integrity & Types (Data Processing)
**Fixes Grouped**: Refactor API Payload Typing, Implement Decimal.js strictly.
* **Action**: Refactor `tradeService.ts` and `apiService.ts` to strictly validate `unknown` responses using Zod or type guards instead of `as T`. Enforce `Decimal.js` usage across the board.
* **Specific Test Cases**:
  - `test('TradeService handles malformed API payloads without crashing', () => { /* mock payload missing fields and assert safe rejection */ })`
  - `test('MarketWatcher preserves Decimal.js precision during high-frequency updates', () => { /* feed highly precise numbers and assert output matches exactly as Decimal */ })`

### 2. Hardening WebSockets & Resource Management (Memory Leaks)
**Fixes Grouped**: Audit intervals/timeouts, Fix Unbounded Map Growth.
* **Action**: Audit all `setInterval`/`setTimeout` in `marketWatcher.ts` and `activeTechnicalsManager.svelte.ts`. Store references explicitly and verify `clearInterval`/`clearTimeout` in component teardown/`dispose` methods. Implement bounded eviction strategies for caching Maps via `.entries()` iteration.
* **Specific Test Cases**:
  - `test('MarketWatcher cleans up intervals upon destroy() to prevent memory leaks', () => { /* mount, destroy, and assert timers are cleared */ })`
  - `test('Active Map limits size using .entries() eviction', () => { /* fill cache beyond limit and assert inactive entries are evicted properly */ })`

### 3. Secure UI & XSS Mitigation
**Fixes Grouped**: Sanitize `{@html}` tags, Mask Raw Error Output.
* **Action**: Wrap all dynamic `{@html}` expressions with `DOMPurify.sanitize(...)`. Refactor `BitunixApiError.rawMessage` usage to parse and filter out HTML using `.toLowerCase().includes('<html')` and map to localized safe keys like `apiErrors.invalidResponse`.
* **Specific Test Cases**:
  - `test('BitunixApiError filters out HTML proxy error pages', () => { /* mock 502 Bad Gateway HTML and assert safe fallback error key */ })`
  - `test('Component sanitizes dynamic HTML input', () => { /* pass <script> payload and assert it is neutralized */ })`

### 4. All i18n & Error Handling Fixes (Refactor / Warnings)
**Fixes Grouped**: Extract hardcoded UI strings, Provide actionable error messages.
* **Action**: Extract hardcoded UI strings (e.g., Technicals Panel labels) into SvelteKit localization keys. Improve API error catch blocks to provide actionable feedback (e.g., "Network disconnected" instead of "[object Object]").
* **Justification**: Does this measurably improve stability or performance? Yes, replacing raw and unhandled error states prevents UI crashes and undefined behaviors during offline or failing network conditions, significantly improving application stability. Replacing hardcoded strings is necessary for product accessibility, directly fulfilling UX requirements. Cosmetic refactoring will be postponed.
