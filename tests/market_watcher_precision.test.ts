
import { describe, it, expect, vi } from 'vitest';
import { Decimal } from 'decimal.js';

// Mock dependencies
vi.mock('$app/environment', () => ({ browser: false }));
vi.mock('../src/stores/settings.svelte', () => ({
    settingsState: {
        apiProvider: 'bitunix',
        chartHistoryLimit: 1000,
        capabilities: { marketData: true }
    }
}));
vi.mock('../src/stores/market.svelte', () => ({
    marketState: {
        data: {},
        updateSymbolKlines: vi.fn(),
        updateSymbol: vi.fn(),
        connectionStatus: 'disconnected'
    }
}));
vi.mock('../src/services/apiService', () => ({ apiService: {} }));
vi.mock('../src/services/storageService', () => ({ storageService: {} }));
vi.mock('../src/services/bitunixWs', () => ({ bitunixWs: {} }));

// Import Class (after mocks)
import { marketWatcher } from '../src/services/marketWatcher';

describe('MarketWatcher Precision', () => {
    it('fillGaps should preserve Decimal precision', () => {
        // Access private method
        const mw = marketWatcher as any;

        const start = 1000000;
        const interval = 60000;

        // Create 2 klines with a gap
        // k1 at T
        // k2 at T + 2*interval (Gap of 1 candle)
        const k1 = {
            time: start,
            open: new Decimal('1.123456789012345'),
            high: new Decimal('1.2'),
            low: new Decimal('1.1'),
            close: new Decimal('1.15'), // This should be carried forward
            volume: new Decimal('100')
        };

        const k2 = {
            time: start + (2 * interval),
            open: new Decimal('1.16'),
            high: new Decimal('1.3'),
            low: new Decimal('1.15'),
            close: new Decimal('1.25'),
            volume: new Decimal('200')
        };

        const input = [k1, k2];
        const result = mw.fillGaps(input, interval);

        expect(result.length).toBe(3); // k1, gap-fill, k2

        const filled = result[1];
        expect(filled.time).toBe(start + interval);

        // Check precision: The filled candle should have OPEN = K1.CLOSE
        expect(filled.open).toBeInstanceOf(Decimal);
        expect(filled.open.toString()).toBe('1.15');

        // Check reference safety (should share reference or be equal)
        // Implementation uses `open: prev.close` (reference copy)
        expect(filled.open).toBe(k1.close);

        // Volume should be ZERO_VOL (Decimal 0)
        expect(filled.volume.toNumber()).toBe(0);
    });
});
