
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { marketWatcher } from './marketWatcher';
import { apiService } from './apiService';
import { Decimal } from 'decimal.js';

// Mocks
vi.mock('../stores/market.svelte', () => ({
    marketState: {
        data: {},
        updateSymbolKlines: vi.fn(),
        connectionStatus: 'connected'
    }
}));

vi.mock('./apiService', () => ({
    apiService: {
        fetchBitunixKlines: vi.fn()
    }
}));

vi.mock('./storageService', () => ({
    storageService: {
        getKlines: vi.fn().mockResolvedValue([]),
        saveKlines: vi.fn()
    }
}));

describe('MarketWatcher Gap Handling & Resilience', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should fill small gaps in kline data', () => {
        const fillGaps = (marketWatcher as any).fillGaps.bind(marketWatcher);
        const intervalMs = 60000; // 1m

        // Use numbers as expected by KlineRawSchema
        const klines = [
            { time: 1000, close: 100, volume: 10, open: 100, high: 100, low: 100 },
            { time: 1000 + (intervalMs * 3), close: 105, volume: 10, open: 105, high: 105, low: 105 } // Gap of 2 missing candles
        ];

        const result = fillGaps(klines, intervalMs);

        // Expect: 1000, 1060 (filled), 1120 (filled), 1180 (original 2nd)
        expect(result.length).toBe(4);
        expect(result[1].time).toBe(1000 + intervalMs);
        expect(result[1].close).toBe("100"); // Filled with previous close (string)
        expect(result[1].volume).toBe("0");
    });

    it('should respect max gap fill limit', () => {
        const fillGaps = (marketWatcher as any).fillGaps.bind(marketWatcher);
        const intervalMs = 1000;
        const start = 0;
        const end = 1000 * 6000; // Huge gap

        const klines = [
            { time: start, close: 100, open: 100, high: 100, low: 100, volume: 10 },
            { time: end, close: 200, open: 200, high: 200, low: 200, volume: 20 }
        ];

        const result = fillGaps(klines, intervalMs);
        // MAX_GAP_FILL is 5000 in source
        // Result length will be 5000 (fills) + 2 (original) = 5002 roughly
        expect(result.length).toBeLessThan(6000);
        expect(result.length).toBeGreaterThan(5000);
    });

    it('should handle API failure gracefully during ensuring history', async () => {
        // Setup
        const symbol = 'BTCUSDT';
        const tf = '1m';
        (apiService.fetchBitunixKlines as any).mockRejectedValue(new Error('Network Error'));

        // Act
        // ensureHistory catches errors internally and returns false (or undefined depending on impl)
        const result = await marketWatcher.ensureHistory(symbol, tf);

        // Assert
        expect(result).toBe(false);
    });
});
