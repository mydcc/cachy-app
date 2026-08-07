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

  it("evicts tracked keys once the cap is exceeded, rather than growing unbounded", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, maxTrackedKeys: 5 });

    for (let i = 0; i < 20; i++) {
      limiter.consume(`key-${i}`);
    }

    // The limiter must not have kept all 20 keys' state — a request for a
    // long-evicted key is treated as fresh (allowed) again.
    expect(limiter.consume("key-0")).toBe(true);
  });
});
