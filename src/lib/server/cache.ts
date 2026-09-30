/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Default ceiling on stored entries.
 *
 * The five existing callers (`/api/tickers`, `/api/funding-rate`,
 * `/api/trading-pairs`, `/api/position-tiers`,
 * `/api/bitget/contracts`) use a handful of long-lived keys with high
 * repetition, so they never come near this. A caller whose keys rotate —
 * see `klineCacheKey`, where the key carries the current candle's open time
 * — is expected to pass its own bound.
 */
const DEFAULT_MAX_ENTRIES = 500;

export class MemoryCache {
  private cache: Map<string, { value: unknown; expiry: number }>;
  private inflight: Map<string, Promise<unknown>>;
  private readonly maxEntries: number;

  constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.cache = new Map();
    this.inflight = new Map();
    this.maxEntries = maxEntries;
  }

  /**
   * Retrieves a value from the cache or fetches it if missing/expired.
   * Prevents duplicate simultaneous requests (Thundering Herd problem) by coalescing promises.
   *
   * @param key Unique cache key
   * @param fetchFn Function that returns a Promise with the data
   * @param ttlMs Time to live in milliseconds
   */
  async getOrFetch<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlMs: number,
  ): Promise<T> {
    const now = Date.now();

    // 1. Check if valid cache exists
    if (this.cache.has(key)) {
      const entry = this.cache.get(key)!;
      if (entry.expiry > now) {
        return entry.value as T;
      } else {
        // Expired, delete it
        this.cache.delete(key);
      }
    }

    // 2. Check if a request is already in flight for this key
    if (this.inflight.has(key)) {
      return this.inflight.get(key) as Promise<T>;
    }

    // 3. Fetch new data
    const promise = fetchFn()
      .then((data) => {
        // Store in cache, staying within the bound
        this.store(key, data, ttlMs);
        return data;
      })
      .catch((err) => {
        // Do not cache errors, just throw
        throw err;
      })
      .finally(() => {
        // Cleanup inflight map
        this.inflight.delete(key);
      });

    this.inflight.set(key, promise);
    return promise;
  }

  /**
   * Stores a value, evicting first if the cache is at its bound.
   *
   * Insertion order is the eviction order, so the entry that leaves is the
   * oldest one stored rather than the least recently read. For the existing
   * callers, whose keys repeat continuously, the two are the same entry.
   *
   * Refreshing a key that is already present evicts nothing: `Map.set` on an
   * existing key keeps its position in the iteration order, so the store is at
   * the bound both before and after and no entry is owed a slot.
   */
  private store(key: string, value: unknown, ttlMs: number) {
    if (!this.cache.has(key) && this.cache.size >= this.maxEntries) {
      this.evictOldest();
    }
    this.cache.set(key, { value, expiry: Date.now() + ttlMs });
  }

  /**
   * Drops the oldest stored entry.
   *
   * An entry is only otherwise removed when its own key is read again after
   * expiry, so a caller whose keys never repeat would grow this map without
   * limit. maxEntries is the backstop for that.
   */
  private evictOldest() {
    const oldest = this.cache.keys().next();
    if (!oldest.done) {
      this.cache.delete(oldest.value);
    }
  }

  /**
   * Number of entries currently held, live and expired alike.
   *
   * Read by the bound's tests. `clientToken.ts` and `rateLimit.ts` expose the
   * same getter for the same reason: an eviction bound that cannot be
   * observed cannot be tested.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Manually clear a cache entry
   */
  evict(key: string) {
    this.cache.delete(key);
    // We do not remove inflight requests to ensure consistency for pending callers
  }

  /**
   * Clear all cache (useful for testing or full reset)
   */
  clear() {
    this.cache.clear();
    // We intentionally leave inflight requests to complete
  }
}

// Singleton instance
export const cache = new MemoryCache();
