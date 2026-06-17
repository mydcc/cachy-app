# In-Depth Code Analysis Report & Action Plan

## Step 1: Status & Risk Report

### Data Integrity & Mapping
- **Type Safety & Interfaces:** Many core services (e.g., `TradeService`, `MarketWatcher`, `NewsService`) use `catch (e: any)` which undermines type safety. API payloads are often cast using `any` or not thoroughly validated for null/undefined limits before processing.
- **Serialization & Float Precision:** There is a heavy reliance on `JSON.parse` across the codebase (e.g., `backupService.ts`, `apiQuotaTracker.svelte.ts`, `wasmCalculator.ts`) instead of the type-safe `safeJsonParse`, risking precision loss with large numeric IDs. Additionally, many files (e.g., `activeTechnicalsManager.svelte.ts`, `market.svelte.ts`) cast `Decimal` to native JS numbers via `.toNumber()`, creating severe risks of precision loss in financial data.

### Resource Management & Performance
- **Memory Leaks:** Multiple services (`apiService.ts`, `bitunixWs.ts`, `bitgetWs.ts`) use `setInterval` for ping/watchdog timers without clear, consistent `clearInterval` invocations upon teardown. Missing `.clear()` calls on maps and sets (`pendingSubscriptions`, `syntheticSubs`) during service destruction compound this risk.
- **Hot Paths:** The `activeTechnicalsManager.svelte.ts` and `market.svelte.ts` process high-frequency price updates but sometimes downcast Decimal types and contain complex reactivity that could block the UI thread during volatile periods.

### UI/UX & Accessibility (A11y)
- **Error Messages & Broken States:** Several API errors directly expose raw messages (potentially containing proxy HTML) to the UI via `toastService` instead of mapping them to generic localized keys.
- **Missing i18n:** Raw string messages are used in exception handling instead of robust localization keys.

### Security & Validation
- **DOM Manipulations:** Dozens of Svelte components (e.g., `MarketOverview.svelte`, `SummaryResults.svelte`) use `{@html ...}` directly. Most are for icons, but if unverified text or API responses are injected, it poses an XSS risk.
- **Validation:** User inputs sometimes lack strict Zod validation before API submission, risking malformed orders during network anomalies.

---

### Prioritized Findings

#### 🔴 CRITICAL (Financial Risk, Crash, Security)
- **[activeTechnicalsManager.svelte.ts, market.svelte.ts, stores]** Casts Decimal to native float via `.toNumber()`. High risk of precision loss in financial data.
- **[wasmCalculator.ts, fastConversion.ts, ai.svelte.ts, etc.]** Uses unsafe native `JSON.parse` instead of `safeJsonParse`, leading to potential precision loss on large IDs and silent parsing errors.
- **[TradeService, MarketWatcher, NewsService]** Uses `catch (e: any)` which breaks type narrowing and can crash if the error isn't an object.
- **[bitunixWs.ts, apiService.ts]** Uncaught HTML proxy error messages leak to the UI instead of safe, localized `apiErrors.invalidResponse` keys.

#### 🟡 WARNING (Performance, UX, i18n, Leaks)
- **[bitunixWs.ts, bitgetWs.ts, apiService.ts, omsService.ts]** Uses `setInterval` without guaranteed `clearInterval` upon instance destruction, leading to ghost connections and memory leaks.
- **[Multiple Svelte Components]** Uses `{@html ...}` blocks. Need to ensure `DOMPurify` is used for any dynamic user/API content.
- **[Map/Set teardown]** Teardown methods do not uniformly call `.clear()` on internal Maps/Sets, retaining memory over time.

#### 🔵 REFACTOR (Stability, Maintainability)
- **[tradeService.ts, bitunixWs.ts, market.svelte.ts, etc.]** Heavy use of `any` type (over 10-20 times per file). Needs refactoring to `unknown` and type guards or Zod schemas to ensure stability.

---

## Step 2: Action Plan

### 1. Fix Decimal Precision Loss (Data Integrity)
- **Justification:** Measurably improves financial calculation stability by preventing JS float rounding errors.
- **Action:** Replace `.toNumber()` on Decimals with strict Decimal math throughout `activeTechnicalsManager.svelte.ts`, `market.svelte.ts`, and core stores.
- **Tests:** Add unit tests simulating high-precision operations that fail with JS floats but pass with `Decimal`.

### 2. Standardize JSON Parsing (Data Integrity)
- **Justification:** Prevents application crashes and silent precision loss on API data.
- **Action:** Replace `JSON.parse` with `safeJsonParse` across the codebase (e.g., `backupService.ts`, `wasmCalculator.ts`, `apiQuotaTracker.svelte.ts`).
- **Tests:** Add unit tests to `safeJsonParse` and target services verifying proper behavior on malformed JSON and large numbers.

### 3. Hardening WebSocket & Memory Leaks (Resource Management)
- **Justification:** Measurably improves stability by preventing memory exhaustion and duplicate ghost orders.
- **Action:** Update teardown methods (`destroy()`) in `bitunixWs.ts`, `bitgetWs.ts`, `omsService.ts`, and `apiService.ts` to `clearInterval` all timer IDs and unconditionally `.clear()` all internal `Map` and `Set` collections. Ensure timer IDs are typed as `ReturnType<typeof setInterval>`.
- **Tests:** Create tests verifying `Map/Set` emptiness and timer destruction post-teardown (e.g., using `vi.useFakeTimers()`).

### 4. Type Safety & Error Handling (Security & UX)
- **Justification:** Enhances UI reliability during network errors and prevents exposing raw proxy HTML.
- **Action:** Replace `catch (e: any)` with `catch (e: unknown)`. Update error handling in `TradeService` and WebSocket layers to detect HTML payloads (`.toLowerCase().includes('<html')`) and map to localized generic keys (`apiErrors.invalidResponse`).
- **Tests:** Test error mapping logic with simulated HTML 502/504 gateway error responses.
