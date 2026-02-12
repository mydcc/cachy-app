# Status & Risk Report

**Date:** 2026-10-24
**Version:** 1.0.0
**Author:** Senior Lead Developer (Jules)

## Executive Summary

The codebase generally exhibits a high level of defensive programming (e.g., `safeJsonParse` for large integers, `Decimal` usage for financial math). However, critical vulnerabilities exist in the trade reconciliation logic ("Zombie Positions") and inconsistent usage of DOM sanitization.

---

## 🔴 CRITICAL (High Risk)

### 1. Risk of "Zombie Positions" (Data Integrity)
*   **Location:** `src/services/tradeService.ts` (`fetchOpenPositionsFromApi`)
*   **Issue:** The method iterates through API results and uses `PositionRawSchema.safeParse`. If an item fails validation (e.g., API schema drift, missing optional field), it is **silently skipped** (logged as warning).
*   **Impact:** A user might actually have an open position on the exchange, but the UI filters it out due to a schema mismatch. The user sees "No Positions" and may open conflicting trades, leading to liquidation.
*   **Recommendation:** If a position fails schema validation, it must **NOT** be hidden. It should be displayed as a "Malformed Position" (Warning State) or the entire sync should fail-safe to prevent false confidence.

### 2. "Two Generals" Logic in Flash Close
*   **Location:** `src/services/tradeService.ts` (`flashClosePosition`)
*   **Issue:** The "Optimistic Order" logic attempts to handle network failures by keeping the order visible. However, if the `cancelAllOrders` safety check fails, the close is aborted.
*   **Impact:** Complex failure modes can leave the UI out of sync with the engine.
*   **Recommendation:** Enhance the "Recovery Sync" to be more aggressive (e.g., polling every 1s for 10s) if a Flash Close enters an indeterminate state.

---

## 🟡 WARNING (Medium Risk / UX)

### 1. Inconsistent DOM Sanitization (XSS Risk)
*   **Location:** `src/components/shared/MarketOverview.svelte` (and others)
*   **Issue:** The component uses `{@html icons.refresh}` directly. While `icons` constant is currently trusted, this bypasses the `DOMPurify` protection centralized in `src/components/shared/Icon.svelte`.
*   **Impact:** Future refactors or dynamic icon loading could introduce XSS vectors.
*   **Recommendation:** Strictly enforce `<Icon data={...} />` usage which handles `DOMPurify`.

### 2. Potential Main Thread Freeze in History Backfill
*   **Location:** `src/services/marketWatcher.ts` (`fillGaps`)
*   **Issue:** The loop runs up to 5000 iterations based on `intervalMs`. If `intervalMs` is incorrectly calculated (e.g., 0 or negative) or data is corrupt, this could freeze the UI.
*   **Recommendation:** Add a hard guard `if (intervalMs < 1000) intervalMs = 1000;` and a maximum execution time check (e.g., 5ms budget).

### 3. Raw Error Messages Leaking to UI (I18n)
*   **Location:** `src/components/inputs/PortfolioInputs.svelte`
*   **Issue:** `uiState.showError(e.message || ...)` often displays raw English API errors to the user.
*   **Recommendation:** Ensure all error catch blocks map known errors to translation keys (using `mapApiErrorToLabel`) before displaying.

### 4. WebSocket "Fast Path" Complexity
*   **Location:** `src/services/bitunixWs.ts`
*   **Issue:** The "Fast Path" manually parses/casts data to optimize performance, duplicating some Zod logic. This increases the maintenance burden and risk of logic drift between the fast path and the standard validator.
*   **Recommendation:** Standardize on one high-performance validation path or add rigorous regression tests ensuring Fast Path matches Zod behavior 1:1.

---

## 🔵 REFACTOR (Technical Debt)

### 1. Complex Merge Logic in Market Store
*   **Location:** `src/stores/market.svelte.ts` (`applySymbolKlines`)
*   **Issue:** The "Slow Path" merge algorithm is complex and handles multiple edge cases (overlap, disorder).
*   **Recommendation:** Unit test this specific method with extensive fuzzing (randomized inputs) to ensure it never duplicates or drops candles.

### 2. Manual Subscription Pattern in Stores
*   **Location:** `src/stores/market.svelte.ts` (`subscribe`)
*   **Issue:** The manual implementation of the Svelte store contract using `$effect.root` and `setTimeout` is brittle and non-standard for Svelte 5.
*   **Recommendation:** If backward compatibility is needed, use `svelte/store`'s `readable` or `writable` wrappers around the rune state.

---

## Next Steps (Action Plan)

1.  **Hardening Trade Service:** Implement "Fallback Schema" for positions to catch malformed data instead of hiding it.
2.  **Sanitization Audit:** Replace all `{@html}` icon injections with `<Icon />`.
3.  **I18n Audit:** Scan for `uiState.showError` and ensure mapping is applied.
