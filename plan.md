1. **Initial setup**: Create the branch and update the issue status to `in-progress`.
2. **Decompose market.svelte.ts**:
   - Extract cache management to `src/stores/market/symbolCache.ts`. This will involve copying `CacheMetadata` and the `SymbolCache` class logic (managing `lastAccessed`, `evictLRU`, etc.). It will need callbacks or access to release backing buffers or delete data items upon eviction.
   - Extract kline buffers to `src/stores/market/klineBuffers.ts`. This will encapsulate `BufferPool` and `backingBuffers` map and provide acquire/release and write logic for klines.
   - Extract telemetry to `src/stores/market/telemetry.ts`. This will manage API latency, metrics, and reset intervals.
   - Refactor `MarketManager` in `src/stores/market.svelte.ts` to use these extracted classes instead of having the logic mixed internally.
3. **Ensure strict bounds**:
   - The buffer ownership must be explicit, such that `release()` is called properly.
   - `MarketManager` delegates eviction and pooling correctly.
4. **Verification**:
   - Verify `market.svelte.ts` size is < 400 lines.
   - Ensure the tests (`market.test.ts`, `marketStore.test.ts`, `marketStore_limits.test.ts`, `marketStore_bufferPool.test.ts`) still pass unchanged.
   - `npm run check` and `npm run test` pass.
