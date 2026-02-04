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
