# Cachy-App Status & Risk Report

## 🔴 CRITICAL

1. **Floating Point Safety & Data Integrity (`bitunixWs.ts`, `tradeService.ts`)**
   - **Risk:** Found instances of `Number()` being used directly on API responses (e.g., `bitunixWs.ts:1297` for timestamps). While some uses are for timestamps, relying on native floats instead of `Decimal.js` risks silent precision loss, especially for 64-bit exchange IDs or during calculation logic.
   - **Impact:** Risk of data corruption, financial loss due to incorrect price/quantity mappings.
   - **Test Case:** Inject a mocked websocket message with an ultra-large 64-bit ID or extreme precision float, and assert it is parsed and stored accurately without rounding errors.

2. **Unsafe JSON Parsing (`backupService.ts`, stores)**
   - **Risk:** Several files (`src/services/backupService.ts`, `src/stores/favorites.svelte.ts`, `src/stores/ai.svelte.ts`) are using native `JSON.parse()` instead of the project's custom `safeJsonParse` utility.
   - **Impact:** Can lead to silent float truncation on numerical values and lacks safe handling of parsing exceptions.

3. **Memory Leaks in Caching and Timers (`MarketWatcher.ts`, `omsService.ts`)**
   - **Risk:** `MarketWatcher` maintains `requests` maps, and services like `omsService`, `bitunixWs`, and `apiService` hold `setInterval` references. Without explicitly calling `.clear()` on unbound Maps/Sets during `.destroy()`, and without safely evicting inactive entries via `.entries()`, unbounded memory growth will occur.
   - **Impact:** Application crash or OOM errors during prolonged trading sessions.

4. **XSS Vulnerabilities in UI Components**
   - **Risk:** The use of raw `{@html ...}` in Svelte components (e.g., `ChartPatternsView.svelte`, `MarketOverview.svelte`) without wrapping the content in `DOMPurify.sanitize()`.
   - **Impact:** Allows Cross-Site Scripting (XSS) if the data source (API/News) is compromised.

## 🟡 WARNING

1. **Missing i18n & Leaky Error Messages**
   - **Risk:** Uncaught raw API errors or proxy HTML pages might be exposed to the UI via `toastService` instead of mapped, actionable, localized error keys (e.g., `apiErrors.invalidResponse`).
   - **Impact:** Poor UX, exposing internal gateway HTML or broken states to the user.

2. **Inconsistent Types for Catch Blocks**
   - **Risk:** The project uses `catch (e: any)` heavily across services (`newsService.ts`, `syncService.ts`).
   - **Impact:** Bypasses TypeScript strictness, potentially causing crashes if a non-Error object is thrown.

## 🔵 REFACTOR

1. **Test Mocks for Global Variables**
   - **Risk:** Missing explicit mocking of globals (`localStorage`, `$app/environment`) before application imports in tests, leading to module resolution errors.
   - **Impact:** Brittle test environment.

---

# Action Plan

### 1. Data Integrity & Precision Hardening
- **Fix:** Replace all native `JSON.parse` with `safeJsonParse`. Ensure `Decimal.js` is used strictly for price/qty parsing, and replace `Number()` casting on critical data points in WebSocket streams.
- **Justification:** Does this measurably improve stability or performance? Yes, it prevents silent data corruption and precision loss for exchange IDs and monetary values.
- **Unit Test:** `test('should preserve 64-bit precision for large order IDs using safeJsonParse', ...)`

### 2. XSS Protection
- **Fix:** Wrap all `{@html ...}` tags with `DOMPurify.sanitize(...)` in `.svelte` components.
- **Justification:** Does this measurably improve stability or performance? Yes, closes severe security vectors for injection attacks.

### 3. Memory Leak Remediation
- **Fix:** Implement explicit `.clear()` for all Maps/Sets in `.destroy()` methods. For `setInterval`/`setTimeout`, ensure IDs are stored as `ReturnType<typeof setInterval>` and properly cleared.
- **Justification:** Does this measurably improve stability or performance? Yes, guarantees steady memory usage across long-running trading sessions.

### 4. Error Handling & Type Safety
- **Fix:** Refactor `catch (e: any)` to `catch (e: unknown)` and narrow with `e instanceof Error ? e.message : String(e)`. Map raw HTML error payloads to localized i18n keys to prevent UI leakage.
- **Justification:** Does this measurably improve stability or performance? Yes, enhances runtime safety and ensures a polished, institutional-grade UX under failure conditions.
