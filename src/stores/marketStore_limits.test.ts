import { describe, it, expect, vi, beforeEach } from 'vitest';
import { marketState } from './market.svelte';

describe('MarketStore Resource Limits', () => {
    beforeEach(() => {
        marketState.reset();
        // Manually trigger cleanup if needed, but reset() should be enough for public state
    });

    it('should flush buffer when KLINE_BUFFER_HARD_LIMIT is reached', () => {
        const symbol = 'BTCUSDT';
        const timeframe = '1m';

        // Mock logger to avoid console spam
        // Note: The store uses console.warn in DEV for overflow
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        // Pump updates
        // KLINE_BUFFER_HARD_LIMIT is 2000.
        // We push 2500 updates.
        for (let i = 0; i < 2500; i++) {
            marketState.updateSymbolKlines(symbol, timeframe, [{
                open: 100 + i, high: 105 + i, low: 95 + i, close: 100 + i, volume: 1000, time: 100000 + i * 60000
            }], 'ws');
        }

        // Check if data was flushed to state
        // Since flushUpdates() is called synchronously when limit is hit,
        // we should see data in the store immediately.
        const klines = marketState.data[symbol]?.klines[timeframe] || [];

        // We expect at least the flushed chunk (2000 items) to be present
        expect(klines.length).toBeGreaterThanOrEqual(2000);

        consoleSpy.mockRestore();
    });
});
