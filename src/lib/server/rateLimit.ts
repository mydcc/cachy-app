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
 *
 * Capacity policy (BUG-0722): a live bucket is never evicted. Evicting one
 * would hand its owner a fresh window on the next request — the bypass this
 * limiter exists to prevent. The map is bounded at `maxTrackedKeys`; when it
 * is full, a newcomer gets a normal bucket of its own in a second, smaller
 * probation map (same `max`, expired-first, capped at `MAX_PROBATION_KEYS`).
 * That keeps established clients working and does not grant newcomers an
 * extra allowance beyond `max`. When both maps are full of live buckets, the
 * limiter fails closed rather than evicting a live bucket: a newcomer is
 * refused until an existing window elapses.
 *
 * Residual, documented rather than hidden: an actor who can present
 * `maxTrackedKeys + MAX_PROBATION_KEYS` distinct keys (for IPv6, distinct
 * /64 networks — see `normalizeClientAddress`) can keep both maps full and
 * deny admissions for one window. Closing that needs an admission mechanism
 * (a bot challenge on the issuance route), not a bigger map.
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export interface RateLimiter {
  /**
   * Records a hit for `key`.
   *
   * Returns false when the key is over its limit for the current window, or
   * when the established and probation maps are both full of live buckets
   * (fail closed under saturation).
   */
  consume(key: string): boolean;
  /**
   * Drops a single key's bucket.
   *
   * For callers whose key space is managed elsewhere — `clientToken.ts`
   * removes token records at its own cap — so a removed key does not keep
   * occupying a slot until its window elapses.
   */
  forget(key: string): void;
  /** Drops all tracked state. Test-only escape hatch for isolating cases. */
  clear(): void;
}

export interface RateLimitOptions {
  /** Length of the fixed window, in milliseconds. */
  windowMs: number;
  /** Requests allowed per key per window. */
  max: number;
  /** Hard cap on distinct established keys tracked at once. Defaults to 1000. */
  maxTrackedKeys?: number;
}

const DEFAULT_MAX_TRACKED_KEYS = 1000;

/**
 * Hard cap on the probation map that absorbs newcomers once the established
 * map is full. Small on purpose: it is overflow, not a second allowance, and
 * every probation bucket enforces the same `max` as an established one.
 */
const MAX_PROBATION_KEYS = 1_000;

/**
 * Minimum interval between expired-bucket sweeps.
 *
 * Sweeping on every insertion is O(n²) for a burst, because each of n inserts
 * scans the n entries so far. A sweep is only needed once probation (the
 * last resort) is full, and once per second is enough to notice elapsed
 * windows.
 */
const MIN_SWEEP_INTERVAL_MS = 1_000;

export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const windowMs = options.windowMs;
  const max = Math.max(1, options.max);
  const maxTrackedKeys = Math.max(
    1,
    options.maxTrackedKeys ?? DEFAULT_MAX_TRACKED_KEYS,
  );
  const probationCapacity = Math.max(
    1,
    Math.min(MAX_PROBATION_KEYS, Math.floor(maxTrackedKeys / 2)),
  );

  const established = new Map<string, RateLimitEntry>();
  const probation = new Map<string, RateLimitEntry>();

  let lastSweepAt = Number.NEGATIVE_INFINITY;
  let saturationLogged = false;

  /** Drops every bucket in `map` whose window has elapsed. */
  function evictExpired(map: Map<string, RateLimitEntry>, now: number) {
    for (const [key, entry] of map) {
      if (now > entry.resetTime) map.delete(key);
    }
  }

  /**
   * Applies the fixed-window decision to an existing bucket. An expired
   * bucket is replaced in place: its slot is already accounted for, so it
   * must not be routed through the capacity path (which would consume a
   * probation slot and could refuse it while the sweep is throttled).
   */
  function decide(
    key: string,
    entry: RateLimitEntry,
    map: Map<string, RateLimitEntry>,
    now: number,
  ): boolean {
    if (now <= entry.resetTime) {
      if (entry.count >= max) return false;
      entry.count++;
      return true;
    }
    map.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  return {
    consume(key: string): boolean {
      const now = Date.now();

      const existing = established.get(key);
      if (existing) return decide(key, existing, established, now);

      const pending = probation.get(key);
      if (pending) return decide(key, pending, probation, now);

      // Genuinely new key: the established map first, then probation.
      if (established.size < maxTrackedKeys) {
        established.set(key, { count: 1, resetTime: now + windowMs });
        return true;
      }

      // At capacity. Only sweep when probation (the last resort) is full, and
      // at most once per MIN_SWEEP_INTERVAL_MS, so a burst stays O(n).
      if (
        probation.size >= probationCapacity &&
        now - lastSweepAt >= MIN_SWEEP_INTERVAL_MS
      ) {
        lastSweepAt = now;
        const before = established.size + probation.size;
        evictExpired(probation, now);
        evictExpired(established, now);
        if (established.size + probation.size < before) saturationLogged = false;
      }

      if (established.size < maxTrackedKeys) {
        established.set(key, { count: 1, resetTime: now + windowMs });
        return true;
      }
      if (probation.size < probationCapacity) {
        probation.set(key, { count: 1, resetTime: now + windowMs });
        return true;
      }

      // Both maps are full of live buckets. Refusing the newcomer — instead
      // of evicting a live bucket — is the fail-closed choice: eviction would
      // reset the evicted key's counter and let it start over. The caller
      // sees an honest 429 rather than an unlimited budget.
      if (!saturationLogged) {
        saturationLogged = true;
        console.warn(
          `[rateLimit] established (${maxTrackedKeys}) and probation (${probationCapacity}) capacities reached; refusing new keys until a window elapses.`,
        );
      }
      return false;
    },
    forget(key: string): void {
      established.delete(key);
      probation.delete(key);
    },
    clear(): void {
      established.clear();
      probation.clear();
      lastSweepAt = Number.NEGATIVE_INFINITY;
      saturationLogged = false;
    },
  };
}
