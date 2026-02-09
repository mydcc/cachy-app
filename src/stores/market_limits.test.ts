
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MarketManager, marketState } from './market.svelte';
import { Decimal } from 'decimal.js';
import { settingsState } from './settings.svelte';

// Mock settings
vi.mock('./settings.svelte', () => ({
    settingsState: {
        chartHistoryLimit: 100, // Small limit for testing
        marketCacheSize: 20
    }
}));

describe('MarketManager Limits', () => {
    beforeEach(() => {
        marketState.reset();
    });

    it('should allow history to grow beyond userLimit if explicitly loaded (enforceLimit=false)', () => {
        const symbol = 'BTCUSDT';
        const timeframe = '1m';

        // 1. Initial State (use rest with enforceLimit=true to simulate "normal" state)
        const initialBatch = Array.from({ length: 50 }, (_, i) => ({
            time: i * 60000,
            open: new Decimal(100), high: new Decimal(110), low: new Decimal(90), close: new Decimal(105), volume: new Decimal(1000)
        }));

        marketState.updateSymbolKlines(symbol, timeframe, initialBatch, 'rest', true);
        expect(marketState.data[symbol].klines[timeframe].length).toBe(50);

        // Check default maxHistoryLength initialization
        expect(marketState.data[symbol].maxHistoryLength).toBe(100); // Defaults to userLimit (100) if history < limit

        // 2. Load More (REST) - Add 200 items (total 250)
        // enforceLimit = false
        const historyBatch = Array.from({ length: 200 }, (_, i) => ({
            time: (i + 50) * 60000,
            open: new Decimal(100), high: new Decimal(110), low: new Decimal(90), close: new Decimal(105), volume: new Decimal(1000)
        }));

        marketState.updateSymbolKlines(symbol, timeframe, historyBatch, 'rest', false);

        expect(marketState.data[symbol].klines[timeframe].length).toBe(250);
        // maxHistoryLength should have updated to accommodate growth
        expect(marketState.data[symbol].maxHistoryLength).toBe(250);
    });

    it('should respect maxHistoryLength (High Water Mark) on subsequent WS updates', () => {
        const symbol = 'ETHUSDT';
        const timeframe = '1m';

        // 1. Load history (200 items) > userLimit (100)
        const historyBatch = Array.from({ length: 200 }, (_, i) => ({
            time: i * 60000,
            open: new Decimal(100), high: new Decimal(110), low: new Decimal(90), close: new Decimal(105), volume: new Decimal(1000)
        }));

        marketState.updateSymbolKlines(symbol, timeframe, historyBatch, 'rest', false);
        expect(marketState.data[symbol].klines[timeframe].length).toBe(200);
        expect(marketState.data[symbol].maxHistoryLength).toBe(200);

        // 2. WS Update (enforceLimit=true)
        // Use 'rest' to bypass buffer but set enforceLimit=true to simulate WS logic application
        const wsUpdate = [{
            time: 200 * 60000, // New candle
            open: new Decimal(100), high: new Decimal(110), low: new Decimal(90), close: new Decimal(105), volume: new Decimal(1000)
        }];

        marketState.updateSymbolKlines(symbol, timeframe, wsUpdate, 'rest', true);

        // Should NOT truncate to 100. Should keep 200 (capped at maxHistoryLength)
        // History length becomes 201 (200 old + 1 new)
        // effectiveLimit = max(200, 100) = 200.
        // slice(-200) -> keeps 200 items.
        expect(marketState.data[symbol].klines[timeframe].length).toBe(200);
    });
});
