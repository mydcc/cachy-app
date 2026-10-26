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

describe("GET /api/position-tiers symbol sanitising", () => {
  it("strips parameter separators before the upstream call", async () => {
    const mockFetch = vi.fn().mockResolvedValue(upstreamOk());
    const url = new URL(
      "http://localhost/api/position-tiers?symbol=BTCUSDT%26limit%3D999",
    );

    const response = await GET({
      url,
      fetch: mockFetch,
    } as unknown as Parameters<typeof GET>[0]);

    expect(response.status).toBe(200);
    const [upstreamUrl] = mockFetch.mock.calls[0];
    expect(upstreamUrl).toBe(
      "https://fapi.bitunix.com/api/v1/futures/position/get_position_tiers?symbol=BTCUSDTLIMIT999",
    );
    expect(upstreamUrl).not.toContain("&limit=");
  });

  it("refuses a symbol that sanitises to nothing", async () => {
    const mockFetch = vi.fn();
    const url = new URL("http://localhost/api/position-tiers?symbol=%26%26");

    const response = await GET({
      url,
      fetch: mockFetch,
    } as unknown as Parameters<typeof GET>[0]);

    expect(response.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("uses the sanitised symbol as the cache key, not the raw input", async () => {
    const mockFetch = vi.fn().mockResolvedValue(upstreamOk());

    await GET({
      url: new URL("http://localhost/api/position-tiers?symbol=BTCUSDT%26x%3D1"),
      fetch: mockFetch,
    } as unknown as Parameters<typeof GET>[0]);
    await GET({
      url: new URL("http://localhost/api/position-tiers?symbol=btcusdtx1"),
      fetch: mockFetch,
    } as unknown as Parameters<typeof GET>[0]);

    // Both sanitise to BTCUSDTX1; the second is a cache hit.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
