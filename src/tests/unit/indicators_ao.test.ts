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
import { calculateAwesomeOscillator } from '../../utils/indicators';

describe('Awesome Oscillator Correctness', () => {
  it('should calculate correct values compared to manual calculation', () => {
    const high = new Float64Array([10, 12, 14, 16, 18, 20]);
    const low = new Float64Array([8, 10, 12, 14, 16, 18]);
    // HL2: [9, 11, 13, 15, 17, 19]

    // Fast period: 2, Slow period: 4
    // Fast SMA (last 2): (17+19)/2 = 18
    // Slow SMA (last 4): (13+15+17+19)/4 = 16
    // AO = 18 - 16 = 2

    // Optimized version computes on the fly, no hl2 arg needed
    const result = calculateAwesomeOscillator(high, low, 2, 4);
    expect(result).toBeCloseTo(2);
  });
});
