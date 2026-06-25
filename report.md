# Code Analysis & Risk Report (Step 1)

## 🔴 CRITICAL
1. **Precision Loss (Data Integrity)**
   - `parseFloat` is used in `src/services/csvService.ts:353`. Although mitigated for very large IDs, any `parseFloat` on financial IDs or data can silently lose precision before failing.
   - `Number()` downcasting is used repeatedly in `activeTechnicalsManager.svelte.ts`, `app.test.ts`, and `csvService.test.ts` instead of maintaining `Decimal` end-to-end.
2. **Missing `safeJsonParse` (Data Integrity)**
   - Native `JSON.parse` is used directly in `apiQuotaTracker.svelte.ts`, `backupService.ts`, and `wasmCalculator.ts`. Large integers in raw JSON strings will be truncated during parsing, corrupting API responses and backups.
3. **Memory Leaks (Resource Management)**
   - `setInterval` is used in `apiService.ts`, `bitgetWs.ts`, `bitunixWs.ts`, and `omsService.ts`. While timers are stored, instances lack a unified `destroy()` method that `clearInterval`s all of them simultaneously, leading to zombie background tasks.
   - `setTimeout` is heavily utilized. In `activeTechnicalsManager.svelte.ts`, timers are stored in `this.throttles`, but lack comprehensive clearing on instance teardown.
   - Unhandled `catch (e: any)` in `activeTechnicalsManager.svelte.ts`, `dataRepairService.ts`, `newsService.ts`, and `syncService.ts`. This bypasses strict typing and can lead to runtime crashes if the caught object lacks a `.message` property.

## 🟡 WARNING
1. **Hardcoded i18n / Raw Error Messages (UI/UX)**
   - `toastService.error()` and `toastService.warning()` are called with raw string interpolations instead of `t(key)` in `calculationStrategy.ts`, `logger.ts`, `marketAnalyst.ts`, and `technicalsService.ts`. These strings will not be localized for international users.
2. **Improper Map/Set Cleanup (Resource Management)**
   - Many services like `apiService.ts` and `bitunixWs.ts` call `.clear()` safely, but `bitgetWs.ts` might be missing proper teardown.
   - Eviction logic in caches needs verification to ensure bounded memory growth.

## 🔵 REFACTOR
1. **Defensive Typing**
   - Widespread use of `any` casts in tests and error catch blocks should be strictly refactored to `unknown` with runtime type checking.

---

# Action Plan (Step 2)

### 1. Fix Precision & Data Parsing (CRITICAL)
- **Replace `JSON.parse` with `safeJsonParse`**: Update `apiQuotaTracker.svelte.ts`, `backupService.ts`, and `wasmCalculator.ts`.
  - **Test Case**: Write a unit test `should demonstrate that safeJsonParse preserves 19-digit integers` verifying that parsing `{"id": 1234567890123456789}` maintains the ID exactly.
- **Remove `Number()` downcasting**: Update `activeTechnicalsManager.svelte.ts` and `csvService.ts` to strictly maintain `Decimal` objects. Remove `parseFloat`.
  - **Test Case**: Create a test where precision matters (e.g. `const v = new Decimal('1.0000000000000001')`) and verify `Number()` downcasting breaks precision, then demonstrate `Decimal` preservation.

### 2. Hardening Timers & Teardown (CRITICAL)
- **Unified Teardown**: Add explicit `destroy()` methods to `activeTechnicalsManager.svelte.ts`, `apiService.ts`, `bitgetWs.ts`, `bitunixWs.ts`, and `omsService.ts`. Ensure all `clearInterval` and `clearTimeout` are called, followed by `Map.clear()`.
  - **Test Case**: Write a `leak.test.ts` for each class. Initialize the service, call `destroy()`, and assert that properties like `throttleMap.size` or internal timer trackers are `0` or `null`.

### 3. Strict Error Catching (CRITICAL)
- **Replace `catch (e: any)` with `catch (e: unknown)`**: Apply type narrowing (`e instanceof Error ? e.message : String(e)`) in `activeTechnicalsManager.svelte.ts`, `dataRepairService.ts`, `newsService.ts`, and `syncService.ts`.
  - **Test Case**: Force an error to be thrown as a string (e.g., `throw 'Network Error'`) instead of an Error object and assert it parses the message safely without crashing.

### 4. Fix Hardcoded i18n (WARNING)
- **Localize `toastService` messages**: Refactor `calculationStrategy.ts`, `logger.ts`, `marketAnalyst.ts`, and `technicalsService.ts` to use translated keys (e.g., `t('errors.analysisFailed')`).

### 5. Refactor: Defensive Typing (REFACTOR)
- **Justification:** "Does this measurably improve stability or performance?" Yes. By removing generic `any` types (especially in catch blocks or API payloads) we eliminate the possibility of unexpected runtime `TypeError`s when properties like `.message` or `.data` are absent, definitively improving application stability during unexpected network or system states.

### 6. Final Verification (Pre-Commit)
- Execute `npm run check && npm run test` to verify zero regressions.
