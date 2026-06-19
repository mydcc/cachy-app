# cachy-app Code Analysis & Status Report

## 🔴 CRITICAL: Risk of financial loss, crash, or security vulnerability.

### 1. Direct DOM Manipulation Vulnerabilities (XSS Risk)
**Issue:** Widespread use of `{@html ...}` in Svelte components. While some cases use `DOMPurify.sanitize()`, many do not, potentially opening up Cross-Site Scripting (XSS) vulnerabilities, especially if user data or unvalidated API responses are rendered.
**Location:** Multiple components (`src/components/shared/Icon.svelte`, `src/components/shared/MarketOverview.svelte`, `src/components/results/SummaryResults.svelte`, etc.)
**Recommendation:** Refactor to use native Svelte rendering where possible, or ensure *all* `{@html}` blocks strictly wrap content with `DOMPurify.sanitize()`. Remove `{@html icons.*}` patterns if icons can be rendered natively via SVGs or components.

### 2. Loss of Precision in Financial Calculations (JSON.parse)
**Issue:** Widespread usage of native `JSON.parse` instead of the project's custom `safeJsonParse` utility. In financial software, using native `JSON.parse` with standard JavaScript floating point numbers for prices, quantities, and especially 64-bit exchange order IDs can result in silent precision loss.
**Location:** `src/services/apiService.ts`, `src/services/backupService.ts`, `src/components/shared/GlobalTracker.svelte`, etc.
**Recommendation:** Replace all instances of `JSON.parse` with `safeJsonParse`.

### 3. Native Float Usage for Prices/Quantities
**Issue:** `number` types are still used for `price`, `qty`, and `quantity` fields in multiple locations (e.g., `src/services/smc/types.ts`, `src/services/technicalsTypes.ts`). This violates the financial standard rule of strictly using Decimal.js.
**Location:** `src/services/smc/types.ts`, `src/services/technicalsTypes.ts`.
**Recommendation:** Migrate these types to `Decimal` (from `decimal.js`) to prevent rounding errors during calculations.

### 4. Memory Leaks in WebSocket Management
**Issue:** The teardown mechanism in WebSocket managers (`src/services/bitunixWs.ts`, `src/services/bitgetWs.ts`) lacks thorough cleanup. While timeouts and intervals are cleared, internal collections (e.g., `pendingSubscriptions`, `syntheticSubs`) are not systematically cleared on `destroy()`.
**Location:** `src/services/bitunixWs.ts`, `src/services/bitgetWs.ts`.
**Recommendation:** Update the `destroy()` methods to explicitly call `.clear()` on all `Map` and `Set` instances.

### 5. Blind Error Swallowing `catch (e: any)`
**Issue:** Substantial use of `catch (e: any)` throughout the application. This bypasses TypeScript's safety, and often leads to unhandled nested errors or raw error messages leaking to the UI.
**Location:** `src/services/newsService.ts`, `src/routes/api/sync/+server.ts`, etc.
**Recommendation:** Refactor all `catch (e: any)` to `catch (e: unknown)`, accompanied by proper type-narrowing (e.g., `e instanceof Error ? e.message : String(e)`).

## 🟡 WARNING: Performance issue, UX error, missing i18n.

### 1. Missing Internationalization (i18n)
**Issue:** Hardcoded English strings exist directly in Svelte components, bypassing the `$_()` translation wrapper.
**Location:** `src/components/settings/EngineDebugPanel.svelte`, `src/components/settings/tabs/IndicatorSettings.svelte`.
**Recommendation:** Wrap these strings in `$_('key')` and add them to the translation dictionaries.

## 🔵 REFACTOR: Code smell, technical debt

### 1. Inconsistent API Response Parsing
**Issue:** Potential risk of raw HTML leaking into the UI if a gateway returns a 502/504 error page during an API call.
**Location:** General API request utility methods.
**Recommendation:** Ensure API errors map strictly to safe, localized error keys (e.g., `apiErrors.invalidResponse`) if HTML payloads are detected, to prevent exposing proxy error pages.


# Action Plan

## 1. Data Integrity & Precision Fixes (CRITICAL)
**Goal:** Prevent silent precision loss and enforce type safety.
- Replace `JSON.parse` with `safeJsonParse` in `src/services/apiService.ts`, `src/services/backupService.ts`, and `src/components/shared/GlobalTracker.svelte`.
- *Justification:* Large numeric IDs (common in exchange platforms) will lose precision if parsed with native `JSON.parse`. `safeJsonParse` protects data integrity during serialization.
- *Test Case:* Write a unit test validating that a JSON payload with a 64-bit exchange ID correctly parses via `safeJsonParse` and fails or loses precision via native `JSON.parse`.

## 2. Security Hardening & DOM Sanitization (CRITICAL)
**Goal:** Prevent XSS from unvalidated data rendering.
- Audit all `{@html ...}` usages in Svelte components.
- Wrap dynamic/external content with `DOMPurify.sanitize(...)` (e.g., in `src/components/shared/Icon.svelte`).
- *Justification:* Enforcing sanitation prevents malicious scripts embedded in external responses (e.g., news feeds, external alerts) from executing in the client application.

## 3. Memory Leak Prevention (CRITICAL)
**Goal:** Ensure deterministic resource release in WebSocket managers.
- Modify `destroy()` methods in `src/services/bitunixWs.ts` and `src/services/bitgetWs.ts`.
- Explicitly call `.clear()` on `pendingSubscriptions`, `syntheticSubs`, and any other internal tracking `Map` or `Set`.
- *Justification:* Unclosed subscriptions and retained Map references prevent garbage collection, leading to memory bloating during extended usage or reconnection loops.
- *Test Case:* Create a unit test `bitunixWs.leak.test.ts` to assert that internal map sizes are `0` after `destroy()` is called.

## 4. Error Handling & Type Safety Refactor (CRITICAL)
**Goal:** Remove unsafe `any` error catch blocks.
- Refactor instances of `catch (e: any)` to `catch (e: unknown)`.
- Apply type narrowing using `e instanceof Error ? e.message : String(e)` across affected services (e.g., `src/services/newsService.ts`, `src/routes/api/sync/+server.ts`).
- *Justification:* Using `unknown` forces explicit type checking, reducing the risk of silent failures or unexpected `undefined` variables in error-handling logic.

## 5. UI/UX & Missing i18n (WARNING)
**Goal:** Standardize localization.
- Extract hardcoded strings from `src/components/settings/EngineDebugPanel.svelte` and `src/components/settings/tabs/IndicatorSettings.svelte`.
- Replace with `$_('...')` and add corresponding keys to the localization files.

## 6. Financial Standard Enforcement (WARNING/REFACTOR)
**Goal:** Eliminate native floats.
- Migrate the `number` type for `price` and `quantity` fields to Decimal types in `src/services/smc/types.ts` and `src/services/technicalsTypes.ts`.
- *Justification:* Using native JS floats for prices results in floating point errors (e.g., `0.1 + 0.2 = 0.30000000000000004`), which is unacceptable in an institutional-grade trading platform.
