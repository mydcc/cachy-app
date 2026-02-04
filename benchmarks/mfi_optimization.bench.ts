import { bench, describe } from 'vitest';
import { calculateMFI, JSIndicators } from '../src/utils/indicators';

describe('MFI Optimization', () => {
  const len = 2000;
  const high = new Float64Array(len).fill(100);
  const low = new Float64Array(len).fill(90);
  const close = new Float64Array(len).fill(95);
  const vol = new Float64Array(len).fill(1000);

  bench('Baseline: Alloc TP + Full Series', () => {
    const tp = new Float64Array(len);
    for(let i=0; i<len; i++) tp[i] = (high[i]+low[i]+close[i])/3;
    JSIndicators.mfi(high, low, close, vol, 14, tp);
  });

  bench('Optimized: On-the-fly HLC3', () => {
    calculateMFI(high, low, close, vol, 14);
  });
});
