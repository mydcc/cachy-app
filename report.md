# In-Depth Status & Risk Report (Phase 1)

## 🔴 CRITICAL: Risk of financial loss, crash, or security vulnerability

1. **API Response Error Mapping (Data Exposure / Parsing Crash)**
   - API error responses (e.g. 500 pages) expose raw HTML strings via `response.statusText`, non-JSON `text()` payloads, or API error `rawMessage`. The current logic leaks these gateway details or raw HTML directly to standard logs or UI via `toastService`, which violates security guidelines. Ensure that parsing failures map to generic localized error keys (e.g., `apiErrors.invalidResponse`).
   - Location: `src/services/apiService.ts` (e.g., around line 390+ where `safeJson` or raw text parsing occurs).

2. **Indeterminate State Reversion (Order Deletion)**
   - In `tradeService.ts`, when dealing with a network timeout/indeterminate backend failure during an action like FlashClose, the optimistic UI removes the unconfirmed order unconditionally if it's an API failure. Wait, upon checking the code `tradeService.ts` correctly sets `_isUnconfirmed = true` on non-terminal errors, but we must ensure that we never double-order or unconditionally delete in indeterminate states across all trade services (we should write a specific test to confirm it's not deleted).

3. **Loss of Precision for Large Ints/High-Precision Floats via `JSON.parse`**
   - The memory states that `safeJsonParse` must be strictly used instead of native `JSON.parse`. There are widespread uses of `JSON.parse` across files (e.g., `backupService.ts`, `apiService.ts`, `apiQuotaTracker.svelte.ts`, `wasmCalculator.ts`, `mappers.ts`). These can silently corrupt precision on 64-bit IDs or high-precision prices.
   - Location: Multiple files (as found by `grep`). Need to import and use `safeJsonParse`.

4. **Missing DOMPurify Sanitize on `{@html}`**
   - Missing `DOMPurify.sanitize()` around several `{@html}` tags in components (e.g., in `src/components/shared/JournalContent.svelte`, `src/lib/windows/implementations/DialogView.svelte`, `src/routes/[[lang]]/(seo)/+layout.svelte`, `src/components/shared/Icon.svelte`). Any dynamic content rendered via `{@html}` must be strictly wrapped with `DOMPurify.sanitize()` to prevent XSS vulnerabilities.

5. **`catch (e: any)` Type Bypassing**
   - In many services, `catch (e: any)` is used instead of `catch (e: unknown)`. This bypasses TypeScript type safety and violates the memory rule. Use `e instanceof Error ? e.message : String(e)` to safely extract error messages.
   - Locations: `dataRepairService.ts`, `syncService.ts`, `newsService.ts`, `activeTechnicalsManager.svelte.ts`, `CloudTab.svelte`, etc.

## 🟡 WARNING: Performance issue, UX error, missing i18n

1. **Unclosed Map/Set Collections upon Service Teardown (Memory Leaks)**
   - Unbounded memory growth in caching Maps/Sets. Complete teardown methods (e.g., `destroy()`) must unconditionally call `.clear()` on all internal `Map` and `Set` collections. Also, evicting from reference-counted Maps must iterate via `.entries()` and safely evict inactive entries (`val === 0`).
   - Locations: `marketWatcher.ts`, `apiService.ts`, `bitunixWs.ts`, etc.

2. **Downcasting Decimal to Float / Precision**
   - Widespread usage of `.toNumber()` on `Decimal` objects in places where precision could be lost (e.g., `activeTechnicalsManager.svelte.ts`, `market.svelte.ts`, calculators). Decimal.js types must be maintained end-to-end to prevent precision loss.

## 🔵 REFACTOR: Code smell, technical debt

1. **Refactoring to explicit `catch (e: unknown)`**
   - Enforce type safety in error blocks across the codebase by strictly using `unknown` instead of `any`.

# Action Plan (Phase 2)

## Group 1: Security & Hardening (`safeJsonParse` and XSS Prevention)
- **Replace `JSON.parse` with `safeJsonParse`**: Update `apiService.ts`, `backupService.ts`, `apiQuotaTracker.svelte.ts`, `wasmCalculator.ts`, and `mappers.ts` to use `safeJsonParse` instead of `JSON.parse` to prevent silent precision loss with large numeric IDs.
  - *Justification*: Prevents financial calculation errors due to integer and float precision loss on 64-bit numbers (CRITICAL).
  - *Test Case*: Ensure a test exists or run existing tests that pass a 19-digit number or high-precision float through `JSON.parse` and show it's fixed. (e.g., `npm run test src/tests/hardening/server_precision_repro.test.ts`).
- **XSS Prevention on `{@html}` tags**: Update `src/components/shared/Icon.svelte`, `src/components/shared/JournalContent.svelte`, `src/components/shared/OrderDetailsTooltip.svelte`, and `src/routes/[[lang]]/(seo)/+layout.svelte` to wrap dynamic string interpolations in `DOMPurify.sanitize()`.
  - *Justification*: Prevents malicious scripts from executing, closing potential XSS attack vectors (CRITICAL).

## Group 2: Error Handling & Type Safety (`catch (e: any)` and HTML Leaks)
- **Fix HTML Error Leaks**: Update `apiService.ts` and `tradeService.ts` to check if error messages (e.g., `BitunixApiError.rawMessage` or `text()`) contain HTML (e.g., `.toLowerCase().includes('<html')`) and map them to safe localized error keys like `apiErrors.invalidResponse`. Never expose raw `response.statusText` containing HTML to the UI or standard logs.
  - *Justification*: Prevents leaking sensitive gateway details or raw proxy error pages to users (CRITICAL).
- **Refactor `catch (e: any)` to `catch (e: unknown)`**: Update all `catch (e: any)` blocks across the codebase (`dataRepairService.ts`, `syncService.ts`, `newsService.ts`, `activeTechnicalsManager.svelte.ts`) to use `catch (e: unknown)` and type-narrow using `e instanceof Error ? e.message : String(e)`.
  - *Justification*: Measurably improves stability by preventing unexpected properties from being accessed on error objects, causing secondary crashes (REFACTOR/WARNING).

## Group 3: Memory Leaks & Resource Management
- **Ensure `.clear()` in `destroy()` methods**: Update `marketWatcher.ts`, `apiService.ts`, `bitunixWs.ts`, and `bitgetWs.ts` teardown methods to unconditionally call `.clear()` on all internal `Map` and `Set` collections (e.g., `syntheticSubs`, `pendingSubscriptions`, caches) upon service disposal.
  - *Justification*: Prevents unbounded memory growth in caching Maps/Sets leading to Out-Of-Memory (OOM) crashes in long-running sessions (WARNING).
- **Evicting from reference-counted Maps**: Ensure that eviction strategies safely iterate via `.entries()` instead of blindly removing the first key via `.keys().next().value`.
  - *Justification*: Prevents corrupting active application state (WARNING).

## Group 4: Decimal Precision in Calculations
- **End-to-End Decimal.js Usage**: Remove inappropriate `.toNumber()` downcasts in critical paths such as `activeTechnicalsManager.svelte.ts` and `tradeService.ts` (if any are found updating stores).
  - *Justification*: Measurably improves stability by preventing float calculation errors that could lead to incorrect order sizing or risk limits (WARNING).
