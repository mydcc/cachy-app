
import { describe, it, expect } from 'vitest';
import { technicalsService } from './technicalsService';
import { Decimal } from 'decimal.js';

describe('Technicals Service Reproduction', () => {
    it('should maintain stable pivots when the live candle updates', () => {
        // 1. Initial State: History of completed candles
        // 10:00, 10:01, 10:02 (Live?)
        // Let's assume we have [09:59, 10:00].
        // 10:00 is technically "Live" if time is 10:00:30.

        const klines = [
            { open: 100, high: 110, low: 90, close: 105, volume: 1000, time: 100000 }, // 09:59
            { open: 105, high: 108, low: 102, close: 106, volume: 500, time: 100060 }  // 10:00 (Live)
        ];

        // Calculate Pivots. Expectation: Based on 09:59 (Index 0).
        // Index 0 is length-2.
        const res1 = technicalsService.calculateTechnicals(klines, { pivots: { type: 'classic' } });
        const p1 = res1.pivots.classic.p.toString();

        console.log('Pivot 1 (Live Price 106):', p1);

        // 2. Update Live Candle (10:00) with new price
        const klines2 = [
            { open: 100, high: 110, low: 90, close: 105, volume: 1000, time: 100000 }, // 09:59 (Stable)
            { open: 105, high: 112, low: 100, close: 110, volume: 600, time: 100060 }  // 10:00 (Updated, Price changed to 110)
        ];

        const res2 = technicalsService.calculateTechnicals(klines2, { pivots: { type: 'classic' } });
        const p2 = res2.pivots.classic.p.toString();

        console.log('Pivot 2 (Live Price 110):', p2);

        // Expectation: p1 should equal p2 because Pivot should be based on Index 0 (09:59)
        expect(p1).toBe(p2);
    });

    it('should change pivots only when a NEW candle is added', () => {
         const klines = [
            { open: 100, high: 110, low: 90, close: 105, volume: 1000, time: 100000 }, // 09:59
            { open: 105, high: 108, low: 102, close: 106, volume: 500, time: 100060 }  // 10:00 (Completed)
        ];

        const res1 = technicalsService.calculateTechnicals(klines, { pivots: { type: 'classic' } });

        // Add new live candle 10:01
        const klines2 = [
            ...klines,
            { open: 106, high: 107, low: 106, close: 106.5, volume: 100, time: 100120 } // 10:01 (Live)
        ];

        const res2 = technicalsService.calculateTechnicals(klines2, { pivots: { type: 'classic' } });

        // Now pivots should change, because "Previous Completed" is now 10:00 (Index 1).
        expect(res1.pivots.classic.p.toString()).not.toBe(res2.pivots.classic.p.toString());
    });
});
