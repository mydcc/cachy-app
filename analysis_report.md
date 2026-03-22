# Phase 1: In-depth Analysis & Report

## 🔴 CRITICAL
1. **TradeService - Potential infinite recursion during Decimal stringification:** In `src/services/tradeService.ts`, the `serializePayload` method uses duck-typing (`Decimal.isDecimal(payload)`) followed by `payload.toString()`. This ducks-typing behavior combined with `.toString()` without verifying if the result is actually a string could cause infinite recursion or failures if an object is falsely identified as a Decimal. The code currently does `if (payload instanceof Decimal) return payload.toString();` and then `if (Decimal.isDecimal(payload)) return payload.toString();`. The system instructions recommend using only `Decimal.isDecimal(payload)`.
2. **TradeService - Missing Error Translation Keys:** Several error messages in `src/services/tradeService.ts` throw using hardcoded strings that do not exist in `en.json` or `schema.d.ts`. Specifically:
   - Line 196: `throw new Error("tradeErrors.fetchFailed");` (Should be `apiErrors.fetchFailed`).
   - Line 440: `throw new Error("tradeErrors.invalidAmount");` (Should be `apiErrors.invalidAmount`).

## 🟡 WARNING
1. **MarketWatcher - Unbounded History Storage Potential:** `marketState.data[symbol]?.klines[tf]` arrays grow through backfilling or incoming WS updates. While there are limits applied dynamically, gap filling routines like `fillGaps` allocate new Decimal objects for each gap. With `MAX_GAP_FILL = 5000`, a large time gap can cause a sudden spike in allocated objects on the UI thread.
2. **MarketWatcher - Performance during Backfill:** `ensureHistory` performs a lot of array manipulations. The instantiation inside `fillGaps` creates a lot of Decimal objects without reusing efficiently.
3. **NewsService - Deduplication Hash:** `generateNewsId` uses `crypto-js` to generate Base64, but truncates at 128 chars. More importantly, `shouldFetchNews` depends on `cached.lastApiCall` and `cached.timestamp` which must be robust.

## 🔵 REFACTOR
1. **OMS Service - Ring Buffer Loop Optimization:** The `pruneOrders` function iterates over the `this.orders` map sequentially to find and evict finalized or the oldest orders when the maximum size is reached. Using an iterator manually is okay, but could be optimized for high-frequency operations.
