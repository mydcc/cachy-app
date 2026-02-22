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


import { describe, it, expect } from "vitest";
import { DivergenceScanner, type DivergenceResult } from "./divergenceScanner";
import { Decimal } from "decimal.js";

describe("DivergenceScanner", () => {
  it("should deduplicate divergences and keep the widest one", () => {
    // Construct synthetic data
    // Length 50
    // Price makes Lower Lows: 100 -> 95 -> 90
    // Indicator makes Higher Lows: 30 -> 35 -> 40

    const length = 50;
    const priceLows = new Array(length).fill(110); // Default high
    const indicatorValues = new Array(length).fill(50); // Default neutral
    const priceHighs = new Array(length).fill(120); // Irrelevant for bullish

    // Set Pivots (surrounded by higher values to be pivots)
    // T-0 is index 45 (leave room for pivot confirmation)
    const idx0 = 45;
    const idx1 = 35; // T-10
    const idx2 = 25; // T-20

    // Price: Lower Lows
    priceLows[idx2] = 100;
    priceLows[idx1] = 95;
    priceLows[idx0] = 90;

    // Indicator: Higher Lows
    indicatorValues[idx2] = 30;
    indicatorValues[idx1] = 35;
    indicatorValues[idx0] = 40;

    // Run Scan
    const results = DivergenceScanner.scan(
      priceHighs,
      priceLows,
      indicatorValues,
      "RSI"
    );

    // Filter for results ending at idx0
    const duplicates = results.filter(r => r.endIdx === idx0 && r.side === "Bullish" && r.type === "Regular");

    // Expect exactly 1 result (deduplicated)
    expect(duplicates.length).toBe(1);

    // Verify it selected the WIDEST one (startIdx = idx2 = 25)
    // idx2 is the oldest pivot (furthest from idx0), representing the longest/strongest divergence
    expect(duplicates[0].startIdx).toBe(idx2);
    expect(duplicates[0].endIdx).toBe(idx0);
  });

  it("should not deduplicate divergences from different indicators with same pivots", () => {
    // Bug 5 Regression: RSI and CCI sharing the same pivot pairs should BOTH be returned
    const length = 50;
    const priceHighs = new Array(length).fill(100);
    const priceLows = new Array(length).fill(100);
    const mockRsi = new Array(length).fill(50);
    const mockCci = new Array(length).fill(0);

    // Create a regular bullish divergence scenario
    priceLows[20] = 90;
    priceLows[40] = 80;

    mockRsi[20] = 30;
    mockRsi[40] = 40;

    mockCci[20] = -150;
    mockCci[40] = -100;

    const rsiResults = DivergenceScanner.scan(priceHighs, priceLows, mockRsi, "RSI");
    const cciResults = DivergenceScanner.scan(priceHighs, priceLows, mockCci, "CCI");

    const allResults = [...rsiResults, ...cciResults];

    // Identify standard Regular Bullish divergences ending at index 40
    const relevant = allResults.filter(r => r.endIdx === 40 && r.type === "Regular" && r.side === "Bullish");

    // We expect both RSI and CCI to produce a valid divergence
    expect(relevant.length).toBe(2);
    expect(relevant.some(r => r.indicator === "RSI")).toBe(true);
    expect(relevant.some(r => r.indicator === "CCI")).toBe(true);
  });
});
