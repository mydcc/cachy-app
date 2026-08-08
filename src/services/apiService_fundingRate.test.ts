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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Decimal } from "decimal.js";
import { apiService, requestManager } from "./apiService";

describe("apiService.fetchBitunixFundingRates", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    // fetchBitunixFundingRates uses a fixed request key ("FUNDING_RATE:bitunix:ALL")
    // since the batch endpoint isn't per-symbol - clear requestManager's 10s
    // success cache so each test hits the mocked fetch instead of a prior result.
    requestManager.clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns fundingRate as a fraction (not scaled), keyed by normalized symbol", async () => {
    const mockResponse = {
      code: 0,
      data: [
        {
          symbol: "BTCUSDT",
          markPrice: "60000",
          lastPrice: "60001",
          indexPrice: "60001",
          fundingRate: "0.0005",
          fundingInterval: 8,
          nextFundingTime: "1770710400000",
          maxFundingRate: "0.3",
          minFundingRate: "-0.3",
        },
      ],
      msg: "Success",
    };
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockResponse),
      headers: new Headers({ "content-type": "application/json" }),
    } as unknown as Response);

    const result = await apiService.fetchBitunixFundingRates();

    expect(result.get("BTCUSDT")).toEqual({
      fundingRate: new Decimal("0.0005"),
      nextFundingTime: "1770710400000",
      fundingInterval: 8,
    });
  });

  it("throws on a response missing the required fundingRate field", async () => {
    const mockResponse = {
      code: 0,
      data: [{ symbol: "BTCUSDT", nextFundingTime: "1770710400000" }],
      msg: "Success",
    };
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockResponse),
      headers: new Headers({ "content-type": "application/json" }),
    } as unknown as Response);

    await expect(apiService.fetchBitunixFundingRates()).rejects.toThrow();
  });

  it("throws when the HTTP request fails", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
    } as unknown as Response);

    await expect(apiService.fetchBitunixFundingRates()).rejects.toThrow();
  });
});
