import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { technicalsService } from "./technicalsService";
import { Decimal } from "decimal.js";
import { getEmptyData } from "../utils/technicalsCalculator";
import { indicatorState } from "../stores/indicator.svelte";

// Mock worker to force inline calculation or test worker logic
// Since we are testing the service, and the service tries to instantiate a Worker
// which might fail in test environment, we expect it to fallback or we can mock it.
// For simplicity in unit tests, we often test the inline logic or mock the worker manager.

describe("technicalsService", () => {
  const klines = Array.from({ length: 100 }, (_, i) => ({
    time: 1600000000000 + i * 60000,
    open: new Decimal(100 + i),
    high: new Decimal(105 + i),
    low: new Decimal(95 + i),
    close: new Decimal(102 + i),
    volume: new Decimal(1000),
  }));

  it("should calculate new oscillators correctly", async () => {
    const result = await technicalsService.calculateTechnicals(klines);

    expect(result).toBeDefined();
    expect(result.oscillators.length).toBeGreaterThan(0);

    const rsi = result.oscillators.find((o) => o.name === "RSI");
    expect(rsi).toBeDefined();
    expect(typeof rsi?.value).toBe("number");
    // RSI should be calculable for 100 candles
    expect(rsi!.value).not.toBeNaN();

    const cci = result.oscillators.find((o) => o.name === "CCI");
    expect(cci).toBeDefined();
    expect(typeof cci?.value).toBe("number");

    const adx = result.oscillators.find((o) => o.name === "ADX");
    expect(adx).toBeDefined();
  });

  it("should respect custom settings", async () => {
    const customSettings = {
      ...indicatorState,
      rsi: { length: 20, source: "close", overbought: 80, oversold: 20 },
    };

    const result = await technicalsService.calculateTechnicals(
      klines,
      customSettings,
    );
    const rsi = result.oscillators.find((o) => o.name === "RSI");
    expect(rsi?.params).toBe("20");
  });
});
