/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MarkCandleCache,
  toEvaluationCandles,
  type MarkCandleFetcher,
} from "./markCandleCache";
import type { EvaluationCandle } from "../../lib/rules/types";

const candle = (time: number, close: string): EvaluationCandle => ({
  open_time_ms: time,
  open: close,
  high: close,
  low: close,
  close,
});

describe("toEvaluationCandles", () => {
  it("keeps decimals as strings rather than routing them through a float", () => {
    const rows = [
      { timestamp: 1, open: "0.000001", high: "0.000002", low: "0.0000005", close: "0.0000015" },
    ];
    expect(toEvaluationCandles(rows)[0]).toMatchObject({
      open: "0.000001",
      close: "0.0000015",
    });
  });

  it("stringifies a numeric row without scientific notation creeping in", () => {
    const rows = [{ timestamp: 1, open: 100.5, high: 101, low: 99, close: 100 }];
    expect(toEvaluationCandles(rows)[0].open).toBe("100.5");
  });

  it("sorts oldest first, which is the order the evaluator indexes on", () => {
    const rows = [
      { timestamp: 300, open: "3", high: "3", low: "3", close: "3" },
      { timestamp: 100, open: "1", high: "1", low: "1", close: "1" },
      { timestamp: 200, open: "2", high: "2", low: "2", close: "2" },
    ];
    expect(toEvaluationCandles(rows).map((c) => c.open_time_ms)).toEqual([100, 200, 300]);
  });

  it("drops a malformed row instead of emitting a candle with holes in it", () => {
    const rows = [
      { timestamp: 1, open: "1", high: "1", low: "1", close: "1" },
      { timestamp: 2, open: "2" },
      null,
      "not a candle",
      { open: "3", high: "3", low: "3", close: "3" },
    ];
    expect(toEvaluationCandles(rows)).toHaveLength(1);
  });

  it("answers empty for a non-array body rather than throwing on the hot path", () => {
    expect(toEvaluationCandles(null)).toEqual([]);
    expect(toEvaluationCandles({ error: "nope" })).toEqual([]);
  });
});

describe("MarkCandleCache", () => {
  let now: number;
  let fetcher: ReturnType<typeof vi.fn>;
  let cache: MarkCandleCache;

  beforeEach(() => {
    now = 1_000_000;
    fetcher = vi.fn(async () => [candle(1, "100")]);
    cache = new MarkCandleCache(fetcher as unknown as MarkCandleFetcher, () => now);
  });

  /**
   * The read is on the market hot path, once per rule per candle close. It must
   * answer from what has arrived and never block on a request.
   */
  it("reads empty before anything has arrived, without fetching", () => {
    expect(cache.read("BTCUSDT", "4h")).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("serves the fetched series once the refresh lands", async () => {
    await cache.ensure("BTCUSDT", "4h");
    expect(cache.read("BTCUSDT", "4h")).toEqual([candle(1, "100")]);
  });

  /**
   * Two rules on the same symbol and timeframe are the normal case. Each candle
   * close asking its own question must not become two requests.
   */
  it("collapses concurrent refreshes of one series into a single request", async () => {
    const first = cache.ensure("BTCUSDT", "4h");
    const second = cache.ensure("BTCUSDT", "4h");
    expect(second).toBeUndefined();
    await first;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not refetch a series that was just refreshed", async () => {
    await cache.ensure("BTCUSDT", "4h");
    now += 1_000;
    expect(cache.ensure("BTCUSDT", "4h")).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refetches once the series has gone stale", async () => {
    await cache.ensure("BTCUSDT", "4h");
    now += 60_000;
    await cache.ensure("BTCUSDT", "4h");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps series of different symbols and timeframes apart", async () => {
    fetcher.mockImplementation(async (symbol: string, timeframe: string) => [
      candle(1, `${symbol}:${timeframe}`),
    ]);
    await cache.ensure("BTCUSDT", "4h");
    await cache.ensure("ETHUSDT", "4h");
    await cache.ensure("BTCUSDT", "1h");

    expect(cache.read("BTCUSDT", "4h")[0].close).toBe("BTCUSDT:4h");
    expect(cache.read("ETHUSDT", "4h")[0].close).toBe("ETHUSDT:4h");
    expect(cache.read("BTCUSDT", "1h")[0].close).toBe("BTCUSDT:1h");
  });

  /**
   * A venue that cannot serve the series will never start. Re-asking once per
   * candle close would be a request storm that changes nothing.
   */
  it("stops asking a venue that answered 501, and says so", async () => {
    fetcher.mockRejectedValue(Object.assign(new Error("nope"), { status: 501 }));
    await cache.ensure("BTCUSDT", "4h");

    expect(cache.isUnsupported("BTCUSDT", "4h")).toBe(true);
    now += 60_000;
    expect(cache.ensure("BTCUSDT", "4h")).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  /**
   * A transient failure is not a permanent one, and it must not blank a series
   * the rule could still be answered from.
   */
  it("keeps the last good series after a transient failure and retries later", async () => {
    await cache.ensure("BTCUSDT", "4h");
    fetcher.mockRejectedValue(Object.assign(new Error("boom"), { status: 502 }));

    now += 60_000;
    await cache.ensure("BTCUSDT", "4h");
    expect(cache.read("BTCUSDT", "4h")).toEqual([candle(1, "100")]);
    expect(cache.isUnsupported("BTCUSDT", "4h")).toBe(false);

    fetcher.mockResolvedValue([candle(2, "200")]);
    now += 60_000;
    await cache.ensure("BTCUSDT", "4h");
    expect(cache.read("BTCUSDT", "4h")).toEqual([candle(2, "200")]);
  });

  it("forgets one symbol without touching another", async () => {
    await cache.ensure("BTCUSDT", "4h");
    await cache.ensure("ETHUSDT", "4h");

    cache.forgetSymbol("BTCUSDT");
    expect(cache.read("BTCUSDT", "4h")).toEqual([]);
    expect(cache.read("ETHUSDT", "4h")).toHaveLength(1);
  });

  it("re-fetches a symbol that was forgotten", async () => {
    await cache.ensure("BTCUSDT", "4h");
    cache.forgetSymbol("BTCUSDT");
    await cache.ensure("BTCUSDT", "4h");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
