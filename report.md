# Status & Risk Report (Cachy-App)

## Overview

This report details the systematic maintenance and hardening findings for the cachy-app platform, an institutional-grade crypto trading software. The analysis prioritizes data integrity, resource management, UX/A11y, and security/validation.

---

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1. **TradeService Type Safety (Data Integrity) - `src/services/tradeService.ts`**
   - **Finding:** The `fetchTpSlOrders` API response is cast directly to generic interfaces without validation: `const list = (Array.isArray(data) ? data : data.rows || []) as TpSlOrder[];`.
   - **Risk:** Null or malformed order fields (e.g., missing `orderId` or `planType`) risk corrupting trading logic state and leading to failed subsequent actions (like cancellation or modification), risking user funds.
   - **Recommendation:** Implement rigorous validation utilizing `Zod` (e.g., creating a `TpSlOrderSchema` and applying safe parsing) prior to assuming types.
   - **Suggested Test Case:** A test mocking `fetchTpSlOrders` with malformed API objects (e.g., missing `orderId` or invalid string amounts) to verify it safely skips or properly throws an actionable error instead of returning broken order objects.

2. **Unbounded RateLimiter Maps (Resource Management/Security) - `src/services/apiService.ts`**
   - **Finding:** Rate limiters are maintained in an unbounded `Map<string, RateLimiter>` (`private rateLimiters = new Map<string, RateLimiter>();`). The map is never explicitly cleared.
   - **Risk:** High-frequency use or continuous symbol changes will result in unbounded memory accumulation (a memory leak), eventually degrading performance or causing OOM crashes, a vector for DoS.
   - **Recommendation:** Enforce a bounded Map size or TTL-based eviction on `rateLimiters` and similar stores.

---

## 🟡 WARNING (Performance issue, UX error, missing i18n)

3. **Incomplete Error Message Translations (UX/i18n) - `src/services/tradeService.ts`**
   - **Finding:** Fallback API and generic error messages include hardcoded strings such as `"Unknown API Error"` or generic ones like `"tradeErrors.positionNotFound"` that might bypass actual `i18n` translation objects if the keys don't strictly align with translation schema keys.
   - **Risk:** Broken UI state when an international user experiences connectivity or trade rejection errors.
   - **Recommendation:** Replace literal string fallbacks with centralized constants (e.g. `TRADE_ERRORS.FETCH_FAILED`) that securely map to existing `i18n` schema types.

4. **Hot Path Unnecessary Re-allocations (Performance) - `src/stores/market.svelte.ts`**
   - **Finding:** The `updateSymbol` method merges pending state rapidly, using spread operators `this.pendingUpdates.set(symbol, { ...existing, ...partial });` for every tick.
   - **Risk:** In active markets with dozens of symbols, this creates massive Garbage Collection pressure. The loop triggers >10 times/second per symbol.
   - **Recommendation:** Update properties directly (mutability) on existing references where possible within `pendingUpdates`, minimizing new allocations before flush.

5. **Potential WebSocket Teardown Leaks (Resource Management) - `src/services/bitgetWs.ts` / `src/services/bitunixWs.ts`**
   - **Finding:** WebSocket services rely heavily on global events (like `window.addEventListener('online', ...)`) and instantiate interval timers (`setInterval`).
   - **Risk:** While singletons generally persist, if instances are refreshed or destroyed (especially during HMR or explicit cleanup), failing to accurately teardown listeners and specific timers can leave "zombie" connections that continuously attempt reconnects, stalling performance.
   - **Recommendation:** Ensure every service managing sockets strictly implements a `destroy` method that wipes all listeners/intervals and is registered with HMR `dispose` callbacks.

---

## 🔵 REFACTOR (Code smell, technical debt)

6. **Precision Conversion Workflows - Global**
   - **Finding:** While `Decimal.js` is utilized pervasively, some utility pathways in the market store (`updateKline` -> `updateSymbolKlines`) pass raw numeric values into generic arrays before later validation.
   - **Risk:** It does not immediately pose a stability issue given the architecture, but it slightly misaligns with the zero-trust floating-point methodology required for high-grade finance systems.
   - **Recommendation (Postpone unless touching):** Refactor the entire ingestion pipeline to validate and cast numeric variables to `Decimal` boundaries at the exact moment of deserialization from the WebSocket stream, removing arbitrary floating points entirely from Svelte state transit.
