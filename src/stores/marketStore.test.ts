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

import { describe, it, expect, beforeEach } from "vitest";
import { marketStore } from "./marketStore";
import { get } from "svelte/store";
import { Decimal } from "decimal.js";

describe("marketStore", () => {
  beforeEach(() => {
    marketStore.reset();
  });

  it("should have updateTicker function", () => {
    expect(typeof marketStore.updateTicker).toBe("function");
  });

  it("should update ticker data correctly", () => {
    // Test with ticker update (includes open price for % calc)
    marketStore.updateTicker("BTCUSDT", {
      lastPrice: "52000",
      high: "53000",
      low: "49000",
      vol: "1000",
      quoteVol: "52000000",
      change: "0.04",
      open: "50000",
    });

    const store = get(marketStore);
    const data = store["BTCUSDT"];

    expect(data).toBeDefined();
    expect(data.lastPrice?.toNumber()).toBe(52000);
    expect(data.highPrice?.toNumber()).toBe(53000);
    expect(data.lowPrice?.toNumber()).toBe(49000);
    expect(data.volume?.toNumber()).toBe(1000);
    expect(data.quoteVolume?.toNumber()).toBe(52000000);

    // Change calculation: (52000 - 50000) / 50000 * 100 = 4%
    expect(data.priceChangePercent?.toNumber()).toBe(4);
  });
});
