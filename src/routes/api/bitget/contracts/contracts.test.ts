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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./+server";
import { cache } from "#lib/server/cache.js";

beforeEach(() => {
  cache.clear();
});

const contractsResponse = () =>
  ({
    ok: true,
    text: async () =>
      JSON.stringify({
        code: "00000",
        msg: "success",
        data: [{ symbol: "BTCUSDT" }, { symbol: "ETHUSDT" }],
      }),
  }) as unknown as Response;

describe("GET /api/bitget/contracts symbol filtering", () => {
  it("normalises the legacy _UMCBL suffix before sanitising", async () => {
    const mockFetch = vi.fn().mockResolvedValue(contractsResponse());
    const url = new URL(
      "http://localhost/api/bitget/contracts?symbols=btcusdt_umcbl",
    );

    const response = await GET({
      url,
      fetch: mockFetch,
    } as unknown as Parameters<typeof GET>[0]);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([{ symbol: "BTCUSDT" }]);
  });

  it("refuses a filter that sanitises to nothing", async () => {
    const mockFetch = vi.fn();
    const url = new URL("http://localhost/api/bitget/contracts?symbols=%26%26");

    const response = await GET({
      url,
      fetch: mockFetch,
    } as unknown as Parameters<typeof GET>[0]);

    expect(response.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
