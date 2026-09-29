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

import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryCache } from "./cache";

const T0 = 1_700_000_000_000;

describe("MemoryCache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("serves a stored value without calling the fetcher again", async () => {
    const cache = new MemoryCache();
    const fetchFn = vi.fn().mockResolvedValue("value");

    expect(await cache.getOrFetch("k", fetchFn, 1000)).toBe("value");
    expect(await cache.getOrFetch("k", fetchFn, 1000)).toBe("value");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("coalesces simultaneous requests for one key into a single fetch", async () => {
    const cache = new MemoryCache();
    let release: (v: string) => void = () => {};
    const fetchFn = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );

    const both = Promise.all([
      cache.getOrFetch("k", fetchFn, 1000),
      cache.getOrFetch("k", fetchFn, 1000),
    ]);
    release("value");

    expect(await both).toEqual(["value", "value"]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("fetches again once the TTL has passed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const cache = new MemoryCache();
    const fetchFn = vi.fn().mockResolvedValue("value");

    await cache.getOrFetch("k", fetchFn, 1000);
    expect(await cache.getOrFetch("k", fetchFn, 1000)).toBe("value");
    expect(fetchFn).toHaveBeenCalledTimes(1);

    vi.setSystemTime(T0 + 1001);
    expect(await cache.getOrFetch("k", fetchFn, 1000)).toBe("value");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("does not cache a rejected fetch", async () => {
    const cache = new MemoryCache();
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("upstream down"))
      .mockResolvedValue("recovered");

    await expect(cache.getOrFetch("k", fetchFn, 1000)).rejects.toThrow(
      "upstream down",
    );
    expect(await cache.getOrFetch("k", fetchFn, 1000)).toBe("recovered");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("evicts the oldest stored entry once the bound is reached", async () => {
    const cache = new MemoryCache(3);
    const fetchValue = async (key: string) => "value-" + key;

    const fetchA = vi.fn(() => fetchValue("a"));
    const fetchB = vi.fn(() => fetchValue("b"));
    const fetchC = vi.fn(() => fetchValue("c"));
    const fetchD = vi.fn(() => fetchValue("d"));

    expect(await cache.getOrFetch("a", fetchA, 1000)).toBe("value-a");
    expect(await cache.getOrFetch("b", fetchB, 1000)).toBe("value-b");
    expect(await cache.getOrFetch("c", fetchC, 1000)).toBe("value-c");
    expect(cache.size).toBe(3);

    // The fourth distinct key arrives at the bound, so "a" — the oldest
    // stored — is dropped. "b" and "c" are untouched.
    expect(await cache.getOrFetch("d", fetchD, 1000)).toBe("value-d");
    expect(cache.size).toBe(3);
    expect(fetchD).toHaveBeenCalledTimes(1);

    expect(await cache.getOrFetch("b", fetchB, 1000)).toBe("value-b");
    expect(await cache.getOrFetch("c", fetchC, 1000)).toBe("value-c");
    expect(fetchB).toHaveBeenCalledTimes(1);
    expect(fetchC).toHaveBeenCalledTimes(1);

    // "a" is gone, so it costs an upstream fetch again.
    expect(await cache.getOrFetch("a", fetchA, 1000)).toBe("value-a");
    expect(fetchA).toHaveBeenCalledTimes(2);
  });

  it("stays within the bound when keys never repeat", async () => {
    const cache = new MemoryCache(10);

    for (let i = 0; i < 1000; i++) {
      await cache.getOrFetch("key-" + i, async () => i, 60_000);
      expect(cache.size).toBeLessThanOrEqual(10);
    }

    expect(cache.size).toBe(10);
  });

  it("evicts a single entry on request", async () => {
    const cache = new MemoryCache();
    const fetchFn = vi.fn().mockResolvedValue("value");

    await cache.getOrFetch("k", fetchFn, 1000);
    cache.evict("k");
    await cache.getOrFetch("k", fetchFn, 1000);

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("clears every entry on request", async () => {
    const cache = new MemoryCache();
    const fetchFn = vi.fn().mockResolvedValue("value");

    await cache.getOrFetch("a", fetchFn, 1000);
    await cache.getOrFetch("b", fetchFn, 1000);
    expect(cache.size).toBe(2);

    cache.clear();
    expect(cache.size).toBe(0);
  });
});
