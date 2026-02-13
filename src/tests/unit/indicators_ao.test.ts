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
    //
    // i=0: HL2=9.  FastSum=9. SlowSum=9.
    // i=1: HL2=11. FastSum=20. SlowSum=20.
    //      FastSMA = 20/2 = 10. (valid)
    //      SlowSMA = invalid (needs 4).
    //      Result[1] = 0.
    //
    // i=2: HL2=13. FastSum=20+13-9=24. SlowSum=20+13=33.
    //      FastSMA = 24/2 = 12.
    //      SlowSMA = invalid.
    //      Result[2] = 0.
    //
    // i=3: HL2=15. FastSum=24+15-11=28. SlowSum=33+15=48.
    //      FastSMA = 28/2 = 14.
    //      SlowSMA = 48/4 = 12.
    //      Result[3] = 14 - 12 = 2.
    //
    // i=4: HL2=17. FastSum=28+17-13=32. SlowSum=48+17-9=56.
    //      FastSMA = 32/2 = 16.
    //      SlowSMA = 56/4 = 14.
    //      Result[4] = 16 - 14 = 2.
    //
    // i=5: HL2=19. FastSum=32+19-15=36. SlowSum=56+19-11=64.
    //      FastSMA = 36/2 = 18.
    //      SlowSMA = 64/4 = 16.
    //      Result[5] = 18 - 16 = 2.

    const result = calculateAwesomeOscillator(high, low, 2, 4);

    expect(result).toBeInstanceOf(Float64Array);
    expect(result.length).toBe(high.length);

    // Check values where SlowSMA is valid (>= slowPeriod - 1 = 3)
    expect(result[3]).toBeCloseTo(2);
    expect(result[4]).toBeCloseTo(2);
    expect(result[5]).toBeCloseTo(2);

    // Check initial values (should be 0)
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(0);
    expect(result[2]).toBe(0);
  });
});
