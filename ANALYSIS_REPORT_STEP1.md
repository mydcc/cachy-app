# Status & Risk Report: Cachy-App Hardening (Step 1)

**Date:** 2026-05-26
**Auditor:** Jules (Senior Lead Developer)
**Scope:** `src/services`, `src/components`, `src/utils`

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1.  **Performance & Rate Limit Risk in `TradeService` (N+1 Problem)**
    *   **Location:** `src/services/tradeService.ts` (lines 350-380, `fetchTpSlOrders`)
    *   **Finding:** The method iterates through *all* active symbols (from open positions) and executes a separate HTTP POST to `/api/tpsl` for each, inside a batched `Promise.all`.
    *   **Risk:** If a user has 20+ positions, this triggers 20+ concurrent (or near-concurrent) API calls. This drastically increases the risk of:
        *   Hitting the 5 req/s rate limit (defined in `apiService`).
        *   Self-imposed DDoS causing UI freeze or network timeout.
        *   Partial failure where some orders load and others don't, leading to a misleading UI state.
    *   **Recommendation:** Implement a bulk fetch endpoint (`/api/tpsl/all`) or refactor the backend to accept an array of symbols.

2.  **WebSocket "Fast Path" Precision Dependency**
    *   **Location:** `src/services/bitunixWs.ts` (lines 352-446)
    *   **Finding:** The WebSocket message handler employs a "Fast Path" optimization that bypasses full Zod validation. It relies on `typeof val === 'number'` checks. While `safeJsonParse` is used upstream, any failure in `safeJsonParse`'s regex (e.g., unexpected formatting from the exchange) would allow a large integer to pass as a native `number`, causing immediate precision loss before the check `typeof val === 'number'` executes.
    *   **Risk:** Financial data corruption (e.g., Order IDs or very small prices) if the upstream parser misses an edge case.
    *   **Recommendation:** Enforce strict `string` type guards even in the Fast Path, or explicitly check `if (val > MAX_SAFE_INTEGER)` as a fail-safe.

## 🟡 WARNING (Performance, UX, i18n)

1.  **Missing i18n (Hardcoded Strings)**
    *   **Location:** `src/components/shared/TpSlList.svelte`
    *   **Finding:** Logic-based strings "TP", "SL", and "Plan" are hardcoded in `getTypeLabel`.
    *   **Location:** `src/components/shared/ChartPatternsView.svelte`
    *   **Finding:** Fallback text "No description available." and category filtering logic ("All", "Favorites") relies on English strings.
    *   **Risk:** Broken UX for non-English users.

2.  **Hardcoded Error Logic in UI**
    *   **Location:** `src/components/shared/TpSlList.svelte`
    *   **Finding:** The component contains specific error mapping logic (`e.message.startsWith("dashboard.alerts")`).
    *   **Risk:** Tight coupling between the UI and backend error string formats. If the backend changes error codes, the UI will display generic fallback messages.

## 🔵 REFACTOR (Technical Debt)

1.  **MarketWatcher Polling Complexity**
    *   **Location:** `src/services/marketWatcher.ts`
    *   **Finding:** The `performPollingCycle` method uses randomized staggered timeouts (`setTimeout` + `Math.random`) to distribute load. While currently functional and protected against zombies, this logic is brittle and hard to unit test deterministically.
    *   **Recommendation:** Move to a `Scheduler` class or use a deterministic queue system in the future (Low priority as it is currently working).

## ✅ CLEARED ITEMS (Previously suspected, now verified safe)

*   **Recursive RateLimiter:** `src/services/apiService.ts` uses an iterative `while` loop for `waitForToken`, eliminating stack overflow risk.
*   **Zombie Request Locks:** `src/services/marketWatcher.ts` implements `pruneZombieRequests()` to auto-release locks after 20s.
*   **JSON Precision:** `src/utils/safeJson.ts` correctly implements regex-based number stringification for integers >= 14 digits.
