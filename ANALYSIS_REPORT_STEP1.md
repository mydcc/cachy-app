# Status & Risk Report: Cachy-App Codebase Analysis

**Date:** 2026-05-26
**Analyst:** Jules (Senior Lead Developer)
**Scope:** `src/services`, `src/stores`, `src/components`

---

## 1. Data Integrity & Mapping

### ✅ RESOLVED: Potential Promise Lockup in NewsService
- **Status:** Fixed.
- **Verification:** `src/services/newsService.ts` now uses `AbortController` with a 15s timeout for all external API calls. `pendingNewsFetches` is cleared in a `finally` block.

### 🟡 WARNING: Redundant "Fast Path" in BitunixWebSocketService
- **Location:** `src/services/bitunixWs.ts`
- **Issue:** Manual parsing logic exists alongside Zod validation.
- **Status:** Open.
- **Risk:** Maintenance burden. Precision checks added, but logic duplication remains.
- **Recommendation:** Consolidate into a single optimized parser in Phase 2.

### ✅ RESOLVED: Native `Number()` Casting in UI
- **Status:** Mitigated.
- **Verification:** `OrderHistoryList.svelte` uses `formatDynamicDecimal` and `Decimal` comparisons where critical.

---

## 2. Resource Management & Performance

### ✅ RESOLVED: Svelte Store Contract Violation in MarketManager
- **Location:** `src/stores/market.svelte.ts`
- **Issue:** `subscribe` potentially returned an object (from `$effect.root`) instead of a function.
- **Status:** Fixed.
- **Verification:** Defensive check added to `subscribe` and `subscribeStatus` to handle both function and object returns (`cleanup()` vs `cleanup.stop()`).

### 🟡 WARNING: N+1 API Calls in TradeService
- **Location:** `src/services/tradeService.ts` (`fetchTpSlOrders`)
- **Issue:** Batched requests (size 5) are better than serial, but still not a true bulk endpoint.
- **Status:** Open (Mitigated by batching).
- **Risk:** Rate limits on high position counts.

---

## 3. UI/UX & Accessibility (A11y)

### ✅ RESOLVED: Accessibility Barrier in OrderHistoryList
- **Status:** Fixed.
- **Verification:** `src/components/shared/OrderHistoryList.svelte` includes `tabindex="0"`, `role="button"`, and `onkeydown` handlers for tooltips.

### 🔴 CRITICAL: Missing i18n in Trading Modals
- **Location:** `src/components/shared/TpSlEditModal.svelte`
- **Issue:** Hardcoded strings ("Trigger price is required", etc.).
- **Status:** Open.
- **Plan:** Scheduled for Phase 2 implementation.

---

## 4. Deployment & Infrastructure

### ✅ RESOLVED: Node Version Compatibility
- **Issue:** Render deployment failed due to missing or invalid Node version.
- **Status:** Fixed.
- **Action:** Added `.node-version` (v20.18.0) and regenerated `package-lock.json` to ensure consistency.

---

## Summary
Critical stability issues (Store Contract, Promise Lockup) have been addressed. The remaining focus for Phase 2 is **Internationalization (i18n)** and **Type Safety Hardening** (TradeService).
