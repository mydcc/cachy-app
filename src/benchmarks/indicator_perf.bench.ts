import { bench, describe } from 'vitest';
import { Decimal } from 'decimal.js';
import { calculateAllIndicators } from '../utils/technicalsCalculator';
import type { Kline } from '../services/technicalsTypes';

function generateKlines(count: number): Kline[] {
  const klines: Kline[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    price += (Math.random() - 0.5) * 2;
    klines.push({
      open: new Decimal(price - 1),
      high: new Decimal(price + 2),
      low: new Decimal(price - 2),
      close: new Decimal(price),
      volume: new Decimal(1000 + Math.random() * 500),
      time: Date.now() + i * 60000,
    });
  }
  return klines;
}

const data1k = generateKlines(1000);
const data20k = generateKlines(20000);

describe('Indicator Calculation', () => {
  bench('calculateAllIndicators (1000 candles)', () => {
    calculateAllIndicators(data1k);
  });

  bench('calculateAllIndicators (20000 candles)', () => {
    calculateAllIndicators(data20k);
  });
});
