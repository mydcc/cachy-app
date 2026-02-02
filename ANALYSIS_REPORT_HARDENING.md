# Analysis Report: System Hardening

## Overview
This report details the findings of an in-depth code analysis of the `cachy-app` codebase, focusing on Data Integrity, Resource Management, UI/UX, and Security.

## Findings

### 🔴 CRITICAL
**Risk of financial loss, crash, or security vulnerability.**

1.  **Security: API Keys sent to Proxy Endpoint**
    *   **File:** `src/services/tradeService.ts`, `src/routes/api/sync/positions-pending/+server.ts`
    *   **Issue:** The client sends `apiKey` and `apiSecret` in the request body to `/api/sync/positions-pending`. While likely over HTTPS, this pattern acts as a "Backend-For-Frontend" (BFF) proxy. If the server logs request bodies on error (even partially), keys could be exposed. More importantly, this structure requires trust in the hosting environment.
    *   **Recommendation:** Ensure strict HTTPS. Validate that error logging (e.g., in `+server.ts`) *never* logs the request body. Ideally, keys should be stored server-side if possible, but for a "self-custody" app, this is an architectural trade-off that requires strict hygiene.

2.  **Data Integrity: Missing Freshness Check in `closePosition`**
    *   **File:** `src/services/tradeService.ts`
    *   **Issue:** `flashClosePosition` implements a "freshness check" (re-fetching positions if data is stale > 200ms). However, `closePosition` (the standard close) does *not*. It relies solely on the cached `omsService` state. If the cache is stale, the `qty` might be wrong, leading to partial closes or "reduce only" errors.
    *   **Recommendation:** Port the freshness check logic from `flashClosePosition` to `closePosition` or a shared helper.

3.  **Resource Management: Race Condition & Memory Leak in Polling**
    *   **File:** `src/services/marketWatcher.ts`
    *   **Issue:** In `pollSymbolChannel`, a race condition exists. `Promise.race` is used with a timeout. If the API call completes successfully *after* the timeout fires, the API promise continues running in the background (unhandled).
    *   **Recommendation:** Use `AbortController` to cancel the fetch request if the timeout wins. Ensure the timeout timer is cleared if the fetch wins.

4.  **Type Safety: Unsafe `Set<any>`**
    *   **File:** `src/services/marketWatcher.ts`
    *   **Issue:** `private staggerTimeouts = new Set<any>();` is used. This defeats type safety and could mask bugs where incorrect items are added/removed.
    *   **Recommendation:** Change to `Set<ReturnType<typeof setTimeout>>`.

### 🟡 WARNING
**Performance issue, UX error, potential bug.**

1.  **Performance: Blocking Main Thread on Flush**
    *   **File:** `src/stores/market.svelte.ts`
    *   **Issue:** `flushUpdates` processes all pending updates. If `pendingKlineUpdates` accumulates thousands of candles (e.g., after a network hiccup or high volatility), the sorting and deduplication logic in `applySymbolKlines` runs synchronously on the main thread, potentially causing a UI freeze.
    *   **Recommendation:** Use `requestIdleCallback` or chunk the processing to yield to the main thread.

2.  **Data Integrity: Unsafe Base64 Encoding**
    *   **File:** `src/services/newsService.ts`
    *   **Issue:** `generateNewsId` uses `btoa(encodeURIComponent(...))`. While `encodeURIComponent` handles some UTF-8, `btoa` is not robust for all Unicode strings and can throw "InvalidCharacterError".
    *   **Recommendation:** Use a robust base64 utility or `Buffer.from(...).toString('base64')` if in a Node environment (or a polyfill).

3.  **Data Integrity: Naive Symbol Matching**
    *   **File:** `src/services/newsService.ts`
    *   **Issue:** `matchesSymbol` checks `text.includes(keyword)`. This leads to false positives (e.g., "BET" matches "BETTER").
    *   **Recommendation:** Use regex with word boundaries `\b`.

4.  **UI/UX: Blocking `confirm()`**
    *   **File:** `src/components/shared/PositionsList.svelte`
    *   **Issue:** Uses browser-native `confirm()` which blocks the entire UI thread.
    *   **Recommendation:** Replace with a custom non-blocking Modal. (Low priority for "hardening", but good practice).

5.  **Accessibility: Missing `aria-label`**
    *   **File:** `src/components/shared/Button.svelte`
    *   **Issue:** Buttons might lack accessible labels if they only contain icons.
    *   **Recommendation:** Add a required or fallback `aria-label` prop.

### 🔵 REFACTOR
**Technical debt.**

1.  **Performance: Repeated Decimal Allocation**
    *   **File:** `src/stores/market.svelte.ts`
    *   **Issue:** `toDecimal` helper creates `new Decimal(val)` frequently.
    *   **Recommendation:** The existing optimization checks `currentVal.toString() === String(val)`, which is good, but `String(val)` also allocates.

## Next Steps
Proceed to Phase 2: Implementation Plan.
