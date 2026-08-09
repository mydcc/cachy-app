# Code Analysis & Risk Report: cachy-app

This report presents an in-depth analysis of the `cachy-app` codebase, focusing on institutional-grade stability, data integrity, resource management, UI/UX, and security.

## Findings

### 🔴 CRITICAL

1.  **WebSocket Memory Leaks (Resource Management):**
    *   **Location:** `MarketWatcher` (and potentially other WebSocket services).
    *   **Issue:** The `MarketWatcher` iterates over `bitunixWs.pendingSubscriptions.keys()` without safely evicting inactive entries when providers are switched or connections drop. Using `.keys().next().value` or failing to clean up unreferenced subscriptions in `Map`s/`Set`s can cause unbounded memory growth over time, leading to browser crashes on long-running clients. Unbounded eviction logic such as blindly grabbing the first key risks corrupting the state of active subscriptions if they aren't explicitly checked (e.g. `val === 0`).
    *   **Impact:** Memory leak, potential state corruption, application crash.

2.  **Unbounded Arrays in Svelte Stores (Resource Management):**
    *   **Location:** `src/stores/market.svelte.ts` (`pending.push`, `history.push`, etc.), `src/stores/account.svelte.ts` (`this.openOrders.push`, `this.assets.push`).
    *   **Issue:** While `journal.svelte.ts` limits entries to 1000, `market.svelte.ts` and `account.svelte.ts` append data to arrays continuously without bounding (e.g., `this.positions.push`, `this.assets.push`). Over days of trading, these arrays will grow infinitely.
    *   **Impact:** Unbounded memory growth (Memory leak), performance degradation, and UI thread blocking during reactivity updates.

3.  **Missing Global WebSocket/Interval Cleanup (Resource Management):**
    *   **Location:** `src/services/marketWatcher.ts`.
    *   **Issue:** When `marketWatcher` connection drops or the provider is switched, it does not consistently and explicitly close the underlying WebSocket connection or clear recurring timers/intervals upon service teardown/disposal.
    *   **Impact:** Stale network connections and active intervals remaining active in the background, consuming bandwidth and battery, leading to silent memory leaks.

4.  **XSS Vulnerabilities via `{@html}` (Security):**
    *   **Location:** Multiple Svelte components (e.g., `SummaryResults.svelte`, `OrderHistoryList.svelte`, `MarketOverview.svelte`).
    *   **Issue:** The `{@html ...}` tag is used extensively for rendering. Any dynamic content injected via `{@html}` must be strictly wrapped in `DOMPurify.sanitize()` to prevent XSS. A scan reveals that `DOMPurify` is not used everywhere `{@html}` is present (though some modals like `DisclaimerModal.svelte` do correctly use `sanitizeHtml`).
    *   **Impact:** Potential Cross-Site Scripting (XSS) vulnerability.

5.  **Native Floating Point Inaccuracies in API Serialization (Data Integrity):**
    *   **Location:** `src/services/tradeService.ts`, API routes, and components.
    *   **Issue:** Decimal.js must be used strictly for all financial calculations, but there are areas where numbers might be processed directly from API payloads via native floats or downcast to floats before conversion. Native floats should never be used for prices or quantities.
    *   **Impact:** Precision loss leading to incorrect order sizes, liquidations, or margin miscalculations (risk of financial loss).

### 🟡 WARNING

1.  **Missing i18n Keys (UI/UX):**
    *   **Location:** Throughout the UI components.
    *   **Issue:** The system uses `$_('key')` for translations, but there are hardcoded strings and missing keys in some areas. A manual review or automated extraction step is needed to ensure all user-facing strings (e.g., error messages, new feature labels) are properly localized.
    *   **Impact:** Poor user experience for non-English users, fragmented localization.

2.  **Optimistic UI Rollbacks (Data Integrity):**
    *   **Location:** `src/services/tradeService.ts` or related stores handling order state.
    *   **Issue:** When an order placement times out or suffers an indeterminate backend API failure, the local optimistic state might be unconditionally removed. If the exchange actually executed the order, the user is now unaware of it, leading to accidental double-ordering. Orders should be marked as "unconfirmed" (e.g. `_isUnconfirmed = true`) instead of being deleted, for later reconciliation.
    *   **Impact:** Unintended duplicate trades, user confusion.

### 🔵 REFACTOR

1.  **Strict Type Safety with `safeJsonParse` (Data Integrity):**
    *   **Location:** `src/services/tradeService.ts`, API handlers.
    *   **Issue:** The `safeJsonParse` function returns `unknown`. Code often casts this directly or accesses properties without rigorously verifying that the parsed result is a non-null object (e.g., `const dataRecord = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {}`).
    *   **Impact:** Potential runtime errors if APIs return unexpected structures (e.g., plain strings or arrays instead of objects). Refactoring this measurably improves stability.

## Action Plan

### 1. Fix Resource Management & Memory Leaks (CRITICAL)
- **Bounded Eviction for Maps:** Update `MarketWatcher` to iterate via `.entries()` instead of `.keys().next().value` to safely evict only inactive entries (e.g., `val === 0`) and prevent corrupting active state.
- **Limit Store Array Growth:** Refactor `market.svelte.ts` and `account.svelte.ts` to implement bounded eviction strategies (e.g., size > limit), similar to `journal.svelte.ts`.
- **Interval/WebSocket Teardown:** Ensure all intervals (e.g., `setInterval`) are assigned to references and explicitly cleared using `clearInterval` upon service disposal. Ensure WebSockets are explicitly closed during provider switching.
- **Tests (Memory Leak):**
  - Add a unit test for `market.svelte.ts` that inserts 2000 elements and asserts the array size does not exceed the limit (e.g. `expect(store.array.length).toBeLessThanOrEqual(MAX_LIMIT)`).

### 2. Enforce Financial Type Safety (CRITICAL)
- **Decimal.js Strictness:** Audit `TradeService` and API handlers to ensure all price and quantity calculations explicitly use `Decimal.js`.
- **Remove Floats:** Prevent downcasting Decimals to native numbers (e.g. via `.toNumber()` or `parseFloat()`).
- **Tests (Financial Type Safety):**
  - Add a unit test asserting that API payloads containing extreme precision values are correctly mapped to Decimal types end-to-end without rounding or truncating.

### 3. Fortify Data Integrity & Optimistic UI (WARNING / REFACTOR)
- **Indeterminate State Reconciliation:** Refactor optimistic order creation in `TradeService`. Instead of removing the order on network timeout, flag it with `_isUnconfirmed = true` and keep it in the UI pending background polling verification.
- **Strict Parsing:** Refactor `unknown` API response parsing using `typeof data === 'object' && data !== null ? data as Record<string, unknown> : {}` to ensure safe property access.
- **Tests (Data Integrity):**
  - Add a unit test mocking an API timeout during order creation, asserting the local store retains the order with the `_isUnconfirmed` flag.

### 4. UI/UX & Security (WARNING / CRITICAL)
- **XSS Mitigation:** Enforce `DOMPurify.sanitize()` around all dynamic properties inside `{@html}` tags across Svelte components.
- **Missing i18n:** Scan components for hardcoded strings and replace them with `$_('key')` syntax, updating the base language file.
