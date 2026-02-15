# Status & Risk Report

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1.  **Loose Typing in Financial Service (`TradeService.ts` & `omsTypes.ts`)**:
    -   **Finding**: `TpSlOrder` interface uses `[key: string]: unknown` and `TradeError` uses `any` for details. API responses are cast to `TpSlOrder[]` without validation.
    -   **Risk**: High risk of runtime errors if the exchange API changes its response format. Malformed data could crash the UI or lead to incorrect trade decisions.
    -   **Location**: `src/services/tradeService.ts`, `src/services/omsTypes.ts`

2.  **Risky Serialization Logic (`TradeService.ts`)**:
    -   **Finding**: `serializePayload` uses "duck typing" (checking for `isZero` and `toFixed`) to identify `Decimal` objects.
    -   **Risk**: Regular objects with these methods could be incorrectly serialized as strings. Conversely, if a `Decimal` object is somehow stripped of its prototype, it might be serialized as `[object Object]`, causing API rejection or financial errors.
    -   **Location**: `src/services/tradeService.ts`

3.  **Flash Close "Naked Order" Risk (`TradeService.ts`)**:
    -   **Finding**: `flashClosePosition` attempts to cancel open orders (TP/SL) before closing. If cancellation fails, it logs an error but **proceeds** with the close.
    -   **Risk**: While proceeding ensures the position is closed (capital preservation), it leaves "naked" stop orders active. If the price later hits these levels, new unintended positions could be opened.
    -   **Location**: `src/services/tradeService.ts`

4.  **Zombie Request Race Conditions (`MarketWatcher.ts`)**:
    -   **Finding**: `pruneZombieRequests` removes the lock for a stuck request but does not **abort** the underlying Promise/Fetch.
    -   **Risk**: A "zombie" request could eventually resolve *after* a newer request has updated the state, overwriting fresh data with stale data.
    -   **Location**: `src/services/marketWatcher.ts`

5.  **Bitunix Signature Discrepancy**:
    -   **Finding**: `src/utils/server/bitunix.ts` generates signatures using concatenated query params (`key1val1key2val2`), while `docs/bitunix-api/README.md` implies standard sorting or doesn't explicitly specify this non-standard format.
    -   **Risk**: Potential authentication failures if the API enforces strict standards differently than implemented.
    -   **Location**: `src/utils/server/bitunix.ts`

## 🟡 WARNING (Performance issue, UX error, missing i18n)

1.  **Missing Internationalization (i18n)**:
    -   **Finding**: Hardcoded error messages in `TradeService.ts` (e.g., "Bitunix API Error ${code}") and `NewsService.ts` ("Failed to analyze sentiment").
    -   **Impact**: Non-English users see mixed language errors.
    -   **Location**: `src/services/tradeService.ts`, `src/services/newsService.ts`

2.  **Performance: Reactivity Overhead**:
    -   **Finding**: `MarketOverview.svelte` derives `currentPrice` from the entire `wsData` object.
    -   **Impact**: Frequent updates to *any* part of `wsData` (e.g., depth) could trigger re-evaluation of price logic, even if price hasn't changed. (Mitigated by memoization, but still a concern).
    -   **Location**: `src/components/shared/MarketOverview.svelte`

## 🔵 REFACTOR (Technical Debt)

1.  **Code Duplication (API Logic)**:
    -   **Finding**: `src/routes/api/tpsl/+server.ts` implements `fetchBitunixTpSl`, duplicating request signing logic found in `TradeService` and `apiService`.
    -   **Impact**: Maintenance burden; fixes to signing logic must be applied in multiple places.

2.  **Scattered Quota Tracking**:
    -   **Finding**: `apiQuotaTracker` usage is scattered across services.
    -   **Impact**: Hard to visualize or manage global rate limits.
