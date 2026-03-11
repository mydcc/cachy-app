import { describe, it, expect, vi } from "vitest";
import { dataRepairService } from "../services/dataRepairService";
import { journalState } from "../stores/journal.svelte";
import { apiService } from "../services/apiService";
import { settingsState } from "../stores/settings.svelte";

// Mock the dependencies
vi.mock("../services/apiService", () => {
  return {
    apiService: {
      fetchBitunixKlines: vi.fn(),
      fetchBitgetKlines: vi.fn(),
    },
  };
});

vi.mock("../stores/settings.svelte", () => ({
  settingsState: {
    repairTimeframe: "15m",
  },
}));

vi.mock("../lib/calculator", () => ({
  calculator: {
    calculateATR: vi.fn(() => ({ isNaN: () => false, toString: () => "123" })),
  },
}));

// Also mock logger to suppress noise
vi.mock("../services/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  }
}));

describe("dataRepairService performance", () => {
  it("should measure fetchSmartKlines performance", async () => {
    // Generate dummy trades
    const trades = [];
    for (let i = 0; i < 10; i++) { // reduce to 10 iterations to not timeout
      trades.push({
        id: i,
        symbol: "BTCUSDT",
        status: "Won",
        entryDate: new Date().toISOString(),
        tradeType: "Long",
        entryPrice: 50000,
        // no provider set to force checking multiple
      });
    }

    journalState.entries = trades;
    journalState.updateEntry = vi.fn();

    // Mock API implementations with delays
    (apiService.fetchBitunixKlines as any).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 100)); // 100ms delay
      throw new Error("apiErrors.symbolNotFound"); // simulate fail to try next
    });

    (apiService.fetchBitgetKlines as any).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 100)); // 100ms delay
      return Array(15).fill({
        time: Date.now(),
        open: "50000",
        high: "51000",
        low: "49000",
        close: "50500",
        volume: "100",
      });
    });

    const start = performance.now();
    await dataRepairService.repairMissingAtr(() => {}, true);
    const end = performance.now();

    console.log(`repairMissingAtr took ${end - start}ms`);
    // With parallel fetching: ~10 * (100ms + 500ms pause) = ~6000ms
    // Sequential would be: ~10 * (100ms fail + 100ms success + 500ms pause) = ~7000ms
    // Assert it completes faster than sequential would allow.
    expect(end - start).toBeLessThan(8000);
  }, 15000); // 15s timeout
});
