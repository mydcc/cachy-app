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
 * Capacity policy (BUG-0722): the map is bounded at `maxTrackedKeys`, and a
 * live bucket is never evicted. Evicting one would hand its owner a fresh
 * window on the next request — the bypass this limiter exists to prevent. At
 * capacity, untracked keys do not get a bucket of their own; they draw from
 * one shared overflow budget per window. That keeps memory bounded and keeps
 * tracked clients working, while a newcomer is throttled rather than
 * blanket-refused (refusing every newcomer turns a spray into a deny-all gate
 * — worst on the unauthenticated token route, whose window is an hour).
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
   * when the tracked-key cap and the shared overflow budget are both
   * exhausted (fail closed under saturation).
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
  /** Hard cap on distinct live keys tracked at once. Defaults to 1000. */
  maxTrackedKeys?: number;
}

const DEFAULT_MAX_TRACKED_KEYS = 1000;

/**
 * Requests the shared overflow budget admits per window once the tracked-key
 * cap is reached, as a multiple of `max`.
 *
 * The budget is one bucket shared by every untracked key, so it throttles
 * newcomers collectively instead of denying them outright, and cannot be used
 * as a free bypass: it is bounded at `max * OVERFLOW_MULTIPLIER` per window.
 */
const OVERFLOW_MULTIPLIER = 10;

/**
 * Minimum interval between expired-bucket sweeps.
 *
 * Sweeping on every insertion is O(n²) for a burst, because each of n inserts
 * scans the n entries so far. A sweep is only needed when the map is full,
 * and once per second is enough to notice elapsed windows.
 */
const MIN_SWEEP_INTERVAL_MS = 1_000;

export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const windowMs = options.windowMs;
  const max = Math.max(1, options.max);
  const maxTrackedKeys = Math.max(
    1,
    options.maxTrackedKeys ?? DEFAULT_MAX_TRACKED_KEYS,
  );
  const overflowMax = max * OVERFLOW_MULTIPLIER;
  const hits = new Map<string, RateLimitEntry>();

  let lastSweepAt = 0;
  let overflowCount = 0;
  let overflowResetTime = 0;
  let overflowExhaustedLogged = false;

  /** Drops every bucket whose window has elapsed. */
  function evictExpired(now: number) {
    lastSweepAt = now;
    for (const [key, entry] of hits) {
      if (now > entry.resetTime) hits.delete(key);
    }
  }

  /**
   * Admits an untracked key from the single shared overflow budget. Never
   * inserts into `hits`, so memory stays at `maxTrackedKeys`.
   */
  function consumeOverflow(now: number): boolean {
    if (now > overflowResetTime) {
      overflowCount = 0;
      overflowResetTime = now + windowMs;
      overflowExhaustedLogged = false;
    }

    if (overflowCount >= overflowMax) {
      if (!overflowExhaustedLogged) {
        overflowExhaustedLogged = true;
        console.warn(
          `[rateLimit] tracked-key cap (${maxTrackedKeys}) reached and overflow budget (${overflowMax}/${windowMs}ms) exhausted; refusing new keys until the window resets.`,
        );
      }
      return false;
    }

    overflowCount++;
    return true;
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

      // New or expired key. A full map is only swept when it matters, and at
      // most once per MIN_SWEEP_INTERVAL_MS, so a burst stays O(n) instead of
      // O(n²).
      if (hits.size >= maxTrackedKeys) {
        if (now - lastSweepAt >= MIN_SWEEP_INTERVAL_MS) evictExpired(now);
        if (hits.size >= maxTrackedKeys) return consumeOverflow(now);
      }

      hits.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    },
    forget(key: string): void {
      hits.delete(key);
    },
    clear(): void {
      hits.clear();
      lastSweepAt = 0;
      overflowCount = 0;
      overflowResetTime = 0;
      overflowExhaustedLogged = false;
    },
  };
}
