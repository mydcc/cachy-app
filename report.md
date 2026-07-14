# Cachy App - Security & Hardening Report

## 🔴 CRITICAL
- **Type Safety**: The codebase extensively uses `catch (e: any)` (e.g., in `dataRepairService.ts`, `syncService.ts`, `newsService.ts`, and many components/stores), which bypasses TypeScript's type narrowing. This can lead to runtime crashes when trying to access properties like `e.message` on non-Error objects.
- **WebSocket / API Error Leaks**: Proxy error pages (raw HTML) could leak via raw exception messages to the UI. There are no centralized checks for HTML content in errors before passing them to the UI, violating the defense-in-depth requirement to map indeterminate failures to safe `i18n` keys (e.g., `apiErrors.invalidResponse`).
- **Memory Leaks in Stores**: Caches in `market.svelte.ts` (klines history) and `workerPool.ts` lack bounded eviction strategies. Unbounded `push()` operations to arrays (e.g., `klines.push(...)`) can consume unbounded memory over long sessions, impacting HFT performance. Eviction mechanisms on Sets/Maps via `.entries()` need to be implemented properly without blindly clearing the first element.

## 🟡 WARNING
- **Precision Loss**: Multiple performance and statistics calculators (`src/lib/calculators/charts.ts`, `src/lib/calculators/stats.ts`) downcast Decimal types using `.toNumber()` (e.g., for PnL, WinRate, MFE, MAE). While acceptable for high-level UI charts, native floats can introduce precision drifts during intermediate math operations.
- **XSS Vulnerabilities via `{@html}`**: There is evidence of `{@html}` usage in components for rendering dynamic content. Without strict wrapping in `DOMPurify.sanitize()`, this presents a Cross-Site Scripting (XSS) risk.
- **Synchronous Hot Paths**: Heavy synchronous data pushing in `activeTechnicalsManager.svelte.ts` and `marketWatcher.ts` directly affects the UI thread. The system is designed for high-frequency trading (HFT) and needs these offloaded or handled via chunked immutable updates.
- **Unsafe JSON Parsing**: In multiple files, native `JSON.parse` is used instead of the custom `safeJsonParse` utility, leading to potential silent precision loss for large numeric IDs (e.g., order IDs).

## 🔵 REFACTOR
- **Array Mutations in Svelte 5 Runes**: Direct `.push()` operations on store arrays (e.g., `this.entries.push(entry)` in `journal.svelte.ts`) bypass standard reactivity semantics in some edge cases. It is recommended to use functional updates (`this.entries = [...this.entries, entry]`) or specialized state chunks if performance allows, to ensure consistent reactivity.
- **Indeterminate Backend Failures**: Optimistic UI state operations for orders currently risk unconfirmed state issues during network timeouts. Implement logic to retain optimistic orders marked as `_isUnconfirmed = true` instead of rolling them back blindly.

# Step 2: Action Plan

## 1. Type Safety Hardening
- **Objective:** Fix `catch (e: any)` occurrences across the codebase to use `unknown` and properly narrow types.
- **Justification:** Measurably improves stability by preventing runtime crashes when non-Error objects are thrown or when accessing properties like `e.message` blindly.
- **Specific Test Cases:**
  - `src/services/dataRepairService.test.ts`: Mock throwing a string instead of an Error object and assert it does not crash and handles the error gracefully.
  - `src/services/newsService.test.ts`: Mock a thrown `null` or un-parseable JSON and assert error extraction works correctly.

## 2. WebSocket & API Security (HTML Leak Prevention)
- **Objective:** Intercept and sanitize raw API/WebSocket error messages to prevent raw HTML from proxy error pages from reaching the UI. Map these to safe i18n keys like `apiErrors.invalidResponse`.
- **Justification:** Measurably improves stability and security by preventing XSS and leaking internal gateway details via `toastService`.
- **Specific Test Cases:**
  - `src/services/bitunixWs.test.ts`: Send a mock error containing `<html>502 Bad Gateway</html>` and assert that the error handler catches it, sanitizes it, and outputs `apiErrors.invalidResponse` instead of the raw string.

## 3. Memory Leak Prevention & Collection Bounding
- **Objective:** Implement bounded eviction for `market.svelte.ts` (klines history) and `workerPool.ts`. Ensure teardown methods invoke `.clear()` on internal Maps/Sets, and evict using `.entries()` securely.
- **Justification:** Measurably improves performance and stability for long-running HFT sessions by preventing out-of-memory crashes and degraded garbage collection performance.
- **Specific Test Cases:**
  - `src/stores/market.test.ts`: Insert items exceeding the limit and assert that the oldest/inactive entries are evicted properly using `.entries()`, not just blindly removing the first key.

## 4. XSS Mitigation (`{@html}` Sanitization)
- **Objective:** Wrap all instances of `{@html}` rendering (e.g., in `ContentRenderer.svelte` or `MarkdownView.svelte`) with `DOMPurify.sanitize()`.
- **Justification:** Measurably improves security by strictly eliminating XSS vectors from unverified markdown, logs, or dynamically generated content.

## 5. Precision & State Integrity
- **Objective:** Replace `JSON.parse` with `safeJsonParse` for API responses. Ensure optimistic UI states mark unconfirmed orders (`_isUnconfirmed = true`) on timeouts instead of outright deleting them. Replace `.toNumber()` with native Decimal math in critical calculation paths where precision matters.
- **Justification:** Measurably improves stability by preserving large order IDs, preventing double-ordering on network timeouts, and stopping float drift during PnL calculations.
