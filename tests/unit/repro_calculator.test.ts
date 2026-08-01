/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
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
import { calculateAllIndicators } from '../../src/utils/technicalsCalculator';
import { Decimal } from 'decimal.js';
import type { IndicatorSettings } from '../../src/types/indicators';

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

        const result = calculateAllIndicators(klines, settings as unknown as IndicatorSettings);

        // This test was written to document a bug: EMA 200 over only 100 candles
        // reported a value of 0, which is indistinguishable from a real price
        // level of zero and worse than saying nothing.
        //
        // That bug is fixed. The calculator now pushes a moving-average entry
        // only when the computed value is not NaN, so an indicator without
        // enough history is simply absent rather than reported as 0. The
        // assertion is inverted to lock in the corrected behaviour.
        const ema200 = result.movingAverages.find(ma => ma.params === '200');
        expect(ema200).toBeUndefined();

        // The shorter EMAs do have enough data and must still be present, so
        // this cannot pass by the whole array being empty.
        expect(result.movingAverages.find(ma => ma.params === '20')).toBeDefined();
        expect(result.movingAverages.find(ma => ma.params === '50')).toBeDefined();
    });

    it('reports EMA 200 once there is enough history', async () => {
        const klines = Array.from({ length: 250 }, (_, i) => ({
            time: i * 60000,
            open: new Decimal(100 + (i % 7)),
            high: new Decimal(110 + (i % 7)),
            low: new Decimal(90 + (i % 7)),
            close: new Decimal(100 + (i % 5)),
            volume: new Decimal(1000)
        }));

        const settings = {
            ema: {
                ema1: { length: 20 },
                ema2: { length: 50 },
                ema3: { length: 200 },
                source: "close"
            }
        };

        const result = calculateAllIndicators(klines, settings as unknown as IndicatorSettings);
        const ema200 = result.movingAverages.find(ma => ma.params === '200');

        expect(ema200).toBeDefined();
        expect(typeof ema200!.value).toBe('number');
        expect(ema200!.value).not.toBeNaN();
        expect(ema200!.value).toBeGreaterThan(0);
    });
});
