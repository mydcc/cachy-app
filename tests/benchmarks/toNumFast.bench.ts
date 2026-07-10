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
import { toNumFast } from '../../src/utils/fastConversion';

// Setup data
const decimals = Array(1000).fill(0).map(() => new Decimal((Math.random() as any)));
const strings = Array(1000).fill(0).map(() => (Math.random() as any).toString());
const numbers = Array(1000).fill(0).map(() => (Math.random() as any));
const decimalLikes = Array(1000).fill(0).map(() => ({ s: 1, e: 1, d: [123], toNumber: () => 0.123 }));

// Current implementation (inside function - representative of old code)
const createCurrent = () => {
    return (val: any): number => {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
           const p = parseFloat(val);
           return isNaN(p) ? 0 : p;
        }
        if (val instanceof Decimal) return val.toNumber();
        // Duck typing for Decimal-like objects to avoid try/catch
        if (val && typeof val === 'object' && (val as any).s !== undefined && (val as any).e !== undefined) {
            return new Decimal(val).toNumber();
        }
        try { return new Decimal(val).toNumber(); } catch { return 0; }
    };
};

describe('toNumFast Benchmark', () => {
  const currentFn = createCurrent();

  bench('Current - Numbers', () => {
    for (let i = 0; i < 1000; i++) currentFn(numbers[i]);
  });
  bench('Optimized (Imported) - Numbers', () => {
    for (let i = 0; i < 1000; i++) toNumFast(numbers[i]);
  });

  bench('Current - Strings', () => {
    for (let i = 0; i < 1000; i++) currentFn(strings[i]);
  });
  bench('Optimized (Imported) - Strings', () => {
    for (let i = 0; i < 1000; i++) toNumFast(strings[i]);
  });

  bench('Current - Decimals', () => {
    for (let i = 0; i < 1000; i++) currentFn(decimals[i]);
  });
  bench('Optimized (Imported) - Decimals', () => {
    for (let i = 0; i < 1000; i++) toNumFast(decimals[i]);
  });

  bench('Current - DecimalLikes (Method)', () => {
    for (let i = 0; i < 1000; i++) currentFn(decimalLikes[i]);
  });
  bench('Optimized (Imported) - DecimalLikes (Method)', () => {
    for (let i = 0; i < 1000; i++) toNumFast(decimalLikes[i]);
  });
});
