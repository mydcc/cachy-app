import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MarketManager } from "./market.svelte";
import { settingsState } from "./settings.svelte";

// Mock browser
vi.mock("$app/environment", () => ({
  browser: true,
  dev: true
}));

describe("MarketManager Resource Limits", () => {
  let marketState: MarketManager;

  beforeEach(() => {
    vi.useFakeTimers();
    // Default cache size is 20
    settingsState.marketCacheSize = 20;
    marketState = new MarketManager();
  });

  afterEach(() => {
    marketState.destroy();
    vi.useRealTimers();
  });

  it("should force flush pending updates when buffer limit is exceeded", () => {
    // Limit is cacheSize * 5 = 100
    const limit = 20 * 5;

    // Fill up to limit
    for (let i = 0; i < limit; i++) {
        marketState.updateSymbol(`SYM${i}`, { lastPrice: "100" });
    }

    // Should still have pending updates (not flushed yet)
    // Access private property for testing via casting
    expect((marketState as any).pendingUpdates.size).toBe(limit);

    // Push one more to trigger force flush
    marketState.updateSymbol(`SYM_OVERFLOW`, { lastPrice: "100" });

    // Should be flushed now
    expect((marketState as any).pendingUpdates.size).toBe(0);
    expect(marketState.data["SYM_OVERFLOW"]).toBeDefined();
  });

  it("should force flush pending kline updates when limit is exceeded", () => {
      // Kline buffer hard limit is 2000 per symbol-timeframe key
      // But we also check total SYMBOLS pending limit: cacheSize * 10 = 200

      const limit = 20 * 10;

      for (let i = 0; i < limit; i++) {
          marketState.updateSymbolKlines(`SYM${i}`, "1m", [{ time: 1000, open: 1, high: 2, low: 1, close: 2, volume: 10 }], "ws");
      }

      // Check pending size
      expect((marketState as any).pendingKlineUpdates.size).toBe(limit);

      // Push one more
      marketState.updateSymbolKlines(`SYM_OVERFLOW`, "1m", [{ time: 1000, open: 1, high: 2, low: 1, close: 2, volume: 10 }], "ws");

      // Should be flushed
      expect((marketState as any).pendingKlineUpdates.size).toBe(0);
  });
});
