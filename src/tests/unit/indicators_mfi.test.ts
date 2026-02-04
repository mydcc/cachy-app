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
