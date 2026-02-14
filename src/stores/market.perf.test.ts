
import { describe, it, expect } from 'vitest';
import { marketState } from './market.svelte';
import { Decimal } from 'decimal.js';
import type { Kline } from '../services/technicalsTypes';

describe('MarketManager Performance', () => {
    it('should handle high-frequency kline updates efficiently', async () => {
        const symbol = 'BTCUSDT';
        const timeframe = '1m';
        const BATCH_SIZE = 10000;

        // Generate mock data
        const klines: Kline[] = [];
        const start = Date.now();
        for (let i = 0; i < BATCH_SIZE; i++) {
            klines.push({
                time: start + i * 60000,
                open: new Decimal(50000 + i),
                high: new Decimal(50100 + i),
                low: new Decimal(49900 + i),
                close: new Decimal(50050 + i),
                volume: new Decimal(100)
            });
        }

        // Measure execution time
        const t0 = performance.now();
        marketState.updateSymbolKlines(symbol, timeframe, klines, 'rest');
        const t1 = performance.now();

        console.log(`Processed ${BATCH_SIZE} klines in ${(t1 - t0).toFixed(2)}ms`);

        // Assertions
        const stored = marketState.data[symbol].klines[timeframe];
        // Note: The store might slice it based on settings, but safety limit is 50000.
        // If settingsState.chartHistoryLimit is default (e.g. 2000), it will be sliced.
        // But the processing of 10k items happened.

        expect(stored.length).toBeGreaterThan(0);
        expect(t1 - t0).toBeLessThan(2000); // Generous limit for CI
    });
});
