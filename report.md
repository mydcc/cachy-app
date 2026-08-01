# Cachy-App: In-Depth Code Analysis & Status Report

## 🔴 CRITICAL
1. **Precision Loss in Number Conversion (Data Integrity)**
   - Multiple instances of `Number()` conversion of Decimal objects or raw API timestamps (e.g. `activeTechnicalsManager.svelte.ts`, `mdaService.ts`, `bitunixWs.ts`, `csvService.ts`). This leads to precision loss, especially with high-precision crypto prices and 19-digit IDs.
   - Native `JSON.parse()` is used widely on API responses, causing silent truncation of large integers (e.g., in `tradeService_flashClose.test.ts`, `backupService.ts`, `apiQuotaTracker.svelte.ts`).
2. **Missing Input Validation & Error Handling (Data Integrity/Security)**
   - The catch block in `dataRepairService.ts` handles `e: unknown` but then accesses `e.message` without fully verifying `e` is an `Error` instance, which could throw.
   - Widespread use of `catch (e: any)` in `workerPool.ts` and other services defeats TypeScript's type safety.

## 🟡 WARNING
1. **Unsafe DOM Manipulation (Security)**
   - Instances of `{@html}` used directly without `DOMPurify.sanitize()` (e.g., `SummaryResults.svelte`, `DashboardNav.svelte`, `ToastItem.svelte`, `MarketOverview.svelte`). This introduces XSS vulnerabilities if the data originates from external sources or user input.
2. **Resource Management (Memory Leaks)**
   - Extensive use of `setInterval` for watchdogs, polling, and cache pruning (`omsService.ts`, `apiService.ts`, `bitunixWs.ts`, `bitgetWs.ts`, `market.svelte.ts`). If services are disposed without explicitly clearing these intervals, they will leak memory and continue polling.
3. **Missing i18n & Error Exposure (UX)**
   - Error handling in some catch blocks might expose raw errors to the user instead of mapping to a localized key using `$_`.
   - Hardcoded status strings (e.g., `ConnectionStatus.svelte`) might not be fully localized.

## 🔵 REFACTOR
1. **Decimal.js Consistency (Stability)**
   - Need to standardize on Decimal.js for all numerical inputs in the domain layer to prevent precision loss. Enforce passing `Decimal` objects instead of calling `.toNumber()`.
2. **Robust JSON Parsing (Stability)**
   - Replace native `JSON.parse()` with the custom `safeJsonParse` utility across the codebase, especially where external data is received, to safeguard against data truncation.

## Step 2: Action Plan (Implementation)

### Group 1: Data Integrity & Decimal Hardening
**Justification:** Measurably improves financial stability by preventing precision loss in crypto calculations.
- **Action:** Refactor `activeTechnicalsManager.svelte.ts` and `csvService.ts` to strictly maintain `Decimal` objects instead of using `.toNumber()`.
- **Action:** Replace native `JSON.parse` with the project's `safeJsonParse` (or similar utility) in `backupService.ts`, `apiQuotaTracker.svelte.ts`, and WebSocket parsing to protect 19-digit IDs and high-precision floats.
- **Test Case (CRITICAL):** Create a unit test `activeTechnicalsManager.precision.test.ts` to verify that `calculateTechnicals` correctly handles 19-digit precision Decimals without truncation. Create a unit test `backupService.precision.test.ts` to verify that restoring a backup with a 19-digit ID retains its exact value.

### Group 2: Error Handling & Security (DOM & Catch Blocks)
**Justification:** Measurably improves stability by preventing unexpected runtime crashes and XSS vulnerabilities.
- **Action:** Audit and wrap unprotected `{@html}` tags (e.g., in `MarketOverview.svelte` and `DashboardNav.svelte`) with `DOMPurify.sanitize()`.
- **Action:** Refactor `catch (e: any)` in `workerPool.ts` and `trade.svelte.ts` to `catch (e: unknown)` and properly type-guard before accessing `e.message`.
- **Action:** Fix `dataRepairService.ts` to use `e instanceof Error` correctly instead of assuming `e` is an object.
- **Test Case (CRITICAL):** Add a unit test `workerPool.error.test.ts` simulating a thrown string (non-Error object) to ensure the catch block handles it safely without crashing.

### Group 3: Memory Leaks & Resource Management
**Justification:** Measurably improves performance and stability over long sessions by preventing unbounded interval polling.
- **Action:** Ensure all `setInterval` calls in `omsService.ts`, `apiService.ts`, and WebSocket classes (`bitunixWs.ts`, `bitgetWs.ts`) are properly cleared in their respective `destroy()` or `close()` methods.
- **Action:** Verify that `Map` and `Set` collections in these services are explicitly cleared during teardown to release references.

### Group 4: i18n & UX Hardening
**Justification:** Prevents leaking sensitive raw error strings or unlocalized placeholders to the user interface.
- **Action:** Review `ConnectionStatus.svelte` and ensure `statusText` maps correctly to `$_('...')` i18n keys.
- **Action:** Ensure API error extraction safely maps unknown HTML responses (e.g. 502 Bad Gateway pages) to generic UI keys rather than exposing raw HTML via the toast service.
