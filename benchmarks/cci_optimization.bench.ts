import { bench, describe } from 'vitest';
import { calculateCCISeries, JSIndicators } from '../src/utils/indicators';

describe('CCI Optimization', () => {
  const len = 2000;
  const high = new Float64Array(len).fill(100);
  const low = new Float64Array(len).fill(90);
  const close = new Float64Array(len).fill(95);

  bench('Baseline: Alloc HLC3 + CCI (O(N*P))', () => {
    const hlc3 = new Float64Array(len);
    for(let i=0; i<len; i++) hlc3[i] = (high[i]+low[i]+close[i])/3;
    JSIndicators.cci(hlc3, 20);
  });

  bench('Optimized: Rolling SMA + On-the-fly HLC3 (O(N*P/2))', () => {
    calculateCCISeries(high, low, close, 20);
  });
});
