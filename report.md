# Code Analysis & Hardening Report

## Step 1: In-depth Analysis (Status Quo & Risk Report)

### 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1. **Floating Point Inaccuracies in Prices & Sizes**
   - *Area:* Data integrity & mapping
   - *Finding:* Native `parseFloat()` is heavily utilized for sensitive financial calculations instead of `Decimal.js`. Examples include `TradeService.ts`, `apiService.ts`, `MarketOverview.svelte`, `TradeSetupInputs.svelte`, `PortfolioInputs.svelte`, `csvService.ts`, and `fastConversion.ts`. This risks severe precision losses when constructing payloads for the exchange APIs.

2. **Cross-Site Scripting (XSS) via Unsanitized `{@html}` tags**
   - *Area:* Security & validation
   - *Finding:* Multiple `{@html}` blocks dynamically render content without `DOMPurify.sanitize()`. For example, `src/routes/[[lang]]/(seo)/+layout.svelte`, `src/routes/+page.svelte`, and `src/components/shared/DisclaimerModal.svelte` may inject unsafe variables straight into the DOM.

3. **Inadequate Optimistic Order Rollbacks**
   - *Area:* Data integrity & mapping
   - *Finding:* In `TradeService.ts` (e.g., during FlashClose), API failures result in attempting to update order states locally. A timeout or 500 error from the API leaves indeterminate states. Rollbacks shouldn't just unconditionally revert states, as it might lead to duplicate positions if the exchange executed it but the network timed out. It should explicitly mark them as `_isUnconfirmed` for reconciliation.

4. **Missing Validation on Negative/Structurally Invalid Sizes**
   - *Area:* Security & validation
   - *Finding:* `inputEnhancements.ts` only checks `isNaN(parseFloat(valStr))` without leveraging strict structural limits (Zod/Decimal) to ensure users cannot attempt to send negative or invalid amounts to the exchange.

### 🟡 WARNING (Performance issue, UX error, missing i18n)

1. **Unbounded Memory Growth and Eviction Vulnerabilities (Maps/Sets)**
   - *Area:* Resource Management & Performance
   - *Finding:* `MarketWatcher.ts` caches requests and manages references, while `apiService.ts`, `rss-fetch/+server.ts`, and `external/news/+server.ts` blindly use `.keys().next().value` for cache eviction. When evicting from a reference-counted Map, removing the first key instead of ensuring its reference count is strictly `0` risks corrupting active application state.

2. **Raw HTML Error Messages Exposed to UI**
   - *Area:* UI/UX
   - *Finding:* `TradeService.ts` extracts `rawMessage` from `BitunixApiError`. Proxy/Gateway 502/504 errors usually return HTML error pages, which might be thrown as `rawMessage` directly into UI toast notifications (potentially looking broken and exposing internal proxies). These need mapping to safe generic localized error keys like `apiErrors.invalidResponse`.

3. **Missing Translations (Hardcoded Strings)**
   - *Area:* UI/UX
   - *Finding:* Occasional hardcoded strings in components. These components should strictly use the `$_('key')` i18n directive.

4. **Dangling Timers (WebSocket Leaks)**
   - *Area:* Resource Management & Performance
   - *Finding:* `MarketWatcher.ts` and UI elements instantiate `setInterval` blocks (like countdowns and telemetry flushes in `market.svelte.ts`) that must be consistently tracked and cleared via `clearInterval` during teardown to prevent zombie loops continuing in the background upon navigation.

### 🔵 REFACTOR (Code smell, technical debt)

1. **Expensive Inline UI Renders (Hot Paths)**
   - *Area:* Resource Management & Performance
   - *Finding:* `MarketDashboardModal.svelte` uses complex `reduce()` operations inside templated loops on every tick.
   - *Justification:* Moving these to memoized `$derived` block derivations measurably improves main thread stability, ensuring UI doesn't stutter under heavy WebSocket traffic >10x per second.

---

## Step 2: Action Plan (Implementation Phase)

### 1. Financial Data Integrity (Decimal.js Migration)
- **Action:** Replace all `parseFloat()` usages for prices and amounts in `TradeService.ts`, `MarketWatcher.ts`, `csvService.ts`, and `fastConversion.ts` with `Decimal.js` calculations to ensure exact precision.
- **Specific Test Case (CRITICAL):**
  ```typescript
  it('prevents precision loss in TradeService fast conversions', () => {
     const input = "0.0000000000000001";
     const result = toNumFast(input); // Mock function to be updated
     expect(result.toString()).toEqual("0.0000000000000001");
     // Fails with parseFloat as it may yield scientific notation or lose precision.
  });
  ```

### 2. Hardening Optimistic Order State Rollbacks
- **Action:** Refactor `TradeService.ts` error handlers. If an indeterminate failure occurs (like a network timeout), retain the optimistic order locally but flag it explicitly as `_isUnconfirmed = true` so the reconciliation service can later verify it against the exchange.
- **Specific Test Case (CRITICAL):**
  ```typescript
  it('flags optimistic orders as unconfirmed on network timeout', async () => {
     // Mock omsService & TradeService
     // Emit timeout error on submit
     // Assert order is not removed, but marked _isUnconfirmed = true
  });
  ```

### 3. XSS Mitigation & Error Message Sanitization
- **Action:** Ensure `DOMPurify.sanitize()` wraps all dynamic `{@html}` output blocks (e.g., `src/routes/[[lang]]/(seo)/+layout.svelte`, `jsonLdTag`).
- **Action:** In `TradeService.ts`, when catching errors, check if `rawMessage.toLowerCase().includes('<html')`. If true, override the message with a safe generic key (e.g., `apiErrors.invalidResponse`).

### 4. Bounded Cache Eviction Logic
- **Action:** Fix `apiService.ts`, `rss-fetch`, and `news` API to iterate via `.entries()` instead of blindly using `.keys().next().value`. Safely evict only inactive/stale entries (e.g., `val === 0` in reference counts) to prevent active state corruption.
- **Justification:** Measurably improves stability by preventing `OOM` (Out of Memory) crashes on heavy usage while preserving currently active component state.

### 5. Timers and WebSocket Cleanup
- **Action:** Double-check component `onDestroy` lifecycle hooks and service `.destroy()` methods to verify `clearInterval` is systematically called for any `setInterval` handles, especially in `MarketWatcher.ts` and `stores/market.svelte.ts`.
