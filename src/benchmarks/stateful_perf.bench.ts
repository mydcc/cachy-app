import { bench, describe } from 'vitest';
import { StatefulTechnicalsCalculator } from '../utils/statefulTechnicalsCalculator';
import { Decimal } from 'decimal.js';
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

const history = generateKlines(1000);
const settings = { bb: { length: 20, stdDev: 2 }, rsi: { length: 14 } };
const enabled = { bb: true, rsi: true };

const calc = new StatefulTechnicalsCalculator();
calc.initialize(history, settings, enabled);

const tick = {
    open: new Decimal(100),
    high: new Decimal(105),
    low: new Decimal(95),
    close: new Decimal(102),
    volume: new Decimal(2000),
    time: Date.now()
};

describe('Stateful Performance', () => {
    bench('Stateful Update (BB+RSI)', () => {
        calc.update(tick);
    });
});
