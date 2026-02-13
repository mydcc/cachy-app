
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { marketWatcher } from './marketWatcher';
import { logger } from './logger';

// Mock dependencies
vi.mock('./logger', () => ({
    logger: {
        warn: vi.fn(),
        log: vi.fn(),
        error: vi.fn(),
    }
}));

// We need to access private methods for performance testing 'fillGaps'
// Since we cannot easily import the private method, we can test it indirectly
// OR use 'any' casting if the instance exposes it.
// Given previous context, we can assume we can access it via prototype or instance for testing.

describe('MarketWatcher Performance', () => {

    it('fillGaps should handle large gaps efficiently', () => {
        const gapSize = 10000;
        const intervalMs = 60000; // 1 min

        // Create 2 klines separated by a large gap
        const klines = [
            { time: 1000000000000, open: "100", high: "100", low: "100", close: "100", volume: "100" },
            { time: 1000000000000 + (gapSize * intervalMs), open: "200", high: "200", low: "200", close: "200", volume: "200" }
        ];

        const start = performance.now();
        // @ts-ignore
        const filled = marketWatcher.fillGaps(klines, intervalMs);
        const end = performance.now();

        // Should fill up to MAX_GAP_FILL (5000)
        expect(filled.length).toBeGreaterThan(4000);
        expect(end - start).toBeLessThan(50); // Should be very fast (<50ms)

        // Verify structure of filled gap
        const gapKline = filled[1];
        expect(gapKline.volume).toBe("0"); // Using "0" string
        expect(gapKline.open).toBe("100"); // Carry over close
    });

    it('fillGaps should bail out on invalid interval', () => {
         const klines = [
            { time: 1000000000000, open: "100", high: "100", low: "100", close: "100", volume: "100" },
            { time: 1000000000000 + 60000, open: "200", high: "200", low: "200", close: "200", volume: "200" }
        ];

        // @ts-ignore
        const result = marketWatcher.fillGaps(klines, 0);
        expect(result).toHaveLength(2); // No change
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("market"), expect.stringContaining("Invalid intervalMs"), 0);
    });
});
