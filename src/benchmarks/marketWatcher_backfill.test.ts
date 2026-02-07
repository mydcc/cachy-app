import { describe, it, expect, vi, beforeEach } from "vitest";
import { marketWatcher } from "../services/marketWatcher";
import { apiService } from "../services/apiService";
import { storageService } from "../services/storageService";

// Mock dependencies
vi.mock("../services/apiService");
vi.mock("../services/storageService");
vi.mock("../stores/market.svelte", () => ({
    marketState: {
        updateSymbolKlines: vi.fn(),
        data: {}
    }
}));
vi.mock("../stores/settings.svelte", () => ({
    settingsState: {
        apiProvider: "bitunix",
        chartHistoryLimit: 1000,
        capabilities: { marketData: true }
    }
}));
vi.mock("../services/logger");

describe("MarketWatcher History Backfill", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (marketWatcher as any).historyLocks = new Set();
    });

    it("ensureHistory should pass explicit endTime to apiService", async () => {
        const symbol = "BTCUSDT";
        const tf = "15m";

        vi.mocked(storageService.getKlines).mockResolvedValue([]);
        vi.mocked(apiService.fetchBitunixKlines).mockResolvedValue([
            { time: 1000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 } as any
        ]);

        await marketWatcher.ensureHistory(symbol, tf);

        // Expect fetchBitunixKlines to be called with explicit endTime (arg index 3)
        // fetchBitunixKlines(symbol, tf, limit, endTime, ...)
        expect(apiService.fetchBitunixKlines).toHaveBeenCalled();

        const callArgs = vi.mocked(apiService.fetchBitunixKlines).mock.calls[0];
        // Args: [symbol, tf, limit, endTime, startTime, priority, timeout]

        // We verify that arg[3] (endTime) is a number (Date.now() approx)
        // Currently it is likely undefined in the implementation

        const endTimeArg = callArgs[3];

        // This assertion will FAIL if endTime is undefined (which is current state)
        expect(endTimeArg).toBeDefined();
        expect(typeof endTimeArg).toBe("number");
    });
});
