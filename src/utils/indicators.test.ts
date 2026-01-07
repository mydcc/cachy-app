import { describe, it, expect } from 'vitest';
import { indicators } from './indicators';
import { Decimal } from 'decimal.js';

describe('indicators', () => {
    describe('calculateRSI', () => {
        it('should return null if insufficient data', () => {
            const prices = [1, 2, 3, 4, 5];
            expect(indicators.calculateRSI(prices, 14)).toBeNull();
        });

        it('should calculate RSI correctly for a simple uptrend', () => {
            // 15 prices (14 changes)
            // Just increasing by 1 every time
            const prices = [
                100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114
            ];
            // Gains: 1, 1, 1... (14 times)
            // Losses: 0
            // AvgGain = 1, AvgLoss = 0 -> RSI = 100
            const rsi = indicators.calculateRSI(prices, 14);
            expect(rsi?.toNumber()).toBe(100);
        });

        it('should calculate RSI correctly for mixed data (standard verification)', () => {
            // Example data from a standard RSI calculation example
            // Using a known sequence
            // prices:
            // 1. 44.34
            // 2. 44.09 (-0.25)
            // ...
            // Let's use a simpler known sequence or just trust the logic if it matches Wilder's

            // Data points: 18 points. Period 14.
            const prices = [
                100, 102, 104, 106, 105, 104, 103, 102, 101, 102, 103, 104, 106, 108, // 14 points (index 0-13)
                110, // 15th point (index 14). Change +2.
                // Initial 14 changes (from 0 to 14):
                // 2, 2, 2, -1, -1, -1, -1, -1, 1, 1, 1, 2, 2, 2
                // Gains: 2,2,2, 1,1,1, 2,2,2 = 15 total / 14 = 1.0714
                // Losses: 1,1,1,1,1 = 5 total / 14 = 0.3571
                // RS = 3
                // RSI = 100 - 100/(4) = 75
            ];

            // Wait, calculateRSI(prices, 14) needs 15 prices to produce 14 changes for the FIRST RSI point?
            // "If prices.length < period + 1" -> yes. 15 prices needed for 1st RSI.

            // Let's manually verify the logic with code trace for small period
            // Period = 2
            // Prices: 10, 12, 11, 13
            // Changes: +2, -1, +2
            // 1. Initial Avg (Changes 0, 1): (+2, -1) -> GainSum=2, LossSum=1 -> AvgGain=1, AvgLoss=0.5
            // 2. Next (Change +2):
            //    AvgGain = (1 * 1 + 2) / 2 = 1.5
            //    AvgLoss = (0.5 * 1 + 0) / 2 = 0.25
            //    RS = 6 -> RSI = 100 - 100/7 = 85.714

            const p = [10, 12, 11, 13];
            const rsi = indicators.calculateRSI(p, 2);
            expect(rsi?.toNumber()).toBeCloseTo(85.714, 2);
        });
    });
});
