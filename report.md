# Systematic Maintenance & Hardening Analysis Report

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1. **Incorrect Exception Extraction Pattern (`TradeService`)**
   - **File:** `src/services/tradeService.ts`
   - **Issue:** The API error responses are processed to expose raw texts such as `rawMsg` into a new `BitunixApiError(code, "apiErrors.generic", rawMsg)`. Later, the code checks `const msg = (e instanceof BitunixApiError && e.rawMessage) ? e.rawMessage : ...`. If the API provider responds with a 500/502 and returns an HTML error page, `rawMsg` contains HTML. When this reaches UI bindings (e.g. via toast notifications), it poses an XSS vulnerability, or at the very least exposes gateway structure info and causes confusing UI outputs.
   - **Required Action:** Check `rawMessage` (or response text) for HTML (e.g. `toLowerCase().includes('<html')`) and map it to a safe, localized error key `apiErrors.invalidResponse` before exposing it to UI components or logs.
   - **Suggested Unit Test:** `src/services/tradeService_errors.test.ts` - Simulate a 500 response returning HTML and verify that the error thrown contains the mapped safe error rather than the raw HTML.

2. **Unvalidated Decimals in Positions/Orders (`TradeService`)**
   - **File:** `src/services/tradeService.ts`
   - **Issue:** While mapping unknown payloads (e.g., `Record<string, unknown>`), values are not robustly typed or cast. For instance, `filledAmount: new Decimal(0)` uses Decimal, but other mappings risk losing precision or throwing errors on undefined keys.
   - **Required Action:** Ensure explicit Decimal typing and strict casting from API payload to application state to prevent financial loss due to precision errors.

## 🟡 WARNING (Performance issue, UX error, missing i18n)

3. **Hardcoded UI Strings in Svelte Components**
   - **Files:** `src/components/settings/tabs/IndicatorSettings.svelte`
   - **Issue:** Hardcoded strings like `<span>Panel Configuration</span>`, `<span>Summary</span>`, `<span>Oscillators</span>` are found instead of using the `$_('key')` i18n translation syntax. This breaks multi-language support.
   - **Required Action:** Migrate to `$_(key)` syntax for all text in this file.

4. **Unbounded Toast Array (Memory Leak / Performance)**
   - **Files:** `src/services/toastService.svelte.ts`
   - **Issue:** The toast notification array lacks bounds. It simply calls `this.toasts.push(toast)`. A user leaving the application running for long periods could suffer memory constraints as toasts accumulate without a defined cap.
   - **Required Action:** Ensure toast arrays have a maximum cap (e.g., max 50 toasts) and implement bounded eviction strategies (removing the oldest toast).

5. **Dangling Intervals / Memory Leaks (`PerformanceMonitor`)**
   - **File:** `src/utils/performanceMonitor.ts`
   - **Issue:** `setInterval` is used to log performance metrics, but consumers (e.g., UI elements binding it) must correctly call `stop()` or the instance leaks into the background indefinitely.
   - **Required Action:** Verify lifecycle bindings or replace with a non-leaking observer pattern.

## 🔵 REFACTOR (Code smell, technical debt)

6. **Code Structure for Catch Blocks**
   - **File:** `src/services/apiService.ts`
   - **Issue:** The `catch (e: unknown)` blocks repeatedly use `throw new Error("apiErrors.generic", { cause: e });`.
   - **Required Action:** A generic wrapper function for API calls could standardize this error mapping logic to improve stability and maintainability.

---

### Implementation Plan (Action Plan)

**Phase 1: Hardening API Handlers & Types**
- Fix exception extraction for HTML XSS in `TradeService`.
- Strictly enforce Decimal.js types across the OMS interface mapping.

**Phase 2: Resolving Memory Leaks & Perf**
- Cap the `toastService` array strictly at 50 elements.
- Verify `setInterval` destructions globally.

**Phase 3: i18n Migrations**
- Convert `IndicatorSettings.svelte` strings to `$_(...)`.
