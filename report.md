# Code Analysis & Risk Report

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)
1. **Precision Loss in API Data (`safeJsonParse` vs `JSON.parse`)**
   - **File:** Multiple components & stores (`src/components/shared/ChartPatternsView.svelte`, `src/utils/fastConversion.ts`, etc.)
   - **Risk:** Some files and APIs are using native `JSON.parse` directly on API responses containing potentially large numeric IDs and Decimals, bypassing the project's `safeJsonParse`. This will silently corrupt 19-digit identifiers and precision data for crypto values, leading to financial inaccuracies and broken logic.
2. **Missing DOMPurify for `{@html}` tags (XSS Risk)**
   - **Files:** Many components (`src/components/shared/MarketOverview.svelte`, `src/components/shared/JournalContent.svelte`, `src/components/shared/LeftControlPanel.svelte`, `src/components/shared/SidePanel.svelte`, `src/components/shared/DisclaimerModal.svelte`, etc.)
   - **Risk:** Direct `{@html}` interpolation of strings without `DOMPurify.sanitize()` enables Cross-Site Scripting (XSS). An attacker could inject malicious scripts through manipulated APIs (e.g., news sentiment) or configuration.
3. **Improper Error Handlers (`catch (e: any)`)**
   - **Files:** Numerous services, stores, and API endpoints (`src/services/dataRepairService.ts`, `src/services/newsService.ts`, `src/routes/api/tpsl/+server.ts`, etc.)
   - **Risk:** Bypasses strict type checking, potentially masking critical runtime errors and causing silent failures without proper fallbacks.
4. **Memory Leak in Cache Eviction (`.keys().next().value`)**
   - **Files:** `src/services/apiService.ts`, `src/routes/api/rss-fetch/+server.ts`, `src/routes/api/external/news/+server.ts`
   - **Risk:** When evicting caches, using `.keys().next().value` on reference-counted Maps will blindly delete the first item, potentially removing an actively used entry instead of safely evicting inactive items (by checking `.entries()` and reference counts).
5. **Raw API Error Exposures to the UI**
   - **File:** `src/services/tradeService.ts`
   - **Risk:** Extracts `e.rawMessage` which might contain full HTML proxy error pages (e.g., Cloudflare 502 pages). `toastService.error(e.rawMessage)` will render or print this payload.
6. **Optimistic UI Deletions during Timeouts**
   - **File:** `src/services/tradeService.ts`
   - **Risk:** On indeterminant network failures/timeouts when managing orders, `omsService.removeOrder(id)` is being invoked, permanently dropping the order from local state even if the exchange successfully executed it, causing accidental double orders.

## 🟡 WARNING (Performance issue, UX error, missing i18n)
1. **Unbounded Collections without Teardown (`.clear()`)**
   - **Files:** `src/services/bitunixWs.ts`, `src/services/marketWatcher.ts`
   - **Risk:** Timer collections, pending subscriptions, or `staggerTimeouts` are not robustly cleared on service teardown. Specifically, the `pendingSubscriptions` and `throttleMap` in WS instances can grow across soft-reconnects, leading to memory creep in long-lived tabs.
2. **Missing explicit HTTP status code checks (500s) gracefully degraded**
   - **Files:** Several files in `src/routes/api/`
   - **Risk:** Throwing generic 500s for known failure modes without localized `apiErrors.*` keys or actionable hints for the UI.
3. **Float Downcasting (Decimal -> toNumber)**
   - **Files:** `src/services/activeTechnicalsManager.svelte.ts`, `src/services/csvService.test.ts`
   - **Risk:** Calculates precise Decimals but then immediately downcasts via `.toNumber()` prior to rendering or internal array math, discarding the very precision the platform requires.

## 🔵 REFACTOR (Code smell, technical debt)
1. **Missing generic catch logic for Unknown Types**
   - **Files:** `apiService.ts` and others.
   - **Risk:** Need a uniform utility to safely map `unknown` catches into `Error` objects and `apiErrors.generic`.


## Execution Plan & Justifications
**Does this measurably improve stability or performance?** Yes. All proposed refactors are targeted at preventing silent data corruption, cross-site scripting attacks, out-of-memory crashes, and improper failure handling in a high-frequency trading context.

1. **Precision & Memory Safety Fixes**
   - Use string replacement in a `.cjs` script to replace all unsafe `JSON.parse` instances with `safeJsonParse`, importing the utility if necessary.
     - *Suggested Unit Test:* Test `safeJsonParse` with `{"id": 1234567890123456789}` vs `JSON.parse`. Assert `safeJsonParse` returns exact precision.
   - Use string replacement in a `.cjs` script to replace naive map cache evictions (`keys().next().value`) with bounded size evaluations and safe entry removal.
   - Update `activeTechnicalsManager.svelte.ts` to maintain Decimal types in calculations instead of `.toNumber()`.
2. **Security & Type Safety Fixes**
   - Use a node script to wrap raw `{@html}` tags in `DOMPurify.sanitize()` where missing.
     - *Suggested Unit Test:* Provide a mocked string with `<script>alert(1)</script>` into components and assert that the output string doesn't contain script tags but escaped data.
   - Use a node script to replace `catch (e: any)` with `catch (e: unknown)`.
3. **Trading Logic & API Error Fixes**
   - In `tradeService.ts`, parse `e.rawMessage`. If it includes `<html`, map it to `apiErrors.invalidResponse` instead of surfacing it to the UI.
     - *Suggested Unit Test:* Mock `tradeService` error fetching with an error response that is an HTML string, and assert `toastService.error` is called with `"apiErrors.invalidResponse"` instead of the HTML payload.
   - In `tradeService.ts`, when placing orders, if a timeout/indeterminant failure happens, DO NOT call `removeOrder`. Mark as unconfirmed.
     - *Suggested Unit Test:* Mock `apiService` to timeout on an order creation. Assert that `omsService.removeOrder` is NOT called, and `order._isUnconfirmed` is set to `true`.
4. **WebSocket Hardening**
   - Ensure all `.clear()` calls are properly executed during `destroy()` for Maps and Sets in `bitunixWs.ts` and `marketWatcher.ts`.
     - *Suggested Unit Test:* Create a `bitunixWs` instance, populate its internal maps (`syntheticSubs`, `pendingSubscriptions`, etc), call `.destroy()`, and assert their `.size` is exactly `0`.

