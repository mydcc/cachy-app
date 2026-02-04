import { bench, describe } from 'vitest';
import { calculateAwesomeOscillator } from '../src/utils/indicators';

describe('Awesome Oscillator Optimization', () => {
  const len = 2000;
  const high = new Float64Array(len);
  const low = new Float64Array(len);

  for (let i = 0; i < len; i++) {
    high[i] = 100 + Math.random() * 10;
    low[i] = high[i] - Math.random() * 5;
  }

  // Helper to replicate OLD behavior
  const getSMA_Old = (data: Float64Array, period: number): number => {
    if (data.length < period) return 0;
    let sum = 0;
    for (let i = data.length - period; i < data.length; i++) {
      sum += data[i];
    }
    return sum / period;
  };

  const calculateAO_Old = (hl2: Float64Array, fast: number, slow: number) => {
    const fastSMA = getSMA_Old(hl2, fast);
    const slowSMA = getSMA_Old(hl2, slow);
    return fastSMA - slowSMA;
  }

  bench('Baseline (Old Logic): Alloc + Fill HL2 + Calc', () => {
    const hl2 = new Float64Array(len);
    for (let i = 0; i < len; i++) {
      hl2[i] = (high[i] + low[i]) / 2;
    }
    calculateAO_Old(hl2, 5, 34);
  });

  bench('Optimized (Current Impl): On-the-fly HL2', () => {
    calculateAwesomeOscillator(high, low, 5, 34);
  });
});
