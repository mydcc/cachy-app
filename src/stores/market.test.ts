
import { describe, it, expect, beforeEach } from "vitest";
import { marketState } from "./market.svelte";
import { Decimal } from "decimal.js";

describe("marketStore Partial Updates", () => {
  beforeEach(() => {
    marketState.reset();
  });

  it("should not crash on partial update (missing open/high/low)", () => {
    // Initial update to set some state
    marketState.updateTicker("BTCUSDT", {
      lastPrice: "50000",
      open: "49000", // Change is roughly 2%
    });

    // Partial update: Only price changed
    // This used to crash because it tried new Decimal(undefined) for high, low, etc.
    expect(() => {
        marketState.updateTicker("BTCUSDT", {
            lastPrice: "50100"
        });
    }).not.toThrow();

    const data = marketState.data["BTCUSDT"];
    expect(data.lastPrice?.toNumber()).toBe(50100);
    // Should preserve previous open if we didn't overwrite it?
    // Actually marketState.updateSymbol overwrites only fields present in partial.
    // So 'open' isn't in MarketData interface strictly (only in klines), but 'priceChangePercent' is.

    // In the second update, we didn't provide 'open' or 'change'.
    // So 'priceChangePercent' update logic:
    // Fallback requires data.open. It's missing.
    // So priceChangePercent should remain what it was (from first update), or be undefined in the update object (so not touched).
    // The previous update calculated it. The partial update doesn't touch it.
    // Ideally it would recalculate based on new lastPrice and OLD open, but current logic relies on data.open being passed.
    // This is acceptable for now to avoid crash.
  });

  it("should use explicit change rate if provided", () => {
    marketState.updateTicker("BTCUSDT", {
        lastPrice: "50000",
        change: "0.05" // 5%
    });

    const data = marketState.data["BTCUSDT"];
    expect(data.priceChangePercent?.toNumber()).toBe(5);
  });
});
