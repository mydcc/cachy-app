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
import { calculateCCISeries, JSIndicators } from '../../utils/indicators';

describe('CCI Optimization Correctness', () => {
  it('should match the full series calculation', () => {
    const len = 100;
    const high = new Float64Array(len).map((_, i) => 100 + Math.sin(i) * 10);
    const low = new Float64Array(len).map((_, i) => 90 + Math.sin(i) * 10);
    const close = new Float64Array(len).map((_, i) => 95 + Math.sin(i) * 10);

    // Baseline
    const tp = new Float64Array(len);
    for(let i=0; i<len; i++) tp[i] = (high[i]+low[i]+close[i])/3;
    const expectedSeries = JSIndicators.cci(tp, 20);

    // Optimized
    const actualSeries = calculateCCISeries(high, low, close, 20);

    // Verify length
    expect(actualSeries.length).toBe(len);

    // Verify values (check first valid, middle, and last)
    // First valid index is period-1 = 19
    expect(actualSeries[19]).toBeCloseTo(expectedSeries[19], 10);
    expect(actualSeries[50]).toBeCloseTo(expectedSeries[50], 10);
    expect(actualSeries[99]).toBeCloseTo(expectedSeries[99], 10);
  });
});
