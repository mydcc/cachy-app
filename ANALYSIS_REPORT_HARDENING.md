# Status & Risk Report: Cachy-App Hardening

**Date:** 2026-05-26
**Auditor:** Jules (Senior Lead Developer)
**Scope:** `src/services`, `src/components`, `src/stores`

## 🔴 CRITICAL (Immediate Action Required)

1.  **Recursive RateLimiter (`src/services/apiService.ts`)**
    *   **Risk:** Memory/Stack Overflow. The `waitForToken` method uses recursion (`return this.waitForToken()`). Under high API load (e.g., initial sync of 50+ tickers), this creates a deep promise chain, potentially causing memory pressure or stack errors.
    *   **Fix:** Refactor to an iterative `while` loop using `await new Promise(...)`.

2.  **Leaky Business Logic in UI (`src/components/shared/TpSlList.svelte`)**
    *   **Risk:** Data Integrity & Maintenance. The component contains raw API calls (`fetch("/api/tpsl")`) and provider-specific logic (`if (provider === "bitunix")`). It bypasses the centralized `apiService` safety wrappers (like `safeJsonParse` and error mapping), risking unhandled errors and precision loss.
    *   **Fix:** Move this logic into `tradeService.ts` or `omsService.ts`.

3.  **Zombie Request Locks (`src/services/marketWatcher.ts`)**
    *   **Risk:** Data Freeze. The manual lock management (`pendingRequests`) is complex. If an unhandled exception occurs inside the promise chain (before the `finally` block or if the promise hangs), the `lockKey` is never released, permanently freezing updates for that symbol.
    *   **Fix:** Implement a "Lock Timeout" or simpler Queue pattern.

## 🟡 WARNING (High Priority)

1.  **Missing i18n (Hardcoded Strings)**
    *   **Risk:** UX/Scalability. Numerous components contain hardcoded English strings, breaking the multi-language experience.
    *   **Locations:**
        *   `src/components/settings/tabs/ConnectionsTab.svelte` ("API Key")
        *   `src/components/settings/tabs/VisualsTab.svelte` (Labels like "Layout", "Color Mode")
        *   `src/components/shared/TechnicalsPanel.svelte` (Indicator names)
        *   `src/components/shared/TpSlList.svelte` ("Pending", "History")
    *   **Fix:** Extract to `en.json` and use `$_()`.

2.  **Fast Path Precision Dependency (`src/services/bitunixWs.ts`)**
    *   **Risk:** Financial Precision. The WebSocket "Fast Path" relies on `safeJsonParse` having already handled 19-digit integers. If the parser changes or a raw message slips through, the code `typeof val === 'number'` is a fallback that executes *after* potential precision loss.
    *   **Fix:** Enforce strict checks earlier or ensure `safeJsonParse` is the only entry point (verified, but needs regression test).

3.  **Unsafe JSON Parsing in News (`src/services/newsService.ts`)**
    *   **Risk:** Crash/Precision. Uses `await res.json()` instead of `safeJsonParse`. While news data usually lacks large integers, it's inconsistent with the "Institutional Grade" requirement.
    *   **Fix:** Switch to `apiService.safeJson(res)`.

## 🔵 REFACTOR (Technical Debt)

1.  **Magic Number Logic (`src/components/inputs/TradeSetupInputs.svelte`)**
    *   **Observation:** The `priceStep` calculation is hardcoded logic inside the component.
    *   **Recommendation:** Move to `src/utils/currencyUtils.ts` or `marketState`.

2.  **MarketWatcher Complexity**
    *   **Observation:** The hybrid polling/WS logic with staggering is extremely complex and hard to test.
