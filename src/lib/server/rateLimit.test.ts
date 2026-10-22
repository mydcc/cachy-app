// @vitest-environment node
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

import { describe, it, expect, afterEach, vi } from "vitest";
import { createRateLimiter } from "./rateLimit";

describe("createRateLimiter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to max requests per key within the window", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });

    expect(limiter.consume("a")).toBe(true);
    expect(limiter.consume("a")).toBe(true);
    expect(limiter.consume("a")).toBe(true);
    expect(limiter.consume("a")).toBe(false);
  });

  it("tracks each key independently", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });

    expect(limiter.consume("a")).toBe(true);
    expect(limiter.consume("b")).toBe(true);
    expect(limiter.consume("a")).toBe(false);
    expect(limiter.consume("b")).toBe(false);
  });

  it("resets a key once its window has elapsed", () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter({ windowMs: 1_000, max: 1 });

    expect(limiter.consume("a")).toBe(true);
    expect(limiter.consume("a")).toBe(false);

    vi.advanceTimersByTime(1_001);

    expect(limiter.consume("a")).toBe(true);
  });

  it("clear() drops all tracked state", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });

    expect(limiter.consume("a")).toBe(true);
    expect(limiter.consume("a")).toBe(false);

    limiter.clear();

    expect(limiter.consume("a")).toBe(true);
  });

  it("does not evict a live bucket under a key spray — the ceiling keeps binding (BUG-0722)", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2, maxTrackedKeys: 5 });

    // The victim spends one of its two allowed requests...
    expect(limiter.consume("victim")).toBe(true);

    // ...then an attacker sprays distinct keys past the cap. Oldest-first
    // eviction dropped the victim's bucket here, and its next request would
    // have started a fresh window — the counter reset this test pins down.
    for (let i = 0; i < 20; i++) {
      limiter.consume(`spray-${i}`);
    }

    // The victim's bucket survived: the second request is still the second,
    // and the third is refused — the ceiling binds even under pressure.
    expect(limiter.consume("victim")).toBe(true);
    expect(limiter.consume("victim")).toBe(false);
  });

  it("routes untracked keys through one shared overflow budget at capacity (BUG-0722)", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2, maxTrackedKeys: 2 });

    expect(limiter.consume("a")).toBe(true);
    expect(limiter.consume("b")).toBe(true);

    // Newcomers are throttled by one shared budget (max * 10 admissions),
    // not refused outright, so a spray cannot turn the limiter into a
    // deny-all gate for honest clients.
    for (let i = 0; i < 20; i++) {
      expect(limiter.consume("c")).toBe(true);
    }
    expect(limiter.consume("c")).toBe(false);

    // The tracked buckets are untouched by the overflow being spent.
    expect(limiter.consume("a")).toBe(true);
    expect(limiter.consume("a")).toBe(false);
  });

  it("admits a newcomer into its own bucket once expired buckets free capacity", () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter({ windowMs: 1_000, max: 1, maxTrackedKeys: 2 });

    expect(limiter.consume("a")).toBe(true);
    expect(limiter.consume("b")).toBe(true);

    // At capacity the newcomer draws from the shared overflow budget, so its
    // second request is still admitted — it has no per-key bucket yet.
    expect(limiter.consume("c")).toBe(true);
    expect(limiter.consume("c")).toBe(true);

    vi.advanceTimersByTime(1_001);

    // The older windows elapsed; the newcomer now has its own bucket, which
    // binds after one request.
    expect(limiter.consume("c")).toBe(true);
    expect(limiter.consume("c")).toBe(false);
  });

  it("forget() drops one key's bucket, so it starts a fresh window", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });

    expect(limiter.consume("a")).toBe(true);
    expect(limiter.consume("a")).toBe(false);

    limiter.forget("a");

    expect(limiter.consume("a")).toBe(true);
  });
});
