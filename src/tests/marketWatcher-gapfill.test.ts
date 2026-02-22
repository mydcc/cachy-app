
import { describe, it, expect } from 'vitest';
import { marketWatcher } from '../services/marketWatcher';
import { Decimal } from 'decimal.js';

// Access private method
const fillGaps = (marketWatcher as any).fillGaps.bind(marketWatcher);

describe('MarketWatcher fillGaps Hardening', () => {
    const intervalMs = 60000; // 1m

    it('handles empty or null inputs', () => {
        expect(fillGaps([], intervalMs)).toEqual([]);
        // Returns empty array for null, not null
        expect(fillGaps(null, intervalMs)).toEqual([]);
    });

    it('handles single candle', () => {
        const candles = [{ time: 1000, open: new Decimal(1), high: new Decimal(2), low: new Decimal(0.5), close: new Decimal(1.5), volume: new Decimal(100) }];
        const result = fillGaps(candles, intervalMs);
        expect(result).toHaveLength(1);
        expect(result[0].time).toBe(1000);
    });

    it('fills missing candles correctly', () => {
        const start = 100000;
        const end = start + (intervalMs * 3); // Gap of 2 missing candles (T0, T3 -> missing T1, T2)

        const c1 = { time: start, open: new Decimal(100), high: new Decimal(110), low: new Decimal(90), close: new Decimal(105), volume: new Decimal(1000) };
        const c2 = { time: end, open: new Decimal(106), high: new Decimal(115), low: new Decimal(100), close: new Decimal(110), volume: new Decimal(2000) };

        const result = fillGaps([c1, c2], intervalMs);

        // Should have T0, T1, T2, T3 (4 candles)
        expect(result).toHaveLength(4);

        // T1
        expect(result[1].time).toBe(start + intervalMs);
        expect(result[1].open.toString()).toBe("105"); // Flat line from prev close
        expect(result[1].close.toString()).toBe("105");
        expect(result[1].volume.toNumber()).toBe(0); // Zero volume

        // T2
        expect(result[2].time).toBe(start + (intervalMs * 2));
        expect(result[2].close.toString()).toBe("105");
    });

    it('filters out invalid timestamps', () => {
        const c1 = { time: 1000, open: new Decimal(100), close: new Decimal(100) };
        const c2 = { time: NaN, open: new Decimal(100), close: new Decimal(100) }; // Invalid
        const c3 = { time: 1000 + intervalMs, open: new Decimal(100), close: new Decimal(100) };

        const result = fillGaps([c1, c2, c3], intervalMs);

        // Should filter out c2 (NaN) and return c1, c3
        // Since c3 is 1 interval after c1, no gap fill needed.
        expect(result).toHaveLength(2);
        expect(result[0].time).toBe(1000);
        expect(result[1].time).toBe(1000 + intervalMs);
    });
});
