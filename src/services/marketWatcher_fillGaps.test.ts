
import { describe, it, expect, vi } from 'vitest';
import { marketWatcher } from './marketWatcher';
import { marketState } from '../stores/market.svelte';

// Mock dependencies
vi.mock('./bitunixWs', () => ({ bitunixWs: { subscribe: vi.fn(), unsubscribe: vi.fn(), pendingSubscriptions: new Map() } }));
vi.mock('./apiService', () => ({ apiService: { fetchBitunixKlines: vi.fn() } }));
vi.mock('../stores/settings.svelte', () => ({ settingsState: { apiProvider: 'bitunix', capabilities: { marketData: true } } }));
vi.mock('../stores/market.svelte', () => ({
    marketState: {
        data: {},
        updateSymbolKlines: vi.fn(),
        updateSymbol: vi.fn(),
        connectionStatus: 'connected'
    }
}));
vi.mock('./logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() } }));
vi.mock('./storageService', () => ({ storageService: { getKlines: vi.fn(), saveKlines: vi.fn() } }));
vi.mock('./activeTechnicalsManager.svelte', () => ({ activeTechnicalsManager: { forceRefresh: vi.fn() } }));

describe('MarketWatcher Data Integrity', () => {
    it('fillGaps should fill missing candles with flat candles', () => {
        const intervalMs = 60000; // 1m
        const start = 1000000000000;

        const klines = [
            { time: start, open: "100", high: "105", low: "95", close: "102", volume: "10" },
            // Gap of 2 minutes (missing T+1m, T+2m)
            { time: start + 3 * intervalMs, open: "103", high: "108", low: "100", close: "106", volume: "15" }
        ];

        // Access private method
        const filled = (marketWatcher as any).fillGaps(klines, intervalMs);

        // Expected:
        // 0: T
        // 1: T+1m (Filled, flat from prev close 102)
        // 2: T+2m (Filled, flat from prev close 102)
        // 3: T+3m (Original)

        expect(filled.length).toBe(4);

        // Check Gap 1
        expect(filled[1].time).toBe(start + intervalMs);
        expect(filled[1].open).toBe("102");
        expect(filled[1].close).toBe("102");
        expect(filled[1].volume).toBe("0");

        // Check Gap 2
        expect(filled[2].time).toBe(start + 2 * intervalMs);
        expect(filled[2].open).toBe("102");
        expect(filled[2].close).toBe("102");
        expect(filled[2].volume).toBe("0");

        // Check Original
        expect(filled[3]).toEqual(klines[1]);
    });

    it('fillGaps should handle unsorted input safely', () => {
        // Current implementation assumes sorted input.
        // If unsorted (descending), it should just return the array without infinite loop.
        const intervalMs = 60000;
        const start = 1000000000000;

        const klines = [
            { time: start + 60000, close: "100" },
            { time: start, close: "100" }
        ] as any[];

        const filled = (marketWatcher as any).fillGaps(klines, intervalMs);

        // Should not hang and return same length (no gaps filled because diff is negative)
        expect(filled.length).toBe(2);
    });
});
