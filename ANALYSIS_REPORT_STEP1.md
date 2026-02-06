# Status & Risk Report: Cachy-App Codebase Analysis

**Date:** 2026-05-26
**Analyst:** Jules (Senior Lead Developer)
**Scope:** `src/services`, `src/stores`, `src/components` (Data Integrity, Performance, UI/UX, Security)

---

## 1. Data Integrity & Mapping

### 🔴 CRITICAL: Potential Promise Lockup in NewsService
- **Location:** `src/services/newsService.ts`
- **Issue:** The `fetch` calls for external APIs (CryptoPanic, NewsAPI) lack a signal/timeout. If the external server hangs indefinitely (socket open but no data), the `pendingNewsFetches` Map entry will never be deleted.
- **Consequence:** Future requests for that symbol will await the hung promise forever, effectively breaking the news feature for that symbol until a page reload.
- **Fix:** Implement `AbortController` with a strict timeout (e.g., 10s) for all external fetches.

### 🟡 WARNING: Redundant "Fast Path" in BitunixWebSocketService
- **Location:** `src/services/bitunixWs.ts`
- **Issue:** The service parses JSON, then manually extracts/casts fields ("Fast Path") before *also* running Zod validation in the "Slow Path" (fallback).
- **Risk:** High maintenance burden. Logic is duplicated. If the API changes, developers might update the Zod schema but forget the Fast Path, leading to silent bugs or data inconsistencies.
- **Performance Note:** While intended for speed, the manual parsing of every field (checking `typeof` and casting) adds overhead that might negate the Zod avoidance benefit for moderate loads.

### 🟡 WARNING: Native `Number()` Casting in UI
- **Location:** `src/components/shared/OrderHistoryList.svelte` (and likely others)
- **Issue:** `Number(order.avgPrice)` is used directly.
- **Risk:** While `safeJsonParse` handles the incoming data, casting to native Number in the UI for logic checks (e.g., `> 0`) can introduce micro-precision errors if the Decimal was preserved as a string.
- **Fix:** Use `new Decimal(val).gt(0)` or `val.toNumber()` (if safe) consistently.

---

## 2. Resource Management & Performance

### 🔴 CRITICAL: Svelte Store Contract Violation in MarketManager
- **Location:** `src/stores/market.svelte.ts`
- **Issue:** The `subscribe(fn)` method returns `$effect.root(...)`, which is an object `{ stop: () => void }`.
- **Standard:** Svelte stores (and Svelte 5 interoperability) expect `subscribe` to return a `Unsubscriber` function (`() => void`).
- **Consequence:** If any legacy component or standard Svelte utility uses `$marketState`, it will crash when attempting to call the returned value as a function during cleanup.

### 🟡 WARNING: N+1 API Calls in TradeService
- **Location:** `src/services/tradeService.ts` (`fetchTpSlOrders`)
- **Issue:** The method iterates through active symbols and fires a `fetch` request for every batch of 5.
- **Risk:** For a user with positions in 20 symbols, this triggers 4 simultaneous HTTP requests. This might trigger strict rate limiters (WAF) or degrade client performance.
- **Fix:** Refactor to a single bulk endpoint if available, or strictly serialize the batches with delays.

### 🔵 REFACTOR: MarketWatcher Polling Loop
- **Location:** `src/services/marketWatcher.ts`
- **Observation:** `performPollingCycle` runs every second and iterates all requests.
- **Status:** Acceptable for current scale, but should be monitored if the number of watched symbols grows > 100.

---

## 3. UI/UX & Accessibility (A11y)

### 🔴 CRITICAL: Accessibility Barrier in OrderHistoryList
- **Location:** `src/components/shared/OrderHistoryList.svelte`
- **Issue:** Tooltips are triggered via `onmouseenter` on a `div` without `tabindex` or `onfocus`.
- **Consequence:** Keyboard-only users (and screen readers) cannot access order details/tooltips.
- **Fix:** Add `tabindex="0"`, `role="button"` (or use a `<button>`), and handle keyboard events.

### 🟡 WARNING: Inconsistent Error Handling / I18n
- **Location:** General
- **Issue:** Some error messages are hardcoded strings, others are `apiErrors.*` keys.
- **Fix:** Audit all `catch` blocks in Services to ensure they throw standardized `Error` objects with translation keys, not raw English strings.

---

## 4. Security & Validation

### ✅ PASS: Input Sanitization
- `safeJsonParse` is implemented and used correctly in `BitunixWs`.
- `TradeService` serializes payloads to string to prevent precision loss.

### ✅ PASS: Defensive Coding
- `MarketWatcher` implements "Zombie Request Pruning".
- `BitunixWs` has a "Watchdog" timer to kill stale connections.

---

## Summary of Priorities

1.  **Fix MarketManager Store Contract** (Crash Risk)
2.  **Add Timeouts to NewsService** (Hang Risk)
3.  **Fix A11y in OrderHistoryList** (Compliance/UX)
4.  **Refactor BitunixWs Fast Path** (Maintainability)
