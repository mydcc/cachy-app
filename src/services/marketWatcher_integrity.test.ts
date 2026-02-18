import { describe, it, expect, vi } from 'vitest';
import { marketWatcher } from './marketWatcher';
import { Decimal } from 'decimal.js';

describe('MarketWatcher Data Integrity', () => {
    // Access private method
    const fillGaps = (marketWatcher as any).fillGaps.bind(marketWatcher);

    it('should sort unsorted klines before filling gaps', () => {
        const intervalMs = 60000; // 1 minute
        const baseTime = 1000000;

        // Unsorted input: T+2, T+0, T+1
        const input = [
            {
                time: baseTime + intervalMs * 2,
                open: new Decimal(100), high: new Decimal(105), low: new Decimal(95), close: new Decimal(102), volume: new Decimal(1000)
            },
            {
                time: baseTime,
                open: new Decimal(100), high: new Decimal(105), low: new Decimal(95), close: new Decimal(100), volume: new Decimal(1000)
            },
            {
                time: baseTime + intervalMs,
                open: new Decimal(100), high: new Decimal(105), low: new Decimal(95), close: new Decimal(101), volume: new Decimal(1000)
            }
        ];

        // The current implementation (before fix) iterates linearly.
        // If unsorted:
        // 1. prev=T+2. curr=T. diff = -2 mins. No gap detected (diff < threshold).
        // 2. prev=T. curr=T+1. diff = 1 min. No gap detected.
        // Result order: T+2, T, T+1. Still unsorted.

        const result = fillGaps(input, intervalMs);

        // Check if sorted
        expect(result[0].time).toBe(baseTime);
        expect(result[1].time).toBe(baseTime + intervalMs);
        expect(result[2].time).toBe(baseTime + intervalMs * 2);
    });

    it('should handle duplicates gracefully if sorting is added', () => {
        const intervalMs = 60000;
        const baseTime = 1000000;
        const input = [
            { time: baseTime, open: new Decimal(100), high: new Decimal(100), low: new Decimal(100), close: new Decimal(100), volume: new Decimal(0) },
            { time: baseTime, open: new Decimal(100), high: new Decimal(100), low: new Decimal(100), close: new Decimal(100), volume: new Decimal(0) }
        ];

        const result = fillGaps(input, intervalMs);
        // Expect duplicates to remain or be handled? Sorting doesn't remove duplicates.
        // Ideally we should probably dedupe too, but sorting is the primary goal here.
        expect(result.length).toBeGreaterThanOrEqual(2);
        expect(result[0].time).toBe(baseTime);
        expect(result[1].time).toBe(baseTime);
    });
});
