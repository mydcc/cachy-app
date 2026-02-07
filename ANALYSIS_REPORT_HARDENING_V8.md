# Analysis Report: Hardening & Optimization Phase

## 🔴 CRITICAL

### 1. Zombie Request Management Logic Error (`src/services/marketWatcher.ts`)
*   **Issue**: `pruneZombieRequests` decrements `inFlight` counter when it detects a "zombie" request (stuck > 20s). However, if that request eventually completes (or fails) later, the `finally` block in `pollSymbolChannel` decrements `inFlight` *again*.
*   **Risk**: `inFlight` can drop below zero (clamped to 0) or be effectively lower than the actual number of active network connections. This defeats the purpose of the concurrency limiter, potentially leading to connection exhaustion or rate limit bans.
*   **Fix**: Introduce a `zombie` flag or set logic to ensure a request is only counted once for decrementing.

### 2. Unsafe Flash Close (`src/services/tradeService.ts`)
*   **Issue**: `flashClosePosition` attempts to `cancelAllOrders` (TP/SL) before closing a position. If this cancellation fails (e.g., network glitch), it logs an error but proceeds to close the position.
*   **Risk**: This creates a "Naked Stop Loss" scenario where the position is closed, but a Stop Loss order remains active. If the price hits the SL level later, it will trigger a *new* unintended position (short/long), causing financial loss.
*   **Fix**: The operation should either be atomic (if supported) or the user should be explicitly warned/prompted if cancellation fails. At minimum, the system should retry cancellation or fail the close operation safely (depending on "Panic" semantics).

### 3. N+1 Performance Issue (`src/services/tradeService.ts`)
*   **Issue**: `fetchTpSlOrders` iterates through *all* active positions and triggers a separate HTTP POST request for each symbol to fetch TP/SL orders.
*   **Risk**: For a user with 10+ positions, this fires 10+ concurrent requests, immediately hitting the `RequestManager` concurrency limit (8) and potentially the exchange's rate limit (5 req/s for Bitunix). This blocks other critical requests (like price updates).
*   **Fix**: Refactor to use a bulk endpoint if available, or throttle/batch these requests more aggressively. If the API supports fetching all TP/SL without a symbol filter, that must be used.

### 4. Data Integrity & Pruning Logic (`src/services/newsService.ts`)
*   **Issue**: `pruneOldCaches` calls `dbService.getAll("news", 50)`. IDB `getAll` with a count returns the *first* N items by key (alphabetical by ID). It then sorts and prunes *within that subset*.
*   **Risk**: As the cache grows (different symbols visited), the "first 50" might be `ADA`, `BTC`... while `XRP`, `ZEC` accumulate indefinitely and never get pruned because they are never returned in the "first 50" batch. This leads to unbounded storage growth.
*   **Fix**: Fetch `getAllKeys` (lightweight), or rely on a proper index for timestamp-based retrieval.

## 🟡 WARNING

### 1. UI/UX & Accessibility (`src/lib/windows/implementations/SymbolPickerView.svelte`)
*   **Issue**:
    *   Missing `aria-label` on the "Favorite" (Star) button.
    *   Hardcoded strings found: `"Pairs"`, `"Vol:"`, `"All"`, `"1M+"`, `"Majors Only"`, `"AZ"`, `"%↑"`.
*   **Risk**: Poor accessibility for screen readers; difficult to localize/translate.

### 2. Concurrency Complexity (`src/services/marketWatcher.ts`)
*   **Issue**: The `ensureHistory` method contains a complex nested loop structure for batching and concurrency that is difficult to read and verify.
*   **Risk**: Potential bugs in historical data backfilling (gaps or duplicates).

## 🔵 REFACTOR

### 1. Code Duplication
*   **Issue**: `tfToMs` is defined locally in `marketWatcher.ts`. It should be a shared utility in `src/utils/timeUtils.ts` (or similar).

### 2. ID Generation
*   **Issue**: `NewsService` uses `CryptoJS` for simple ID generation. This adds unnecessary bundle weight if `crypto.subtle` or a simple hash function could suffice. (Low priority).
