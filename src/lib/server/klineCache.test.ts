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

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { getCachedKlines, clearKlineCache } from "./klineCache";
import {
  klineCacheKey,
  klineCacheTtlMs,
  clampKlineLimit,
  floorToBar,
  HISTORICAL_TTL_MS,
  type NormalizedKlineRequest,
} from "./klineCacheKey";

/**
 * A real candle boundary, aligned to the hour so it is a boundary for 1m and
 * 5m alike. Round numbers are not boundaries: 1_700_000_000_000 sits 20s into
 * its minute, which silently breaks every offset assertion below.
 */
const BAR_1M = 1_700_002_800_000;
/** Two minutes later: a new 1m candle. */
const TWO_MINUTES_LATER = BAR_1M + 120_000;

function request(
  overrides: Partial<NormalizedKlineRequest> = {},
): NormalizedKlineRequest {
  return {
    provider: "bitunix",
    symbol: "BTCUSDT",
    interval: "1m",
    limit: 200,
    start: null,
    end: null,
    priceSource: "last",
    ...overrides,
  };
}

describe("klineCacheKey", () => {
  it("resolves two millisecond-precision ends in the same candle to one key", () => {
    // This is the shape historyFetcher sends: endTime = Date.now().
    const a = klineCacheKey(request({ end: BAR_1M + 1_234 }), BAR_1M + 10_000);
    const b = klineCacheKey(request({ end: BAR_1M + 9_999 }), BAR_1M + 10_000);
    expect(a).toBe(b);
  });

  it("resolves a missing end to the forming candle", () => {
    const rolling = klineCacheKey(request({ end: null }), BAR_1M + 10_000);
    const explicit = klineCacheKey(
      request({ end: BAR_1M + 10_000 }),
      BAR_1M + 10_000,
    );
    expect(rolling).toBe(explicit);
  });

  it("splits keys once the candle closes", () => {
    const before = klineCacheKey(request(), TWO_MINUTES_LATER - 1);
    const after = klineCacheKey(request(), TWO_MINUTES_LATER);
    expect(before).not.toBe(after);
  });

  it("keeps a mark-price series apart from a last-price series", () => {
    const last = klineCacheKey(request({ priceSource: "last" }), BAR_1M);
    const mark = klineCacheKey(request({ priceSource: "mark" }), BAR_1M);
    expect(last).not.toBe(mark);
  });

  it("keeps venues, symbols, timeframes and limits apart", () => {
    const base = klineCacheKey(request(), BAR_1M);
    expect(klineCacheKey(request({ provider: "bitget" }), BAR_1M)).not.toBe(
      base,
    );
    expect(klineCacheKey(request({ symbol: "ETHUSDT" }), BAR_1M)).not.toBe(
      base,
    );
    expect(klineCacheKey(request({ interval: "5m" }), BAR_1M)).not.toBe(base);
    expect(klineCacheKey(request({ limit: 1000 }), BAR_1M)).not.toBe(base);
  });

  it("keeps a historical page apart from the rolling window", () => {
    const rolling = klineCacheKey(request({ end: null }), BAR_1M);
    const past = klineCacheKey(request({ end: BAR_1M - 5 * 60_000 }), BAR_1M);
    expect(rolling).not.toBe(past);
  });

  it("keeps requests with different starts apart, even in one candle", () => {
    // H1: the venue is called with `start` verbatim, so the key must carry
    // it verbatim. Same `end`, starts 17s apart inside one bar — flooring
    // would merge them and serve the first caller's window to the second.
    const a = klineCacheKey(
      request({ start: BAR_1M - 120_000, end: BAR_1M - 60_000 }),
      BAR_1M,
    );
    const b = klineCacheKey(
      request({ start: BAR_1M - 120_000 + 17_000, end: BAR_1M - 60_000 }),
      BAR_1M,
    );
    expect(a).not.toBe(b);
  });

  it("shares one key for identical backfill batches", () => {
    // The backfill always sends `start=1` with a varying `end`; identical
    // batches must still hit. `floorToBar(1) === 0`, so the raw value is
    // stable by construction, not by flooring.
    const a = klineCacheKey(
      request({ start: 1, end: BAR_1M - 60_000 }),
      BAR_1M,
    );
    const b = klineCacheKey(
      request({ start: 1, end: BAR_1M - 60_000 }),
      BAR_1M,
    );
    expect(a).toBe(b);
  });
});

describe("klineCacheTtlMs", () => {
  it("expires a rolling window at the close of the forming candle", () => {
    expect(
      klineCacheTtlMs({ end: null, interval: "1m" }, BAR_1M + 10_000),
    ).toBe(50_000);
  });

  it("gives a pinned historical range the flat window", () => {
    expect(
      klineCacheTtlMs({ end: BAR_1M - 60_000, interval: "1m" }, BAR_1M),
    ).toBe(HISTORICAL_TTL_MS);
  });

  it("never returns a TTL below the floor", () => {
    // One millisecond before the 1m candle closes the remaining lifetime is
    // 1ms, which buys nothing over the next key — so the floor is 1000.
    expect(
      klineCacheTtlMs({ end: null, interval: "1m" }, BAR_1M + 59_999),
    ).toBe(1000);
  });

  it("treats an end inside the forming candle as rolling", () => {
    expect(
      klineCacheTtlMs(
        { end: BAR_1M + 30_000, interval: "1m" },
        BAR_1M + 30_000,
      ),
    ).toBe(30_000);
  });

  it("resolves key and TTL from one derivation at the bar boundary", () => {
    // M1: `end` exactly at the forming bar's start. The key must name the
    // forming bar and the TTL must be rolling — never a historical entry
    // pointing at the open bar, which would freeze a live value for minutes.
    const req = { end: BAR_1M, interval: "1m" };
    const key = klineCacheKey(request(req), BAR_1M + 10_000);
    expect(key.endsWith(`:${BAR_1M}:last`)).toBe(true);
    expect(klineCacheTtlMs(req, BAR_1M + 10_000)).toBe(50_000);
  });
});

describe("floorToBar", () => {
  it("rounds down to the containing candle", () => {
    expect(floorToBar(BAR_1M + 61_234, "1m")).toBe(BAR_1M + 60_000);
    expect(floorToBar(BAR_1M + 61_234, "5m")).toBe(BAR_1M);
  });
});

describe("clampKlineLimit", () => {
  it("caps a limit larger than the venue ever serves", () => {
    expect(clampKlineLimit(1_000_000)).toBe(1000);
  });

  it("keeps a legitimate limit untouched", () => {
    expect(clampKlineLimit(200)).toBe(200);
    expect(clampKlineLimit(1000)).toBe(1000);
  });

  it("rejects a limit that is not a usable number", () => {
    expect(clampKlineLimit(Number.NaN)).toBe(1);
    expect(clampKlineLimit(0)).toBe(1);
    expect(clampKlineLimit(-5)).toBe(1);
  });
});

describe("getCachedKlines", () => {
  beforeEach(() => {
    clearKlineCache();
  });

  afterEach(() => {
    clearKlineCache();
  });

  it("calls the venue once for two requests inside the same candle", async () => {
    const fetchFn = vi.fn().mockResolvedValue([{ time: BAR_1M, close: 1 }]);

    await getCachedKlines(
      request({ end: BAR_1M + 1 }),
      fetchFn,
      BAR_1M + 5_000,
    );
    await getCachedKlines(
      request({ end: BAR_1M + 9_000 }),
      fetchFn,
      BAR_1M + 10_000,
    );

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("calls the venue again once the candle has closed", async () => {
    const fetchFn = vi.fn().mockResolvedValue([{ time: BAR_1M, close: 1 }]);

    await getCachedKlines(request(), fetchFn, BAR_1M + 5_000);
    await getCachedKlines(request(), fetchFn, TWO_MINUTES_LATER);

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("serves the mark-price series from its own entry", async () => {
    const last = await getCachedKlines(
      request({ priceSource: "last" }),
      async () => [{ time: BAR_1M, close: "last" }],
      BAR_1M,
    );
    const mark = await getCachedKlines(
      request({ priceSource: "mark" }),
      async () => [{ time: BAR_1M, close: "mark" }],
      BAR_1M,
    );

    expect(last).toEqual([{ time: BAR_1M, close: "last" }]);
    expect(mark).toEqual([{ time: BAR_1M, close: "mark" }]);
  });

  it("does not cache a venue failure", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("upstream down"))
      .mockResolvedValue([{ time: BAR_1M, close: 1 }]);

    await expect(getCachedKlines(request(), fetchFn, BAR_1M)).rejects.toThrow(
      "upstream down",
    );
    await expect(
      getCachedKlines(request(), fetchFn, BAR_1M + 1_000),
    ).resolves.toEqual([{ time: BAR_1M, close: 1 }]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("hands the fetcher nothing — the caller builds the venue request", async () => {
    // The cache supplies and rewrites nothing: whatever the venue is asked for
    // is the route's decision, not the cache's.
    const fetchFn = vi.fn().mockResolvedValue([]);
    await getCachedKlines(request({ end: BAR_1M + 5_000 }), fetchFn, BAR_1M);
    expect(fetchFn).toHaveBeenCalledWith();
  });
});
