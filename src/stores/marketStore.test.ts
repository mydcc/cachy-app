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
import { marketState } from "./market.svelte";
import { get } from "svelte/store";
import { Decimal } from "decimal.js";

describe("marketStore", () => {
  beforeEach(() => {
    marketState.reset();
  });

  it("should update symbol data correctly", () => {
    // Use updateSymbol directly as updateTicker is removed
    marketState.updateSymbol("BTCUSDT", {
      lastPrice: new Decimal("52000"),
      highPrice: new Decimal("53000"),
      lowPrice: new Decimal("49000"),
      volume: new Decimal("1000"),
      quoteVolume: new Decimal("52000000"),
      priceChangePercent: new Decimal("4"),
    });

    const data = marketState.data["BTCUSDT"];

    expect(data).toBeDefined();
    expect(data.lastPrice?.toNumber()).toBe(52000);
    expect(data.highPrice?.toNumber()).toBe(53000);
    expect(data.lowPrice?.toNumber()).toBe(49000);
    expect(data.volume?.toNumber()).toBe(1000);
    expect(data.quoteVolume?.toNumber()).toBe(52000000);
    expect(data.priceChangePercent?.toNumber()).toBe(4);
  });
});
