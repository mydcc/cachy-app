# Code Analysis & Risk Report: cachy-app

## 🔴 CRITICAL: Risk of financial loss, crash, or security vulnerability.

1.  **Memory Leaks in NewsService**:
    *   In `NewsService.ts`, the deduplication map `uniqueNews` checks if `item.url` is empty but the `generateNewsId` function generates an ID based on URL and Title. `newsItems` is limited to 100 before caching but the IDB query is potentially unlimited.
    *   Also in `NewsService.ts` the deduplication tracker `pendingSentimentFetches` is keyed by `newsHash`, which is `news[0].title`. If news titles are not unique across assets or timestamps, sentiments could be wrongly reused.

2.  **Resource Leaks in MarketWatcher (Zombie timeouts)**:
    *   In `MarketWatcher.ts`, `this.staggerTimeouts` track the staggered requests. During `performPollingCycle`, the timeout is removed from the set *inside* the callback. If `stopPolling` is called before the timeout triggers, `staggerTimeouts.clear()` is called, but the actual timeout callbacks are still executed if they were already queued. They check `!this.isPolling`, but the callback still runs and returns.
    *   `MarketWatcher.ts` zombie pruning assumes HTTP timeouts are 20 seconds. The API service uses 10 seconds. But `pruneZombieRequests()` only subtracts 1 from `inFlight`, assuming that the fetch is hung. However, the promise wrapper `finally` block in `pollSymbolChannel` also checks if the lock was already pruned. If so, it doesn't decrement again. This is good but relies on `prunedRequestIds`.

3.  **Floating Point Inaccuracies**:
    *   In `MarketWatcher.ts`, `fillGaps` uses `Math.floor(diff / intervalMs) - 1` with JavaScript numbers, representing timestamps. This is mostly safe since timestamps fit in JS `Number` exactly. However, for calculation it relies on `fillClose` which is a `Decimal`.
    *   In `TradeService.ts`, `position.amount.isZero()` and `position.amount.isNegative()` checks in `flashClosePosition`.

4.  **UI/UX: Type errors when rendering errors**:
    *   In `TradeService.ts`, `fetchTpSlOrders` catches errors from `signedRequest` and does `(e instanceof Error ? e.message : String(e))`. Later it checks `data.error` which is okay.

## 🟡 WARNING: Performance issue, UX error, missing i18n.

1.  **Missing i18n keys**:
    *   In `TradeService.ts`, `throw new Error("apiErrors.fetchFailed")` is used, which is handled correctly. However, the fallback `toastService.error(\`Flash Close Failed: ${msg}\`)` is hardcoded. It should use `$_` or an i18n key wrapper.
    *   In `TradeService.ts`, `new BitunixApiError(data.code || response.status || -1, data.msg || data.error || "Unknown API Error")` directly throws hardcoded "Unknown API Error".
    *   In `MarketWatcher.ts`, `logger.error` strings are hardcoded (acceptable for logs, but any user-facing surface should be checked).

2.  **Performance issues**:
    *   In `MarketWatcher.ts`, `this.requests.forEach` in `performPollingCycle` maps over all subscriptions on a tight loop (every 1 second via `runPollingLoop`). This could cause CPU load if the number of subscriptions is high.

## 🔵 REFACTOR: Code smell, technical debt.

1.  **`TradeService.ts` Error classes**:
    *   `TradeError` and `BitunixApiError` both extend `Error`. The `code` property on `BitunixApiError` is `number | string`, but it's used somewhat loosely.
