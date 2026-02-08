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
