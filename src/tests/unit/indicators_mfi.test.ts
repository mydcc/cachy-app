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
import { calculateMFI, JSIndicators } from '../../utils/indicators';

describe('MFI Optimization Correctness', () => {
  it('should match the full series calculation for the last value', () => {
    const len = 100;
    const high = new Float64Array(len).map((_, i) => 100 + Math.sin(i) * 10);
    const low = new Float64Array(len).map((_, i) => 90 + Math.sin(i) * 10);
    const close = new Float64Array(len).map((_, i) => 95 + Math.sin(i) * 10);
    const vol = new Float64Array(len).map((_, i) => 1000 + Math.random() * 500);

    // Baseline (Full Series)
    const tp = new Float64Array(len);
    for(let i=0; i<len; i++) tp[i] = (high[i]+low[i]+close[i])/3;
    const series = JSIndicators.mfi(high, low, close, vol, 14, tp);
    const expected = series[len - 1];

    // Optimized (Single Value)
    const actual = calculateMFI(high, low, close, vol, 14);

    expect(actual).toBeCloseTo(expected, 10);
  });
});
