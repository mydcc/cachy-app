export class MemoryCache {
  private cache: Map<string, { value: any; expiry: number }>;
  private inflight: Map<string, Promise<any>>;

  constructor() {
    this.cache = new Map();
    this.inflight = new Map();
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
    ttlMs: number
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
        // Store in cache
        this.cache.set(key, {
          value: data,
          expiry: Date.now() + ttlMs,
        });
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
