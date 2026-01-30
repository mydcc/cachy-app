/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect } from 'vitest';
import { SMCService, type SMCCandle } from './smcService';
import { TrendBias } from './types';

describe('SMCService', () => {
    it('should detect swings and structure breaks in a simple uptrend', () => {
        const service = new SMCService(2); // Short lookback for testing
        const candles: SMCCandle[] = [];
        let time = 1000;

        // Create a zig-zag uptrend
        // 0: Low
        // 1-2: Up
        // 3: High (Swing High)
        // 4-5: Down
        // 6: Low (Higher Low)
        // 7-9: Up past High (BOS)

        const prices = [
            10, 12, 14, 15, // Up to 15
            14, 13, 12,     // Down to 12 (Higher Low)
            13, 15, 16, 17  // Up break 15
        ];

        for (const p of prices) {
            candles.push({
                time: time++,
                open: p - 0.5,
                high: p + 0.5,
                low: p - 0.5,
                close: p,
            });
        }

        const result = service.analyze(candles);

        // Check Swings
        // Index 3 (Price 15) should be a High (Highest in +/- 2)
        // Index 6 (Price 12) should be a Low (Lowest in +/- 2)

        const highSwing = result.swings.find(s => s.index === 3 && (s.type === 'HH' || s.type === 'LH'));
        expect(highSwing).toBeDefined();
        expect(highSwing?.price).toBeGreaterThan(15); // High is p+0.5 = 15.5

        const lowSwing = result.swings.find(s => s.index === 6 && (s.type === 'HL' || s.type === 'LL'));
        expect(lowSwing).toBeDefined();

        // Check Structure Break
        // We broke the high at index 3 (High ~15.5) around index 9 (Price 16, High 16.5)
        // Wait, loop runs to end.
        // Break happens when Close > SwingHigh.
        // SwingHigh at index 3 is ~15.5.
        // Index 9 (16) Close is 16 > 15.5. Should trigger BOS.

        const bos = result.structures.find(s => s.type === 'BOS');
        expect(bos).toBeDefined();
        expect(bos?.bias).toBe(TrendBias.BULLISH);
    });

    it('should detect Fair Value Gaps', () => {
        const service = new SMCService(2);
        const candles: SMCCandle[] = [];
        let time = 1000;

        // Bullish FVG Pattern:
        // 0: Huge Up
        // 1: Huge Up (Gap created)
        // 2: Huge Up

        // Candle 0: High 10
        // Candle 1: Low 12, High 15 (Gap 10-12)
        // Candle 2: Low 16 (Gap maintained)
        // Actually definition is: Current Low (2) > Last2 High (0)

        // C0: High 10
        candles.push({ time: 1, open: 5, high: 10, low: 5, close: 9 });
        // C1: Low 12 (Gap 10-12)
        candles.push({ time: 2, open: 12, high: 15, low: 12, close: 14 });
        // C2: Low 16
        candles.push({ time: 3, open: 16, high: 20, low: 16, close: 19 });

        // Add more to allow loop to process
        candles.push({ time: 4, open: 19, high: 21, low: 18, close: 20 });

        const result = service.analyze(candles);

        // C2 (index 2): Low 16 > C0 High 10.
        // C1 (index 1): Close > Open (Green).
        // This is a HUGE gap.

        const fvg = result.fairValueGaps.find(f => f.bias === TrendBias.BULLISH);
        expect(fvg).toBeDefined();
        expect(fvg?.bottom).toBe(10); // High of C0
        expect(fvg?.top).toBe(16);    // Low of C2 (Current at detection time)
    });
});
