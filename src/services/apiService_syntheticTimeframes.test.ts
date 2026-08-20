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
 * BUG-0231 regression guard: synthetic timeframes must not silently under-fetch.
 *
 * Non-native timeframes (3m, 6m, 10m, 12m, ...) are built by aggregating a
 * native base timeframe. The request asked for `limit * multiplier` base
 * candles in ONE call, but Bitunix truncates every response at 200 rows -- so a
 * 6m request funded by 1m candles came back with 200/6 = 33 candles no matter
 * what was asked for. RSI(14) still rendered on 33 candles; EMA 200 could not
 * exist. That is precisely the reported symptom: some indicators present, the
 * long-look-back ones missing, and only on non-standard timeframes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiService } from "./apiService";

vi.mock("./logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/** Minimal Response stand-in; apiService.safeJson insists on a JSON content-type. */
function jsonResponse(body: unknown): Response {
  const text = JSON.stringify(body);
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
    text: async () => text,
  } as unknown as Response;
}

/** Matches the exchange: never return more than this, whatever `limit` says. */
const EXCHANGE_ROW_CAP = 200;
const MINUTE = 60_000;

/** Newest candle time the fake exchange knows about. */
const NOW = 1_700_000_000_000;

/**
 * Fake Bitunix: serves 1-minute candles from an effectively unbounded history,
 * honours `endTime`, and truncates at the row cap like the real one.
 */
function installFakeExchange() {
  const calls: Array<{ interval: string; limit: number; endTime?: number }> = [];

  global.fetch = vi.fn(async (url: string) => {
    const params = new URL(url, "http://localhost").searchParams;
    const interval = params.get("interval")!;
    const limit = Number(params.get("limit"));
    const endTimeRaw = params.get("endTime");
    const endTime = endTimeRaw ? Number(endTimeRaw) : NOW;

    calls.push({ interval, limit, endTime: endTimeRaw ? endTime : undefined });

    const stepMs = interval === "1m" ? MINUTE : 5 * MINUTE;
    const rows = Math.min(limit, EXCHANGE_ROW_CAP);

    // Oldest -> newest, ending at endTime, exactly like the proxy normalises it.
    const out = [];
    for (let i = rows - 1; i >= 0; i--) {
      const time = Math.floor((endTime - i * stepMs) / stepMs) * stepMs;
      out.push({
        timestamp: time,
        open: "100", high: "101", low: "99", close: "100", volume: "1",
      });
    }

    return jsonResponse(out);
  }) as unknown as typeof fetch;

  return calls;
}

describe("fetchBitunixKlines - synthetic timeframes (BUG-0231)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pages the base timeframe so a 6m request actually returns ~600 candles", async () => {
    const calls = installFakeExchange();

    const klines = await apiService.fetchBitunixKlines("BTCUSDT", "6m", 600);

    // The assertion that matters: enough candles for EMA 200 to exist at all.
    // Without paging this was 200/6 = 33, which is why EMA 200 vanished on 6m
    // while RSI(14) still rendered. Exact counts depend on bucket alignment at
    // the window edges, so pin the order of magnitude.
    expect(klines.length).toBeGreaterThan(200);

    // 600 target candles x6 = 3600 base candles, served 200 at a time.
    expect(calls.every((c) => c.interval === "1m")).toBe(true);
    expect(calls.length).toBeGreaterThan(1);
  });

  it("keeps aggregated candles strictly ordered and free of duplicates", async () => {
    installFakeExchange();

    const klines = await apiService.fetchBitunixKlines("BTCUSDT", "6m", 600);

    const times = klines.map((k) => k.time);
    expect(times.length).toBeGreaterThan(200); // paged, not a single truncated page
    expect([...new Set(times)].length).toBe(times.length);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
    // Every bucket must sit on a 6m boundary.
    expect(times.every((t) => t % (6 * MINUTE) === 0)).toBe(true);
  });

  it("does not page a native timeframe that fits in one response", async () => {
    const calls = installFakeExchange();

    await apiService.fetchBitunixKlines("BTCUSDT", "5m", 200);

    expect(calls).toHaveLength(1);
    expect(calls[0].interval).toBe("5m");
  });

  it("stops walking when the exchange replays the same window", async () => {
    // Pathological upstream: ignores endTime, always returns the same rows.
    // The walk must terminate rather than loop for pagesNeeded iterations of
    // no progress -- and must never hang.
    let requests = 0;
    global.fetch = vi.fn(async () => {
      requests++;
      const out = Array.from({ length: EXCHANGE_ROW_CAP }, (_, i) => ({
        timestamp: NOW - (EXCHANGE_ROW_CAP - 1 - i) * MINUTE,
        open: "100", high: "101", low: "99", close: "100", volume: "1",
      }));
      return jsonResponse(out);
    }) as unknown as typeof fetch;

    const klines = await apiService.fetchBitunixKlines("BTCUSDT", "12m", 600);

    // One useful page, one that proves there is nothing new, then stop.
    expect(requests).toBeLessThanOrEqual(2);
    expect(klines.length).toBeGreaterThan(0);
  });
});
