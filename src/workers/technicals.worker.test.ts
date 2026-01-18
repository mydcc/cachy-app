import { describe, it, expect } from 'vitest';
import { calculateAllIndicators } from './technicals.worker';
import { JSIndicators } from '../utils/indicators';
import { Decimal } from 'decimal.js';

describe('technicals.worker', () => {
    // 1. Test JSIndicators helper functions
    describe('JSIndicators', () => {
        it('should calculate SMA correctly', () => {
            const data = [1, 2, 3, 4, 5];
            const sma = JSIndicators.sma(data, 3);
            // Result: [0, 0, 2, 3, 4]
            expect(sma[2]).toBe(2);
            expect(sma[4]).toBe(4);
        });

        it('should calculate RSI correctly', () => {
            // Simplified RSI test
            const data = [10, 12, 11, 13, 15, 14, 16]; // 7 points
            const rsi = JSIndicators.rsi(data, 5);
            // Just verifying it produces a number in range 0-100 after period
            expect(rsi[5]).toBeGreaterThanOrEqual(0);
            expect(rsi[5]).toBeLessThanOrEqual(100);
        });
    });

    // 2. Test Main Logic
    describe('calculateAllIndicators', () => {
        const mockKlines = Array(200).fill(0).map((_, i) => ({
            time: 1000 + i,
            open: 100 + i,
            high: 105 + i,
            low: 95 + i,
            close: 102 + i,
            volume: 1000
        }));

        it('should return all indicators populated', () => {
            const result = calculateAllIndicators({
                klines: mockKlines,
                settings: {
                    rsi: { length: 14 },
                    ema: { ema1: { length: 9 }, ema2: { length: 21 }, ema3: { length: 50 } }
                }
            });

            expect(result.oscillators).toBeDefined();
            expect(result.movingAverages).toBeDefined();
            expect(result.pivots).toBeDefined();
            expect(result.summary).toBeDefined();

            // Check RSI existence
            const rsi = result.oscillators.find((o: any) => o.name === 'RSI');
            expect(rsi).toBeDefined();
            expect(rsi!.value).not.toBe("NaN");
        });

        it('should handle incomplete data gracefully', () => {
            const shortKlines = mockKlines.slice(0, 5); // Too short for EMA 9
            const result = calculateAllIndicators({
                klines: shortKlines,
                settings: { ema: { ema1: { length: 9 } } }
            });

            // Should not crash, just empty or partial results
            expect(result.movingAverages.length).toBe(0);
        });
    });
});
