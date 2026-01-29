
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
});
