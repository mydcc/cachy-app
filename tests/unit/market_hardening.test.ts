import { describe, it, expect, vi } from 'vitest';
import { MarketManager } from '../../src/stores/market.svelte';
import { Decimal } from 'decimal.js';
import { isPriceData, isTickerData } from '../../src/services/bitunixWs';

// Mock browser env
vi.stubGlobal('browser', false);

// Mock settingsState
vi.mock('../../src/stores/settings.svelte', () => ({
    settingsState: {
        marketCacheSize: 20,
        chartHistoryLimit: 2000,
        capabilities: { marketData: true }
    }
}));

// Mock logger
vi.mock('../../src/services/logger', () => ({
    logger: {
        warn: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        debug: vi.fn()
    }
}));

// Mock diagnose tool
vi.mock('../../src/utils/diagnose_bitunix_flow', () => ({
    getDiagnosticInstance: () => null
}));

describe('Market Hardening Tests', () => {

    describe('MarketStore Merge Optimization', () => {
        it('should correctly merge and slice large datasets using reverse merge', () => {
            const market = new MarketManager();
            const symbol = 'BTCUSDT';
            const tf = '1m';

            // 1. Init history with 5000 items
            const history = Array.from({ length: 5000 }, (_, i) => ({
                time: i * 60000,
                open: new Decimal(100), high: new Decimal(100), low: new Decimal(100), close: new Decimal(100), volume: new Decimal(100)
            }));

            // Force REST update to set initial state
            market.updateSymbolKlines(symbol, tf, history, 'rest', false); // No limit enforcement yet

            // 2. Simulate WS update with 100 new items (overlap + new)
            // Overlap last 10 items (indices 4990 to 4999), add 90 new (indices 5000 to 5089)
            // Time range: 4990*60000 to 5089*60000
            const newKlines = Array.from({ length: 100 }, (_, i) => ({
                time: (4990 + i) * 60000,
                open: new Decimal(200), high: new Decimal(200), low: new Decimal(200), close: new Decimal(200), volume: new Decimal(200)
            }));

            // Trigger "Slow Path" (via 'rest' to bypass buffer and force immediate merge)
            market.updateSymbolKlines(symbol, tf, newKlines, 'rest', true);

            const result = market.data[symbol].klines[tf];

            // Limit Logic: effectiveLimit = max(previousLength=5000, userLimit=2000) = 5000.
            // So result length should be 5000.
            expect(result.length).toBe(5000);

            // Check content: last item should be from newKlines (200)
            const last = result[result.length - 1];
            expect(last.close.toNumber()).toBe(200);
            expect(last.time).toBe((4990 + 99) * 60000);

            // Check overlapped update: time 4990 should be updated to 200
            const updated = result.find(k => k.time === 4990 * 60000);
            expect(updated).toBeDefined();
            expect(updated?.close.toNumber()).toBe(200);

            // Check very old data is gone (sliced off)
            // We had 5000 items. Added 90 unique items.
            // To keep 5000, we must drop the oldest 90.
            // Original history[0].time was 0. history[90].time was 90 * 60000.
            const first = result[0];
            expect(first.time).toBe(90 * 60000);
        });
    });

    describe('BitunixWS Fast Path Hardening', () => {
        it('should reject malformed numeric strings in isPriceData', () => {
            const badData = {
                ip: "NaN",
                fr: "0.01"
            };
            expect(isPriceData(badData)).toBe(false);

            const goodData = {
                ip: "100.50",
                fr: "0.01"
            };
            expect(isPriceData(goodData)).toBe(true);

            const infinityData = {
                ip: "Infinity",
                fr: "0.01"
            };
            expect(isPriceData(infinityData)).toBe(false);

             const emptyData = {
                ip: "",
                fr: "0.01"
            };
            expect(isPriceData(emptyData)).toBe(false);
        });

        it('should reject malformed numeric strings in isTickerData', () => {
             const badData = {
                 lastPrice: "NaN",
                 volume: "100"
             };
             expect(isTickerData(badData)).toBe(false);

             const emptyData = {
                 lastPrice: "",
                 volume: "100"
             };
             expect(isTickerData(emptyData)).toBe(false);

             const infinityData = {
                 lastPrice: "-Infinity",
                 volume: "100"
             };
             expect(isTickerData(infinityData)).toBe(false);
        });
    });
});
