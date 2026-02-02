import { bench, describe } from 'vitest';
import { technicalsService } from '../src/services/technicalsService';
import { Decimal } from 'decimal.js';

function generateKlines(count: number) {
  const klines = [];
  let price = 10000;
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    klines.push({
      time: now - (count - i) * 60000,
      open: new Decimal(price),
      high: new Decimal(price + 10),
      low: new Decimal(price - 10),
      close: new Decimal(price + 5),
      volume: new Decimal(100 + Math.random() * 100),
    });
    price += (Math.random() - 0.5) * 20;
  }
  return klines;
}

const baseKlines100 = generateKlines(100);
const baseKlines1000 = generateKlines(1000);

const settings = {
  rsi: { length: 14, source: 'close' },
  macd: { fastLength: 12, slowLength: 26, signalLength: 9 },
  bb: { length: 20, stdDev: 2 },
};

const enabledIndicators = {
  rsi: true,
  macd: true,
  bb: true,
};

describe('Technicals Service', () => {
  bench('calculateInline 100 (Cache Miss)', () => {
    const klines = baseKlines100;
    const lastIdx = klines.length - 1;
    // Mutate time to force cache miss
    // Use a unique value based on random or counter to avoid any collision chance
    klines[lastIdx].time = Date.now() + Math.random();

    technicalsService.calculateTechnicalsInline(klines, settings, enabledIndicators);
  });

  bench('calculateInline 1000 (Cache Miss)', () => {
    const klines = baseKlines1000;
    const lastIdx = klines.length - 1;
    klines[lastIdx].time = Date.now() + Math.random();

    technicalsService.calculateTechnicalsInline(klines, settings, enabledIndicators);
  });
});
