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
import { calculateAllIndicators } from '../src/utils/technicalsCalculator';
import { getEmptyData } from '../src/services/technicalsTypes';
import { Decimal } from 'decimal.js';

describe('calculateAllIndicators Repro', () => {
    it('should NOT return EMA 200 when insufficient data (fixed behavior)', () => {
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

        // EMA 200 should NOT be in the results because 100 < 200
        const ema200 = result.movingAverages.find(ma => ma.params === '200');
        expect(ema200).toBeUndefined();
    });
});
