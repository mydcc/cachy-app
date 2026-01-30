
import { bench, describe } from 'vitest';
import { patternDetector } from '../src/services/patternDetection';
import type { CandleData } from '../src/services/candlestickPatterns';

// Generate some random candle data
function generateCandles(count: number): CandleData[] {
  const candles: CandleData[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const volatility = 2;
    const open = price + (Math.random() - 0.5) * volatility;
    const close = open + (Math.random() - 0.5) * volatility;
    const high = Math.max(open, close) + Math.random();
    const low = Math.min(open, close) - Math.random();
    candles.push({ open, high, low, close });
    price = close;
  }
  return candles;
}

const candles = generateCandles(100);

describe('Pattern Detection', () => {
  bench('detect', () => {
    patternDetector.detect(candles);
  });
});
