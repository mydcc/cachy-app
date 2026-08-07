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
  /** Hard cap on distinct keys tracked at once, to bound memory under a key-spray attack. */
  maxTrackedKeys?: number;
}

const DEFAULT_MAX_TRACKED_KEYS = 1000;

export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const { windowMs, max, maxTrackedKeys = DEFAULT_MAX_TRACKED_KEYS } = options;
  const hits = new Map<string, RateLimitEntry>();

  function evictIfCrowded(now: number) {
    if (hits.size <= maxTrackedKeys) return;

    // Expired entries first...
    for (const [key, entry] of hits) {
      if (now > entry.resetTime) hits.delete(key);
    }
    // ...then oldest-inserted, if that alone wasn't enough.
    if (hits.size > maxTrackedKeys) {
      const overflow = hits.size - maxTrackedKeys;
      const toDelete = Array.from(hits.keys()).slice(0, overflow);
      toDelete.forEach((key) => hits.delete(key));
    }
  }

  return {
    consume(key: string): boolean {
      const now = Date.now();
      evictIfCrowded(now);

      const entry = hits.get(key);
      if (!entry || now > entry.resetTime) {
        hits.set(key, { count: 1, resetTime: now + windowMs });
        return true;
      }
      if (entry.count >= max) return false;
      entry.count++;
      return true;
    },
    clear(): void {
      hits.clear();
    },
  };
}
