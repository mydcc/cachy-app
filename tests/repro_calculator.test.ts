import { describe, it, expect } from 'vitest';
import { calculateAllIndicators } from '../src/utils/technicalsCalculator';
import { getEmptyData } from '../src/services/technicalsTypes';
import { Decimal } from 'decimal.js';

describe('calculateAllIndicators Repro', () => {
    it('should return 0 for EMA 200 when insufficient data (current behavior)', () => {
        // Create 100 klines
        const klines = Array.from({ length: 100 }, (_, i) => ({
            time: i * 60000,
            open: new Decimal(100),
            high: new Decimal(110),
            low: new Decimal(90),
            close: new Decimal(100),
            volume: new Decimal(1000)
        }));

        const settings = {
            ema: {
                ema1: { length: 20 },
                ema2: { length: 50 },
                ema3: { length: 200 }, // EMA 200
                source: "close"
            }
        };

        const result = calculateAllIndicators(klines, settings);

        const ema200 = result.movingAverages.find(ma => ma.params === '200');
        expect(ema200).toBeDefined();
        // Das ist der Bug: Es ist 0, obwohl es NaN sein sollte
        expect(ema200?.value).toBe(0);
    });
});
