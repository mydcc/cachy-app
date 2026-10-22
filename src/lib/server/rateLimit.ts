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
 * Shared in-memory, fixed-window rate limiter.
 *
 * Extracted from the ad-hoc `_rateLimits`/`RATE_LIMIT_WINDOW`/
 * `MAX_REQUESTS_PER_WINDOW` limiter that used to live only in
 * `external/news/+server.ts` (BUG-0052), so every route that needs one uses
 * the same tested implementation instead of reinventing it per file.
 *
 * In-memory by design: state resets on server restart and does not span
 * multiple instances. That is an accepted limitation for a single-process
 * deployment, matching the pattern this replaces — not a regression this
 * change introduces.
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export interface RateLimiter {
  /** Records a hit for `key`. Returns false once `key` is over its limit for the current window. */
  consume(key: string): boolean;
  /** Drops all tracked state. Test-only escape hatch for isolating cases. */
  clear(): void;
}

export interface RateLimitOptions {
  /** Length of the fixed window, in milliseconds. */
  windowMs: number;
  /** Requests allowed per key per window. */
  max: number;
  /**
   * Hard cap on distinct live keys tracked at once, to bound memory under a
   * key-spray attack. At capacity, a new key is refused (fail closed) instead
   * of evicting a live bucket — see `createRateLimiter`.
   */
  maxTrackedKeys?: number;
}

const DEFAULT_MAX_TRACKED_KEYS = 1000;

export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const { windowMs, max, maxTrackedKeys = DEFAULT_MAX_TRACKED_KEYS } = options;
  const hits = new Map<string, RateLimitEntry>();

  /**
   * Drops every bucket whose window has elapsed.
   *
   * Expired buckets are the only ones eviction may ever touch: deleting a
   * *live* bucket hands its owner a fresh window on the next request, which is
   * exactly the bypass the cap exists to prevent (BUG-0722). Oldest-inserted
   * eviction had that effect for any victim whose bucket was not the newest,
   * and an LRU variant still does it for a victim idle across the spray.
   */
  function evictExpired(now: number) {
    for (const [key, entry] of hits) {
      if (now > entry.resetTime) hits.delete(key);
    }
  }

  return {
    consume(key: string): boolean {
      const now = Date.now();
      const entry = hits.get(key);

      if (entry && now <= entry.resetTime) {
        if (entry.count >= max) return false;
        entry.count++;
        return true;
      }

      // New or expired key: reclaim room from elapsed windows first.
      evictExpired(now);
      if (hits.size >= maxTrackedKeys) {
        // The map is full of live buckets. Refusing the newcomer — instead of
        // evicting a live bucket — is the fail-closed choice: eviction would
        // reset the evicted key's counter and let it start over, so the
        // ceiling would stop binding exactly when the limiter is under
        // pressure. The cost is that a spray can turn the limiter into a
        // deny-all for *new* keys until an existing window elapses (at most
        // windowMs); that is preferable to a silent bypass, and the caller
        // sees an honest 429 rather than an unlimited budget.
        return false;
      }
      hits.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    },
    clear(): void {
      hits.clear();
    },
  };
}
