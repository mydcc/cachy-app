/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./+server";
import { cache } from "#lib/server/cache.js";

const upstreamOk = () =>
  ({
    ok: true,
    text: async () => JSON.stringify({ code: 0, data: [] }),
  }) as unknown as Response;

beforeEach(() => {
  cache.clear();
});

describe("GET /api/trading-pairs symbol sanitising", () => {
  it("strips parameter separators from the symbol list", async () => {
    const mockFetch = vi.fn().mockResolvedValue(upstreamOk());
    const url = new URL(
      "http://localhost/api/trading-pairs?symbols=BTCUSDT,ETHUSDT%26admin%3D1",
    );

    const response = await GET({
      url,
      fetch: mockFetch,
    } as unknown as Parameters<typeof GET>[0]);

    expect(response.status).toBe(200);
    const [upstreamUrl] = mockFetch.mock.calls[0];
    expect(upstreamUrl).toBe(
      "https://fapi.bitunix.com/api/v1/futures/market/trading_pairs?symbols=BTCUSDT,ETHUSDTADMIN1",
    );
    expect(upstreamUrl).not.toContain("&admin=");
  });

  it("refuses a filter that sanitises to nothing instead of returning all pairs", async () => {
    const mockFetch = vi.fn();
    const url = new URL("http://localhost/api/trading-pairs?symbols=%26%26");

    const response = await GET({
      url,
      fetch: mockFetch,
    } as unknown as Parameters<typeof GET>[0]);

    expect(response.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("keeps the unfiltered key separate from an explicit filter", async () => {
    const mockFetch = vi.fn().mockResolvedValue(upstreamOk());

    await GET({
      url: new URL("http://localhost/api/trading-pairs"),
      fetch: mockFetch,
    } as unknown as Parameters<typeof GET>[0]);
    await GET({
      url: new URL("http://localhost/api/trading-pairs?symbols=ALL"),
      fetch: mockFetch,
    } as unknown as Parameters<typeof GET>[0]);

    // `ALL` is a valid symbol alphabet string; it must not alias the
    // "no filter" entry and serve its cached answer to every caller.
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
