# Action Plan: Phase 2 (Hardening)

This plan details the implementation steps to address the risks identified in Phase 1.

## 1. Resource & Memory Hardening (Stability)

### 1.1 Unbounded Store Arrays
*   **Target:** `src/stores/trade.svelte.ts`
*   **Issue:** `tags` and `targets` can grow indefinitely via imports or manipulation.
*   **Action:**
    *   In `load()`: `data.tags = (data.tags || []).slice(0, 50)`
    *   In `update()`: `if (next.tags) next.tags = next.tags.slice(0, 50)`
    *   Apply same logic to `targets` (max 20).

### 1.2 Market Watcher Safety Valve
*   **Target:** `src/services/marketWatcher.ts`
*   **Issue:** Reference counting can desync.
*   **Action:** Add `forceCleanup()` that resets all internal counters and clears subscriptions. Call this on critical errors or route changes.

### 1.3 OMS Active Order Cap
*   **Target:** `src/services/omsService.ts`
*   **Issue:** Current pruning only affects *finalized* orders.
*   **Action:** In `updateOrder`, if `orders.size > 500` AND the new order is active, throw an error or reject the update to prevent memory attacks.

## 2. Critical Safety Features

### 2.1 Implement `closeAllPositions`
*   **Target:** `src/services/tradeService.ts`
*   **Issue:** Feature gap for panic scenarios.
*   **Action:**
    ```typescript
    async closeAllPositions() {
        const positions = omsService.getPositions();
        const promises = positions.map(p => this.closePosition({ symbol: p.symbol, positionSide: p.side }));
        await Promise.allSettled(promises);
    }
    ```
*   **Test:** Unit test ensuring all positions are iterated.

## 3. Type Safety & Code Quality

### 3.1 Strict API Typing
*   **Target:** `src/services/tradeService.ts`
*   **Action:** Change `signedRequest` signature to:
    ```typescript
    protected async signedRequest<T>(method: string, endpoint: string, payload: any): Promise<T>
    ```
    This forces consumers to define the expected return type.

## 4. UI/UX & Localization

### 4.1 Order History Localization
*   **Target:** `src/components/shared/OrderHistoryList.svelte`
*   **Action:**
    *   Add keys: `dashboard.orderHistory.type.limit`, `market`, `fee`, etc. to `en.json`.
    *   Replace hardcoded strings with `$_('key')`.

## Execution Order
1. Hardening (Stores -> Watcher -> OMS)
2. Safety Features (Close All)
3. Type Safety
4. I18n
