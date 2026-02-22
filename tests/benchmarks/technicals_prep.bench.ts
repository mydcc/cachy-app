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

// Mock Kline with Decimal
interface MockKline {
  time: number;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: Decimal;
}

// Generate data
const generateKlines = (count: number): MockKline[] => {
  const klines: MockKline[] = [];
  let time = 1600000000000;
  for (let i = 0; i < count; i++) {
    klines.push({
      time: time + i * 60000,
      open: new Decimal(Math.random() * 10000),
      high: new Decimal(Math.random() * 10000),
      low: new Decimal(Math.random() * 10000),
      close: new Decimal(Math.random() * 10000),
      volume: new Decimal(Math.random() * 100),
    });
  }
  return klines;
};

const klines10k = generateKlines(10000); // Max safety limit
const klines1k = generateKlines(1000);   // Typical usage

// Mock Cached Buffers (Float64Array)
const cachedBuffers1k = {
  times: new Float64Array(1000),
  opens: new Float64Array(1000),
  highs: new Float64Array(1000),
  lows: new Float64Array(1000),
  closes: new Float64Array(1000),
  volumes: new Float64Array(1000),
};
const cachedBuffers10k = {
  times: new Float64Array(10000),
  opens: new Float64Array(10000),
  highs: new Float64Array(10000),
  lows: new Float64Array(10000),
  closes: new Float64Array(10000),
  volumes: new Float64Array(10000),
};

// Current implementation in calculateTechnicals (Async version prep)
const prepareCurrent = (klinesInput: any[]) => {
  const len = klinesInput.length;
  const times = new Float64Array(len);
  const opens = new Float64Array(len);
  const highs = new Float64Array(len);
  const lows = new Float64Array(len);
  const closes = new Float64Array(len);
  const volumes = new Float64Array(len);

  const toNumFast = (val: any): number => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const p = parseFloat(val);
        return isNaN(p) ? 0 : p;
    }
    // The flaw: creates new Decimal(val) even if val is Decimal
    try { return new Decimal(val).toNumber(); } catch { return 0; }
  };

  for (let i = 0; i < len; i++) {
    const k = klinesInput[i];
    times[i] = k.time;
    opens[i] = toNumFast(k.open);
    highs[i] = toNumFast(k.high);
    lows[i] = toNumFast(k.low);
    closes[i] = toNumFast(k.close);
    volumes[i] = k.volume ? toNumFast(k.volume) : 0;
  }

  return { times, opens, highs, lows, closes, volumes };
};

// Optimized implementation: explicit Decimal check + avoiding new Decimal()
const prepareOptimized = (klinesInput: any[]) => {
  const len = klinesInput.length;
  const times = new Float64Array(len);
  const opens = new Float64Array(len);
  const highs = new Float64Array(len);
  const lows = new Float64Array(len);
  const closes = new Float64Array(len);
  const volumes = new Float64Array(len);

  const toNumOptimized = (val: any): number => {
    if (typeof val === 'number') return val;
    if (val instanceof Decimal) return val.toNumber(); // Fast path for Decimal
    if (typeof val === 'string') {
        const p = parseFloat(val);
        return isNaN(p) ? 0 : p;
    }
    // Fallback
    try { return new Decimal(val).toNumber(); } catch { return 0; }
  };

  for (let i = 0; i < len; i++) {
    const k = klinesInput[i];
    times[i] = k.time;
    opens[i] = toNumOptimized(k.open);
    highs[i] = toNumOptimized(k.high);
    lows[i] = toNumOptimized(k.low);
    closes[i] = toNumOptimized(k.close);
    volumes[i] = k.volume ? toNumOptimized(k.volume) : 0;
  }

  return { times, opens, highs, lows, closes, volumes };
};

// Cached access (simulate just passing reference or shallow copy)
const prepareCached = (cached: any) => {
    // If we have cached buffers, we just return them (or slice them if needed, but for benchmark assuming full reuse)
    return cached;
};

// Cached with Transferable Prep (Simulate creating transferables if needed, though they are usually passed directly)
// If we need to clone to send to worker (since worker takes ownership of transferables)
// We might need to slice/copy.
const prepareCachedCopy = (cached: any) => {
    return {
        times: cached.times.slice(),
        opens: cached.opens.slice(),
        highs: cached.highs.slice(),
        lows: cached.lows.slice(),
        closes: cached.closes.slice(),
        volumes: cached.volumes.slice(),
    };
};

describe('Technicals Preparation Benchmark', () => {
  bench('Current Prep (1k items)', () => {
    prepareCurrent(klines1k);
  });

  bench('Optimized Prep (1k items)', () => {
    prepareOptimized(klines1k);
  });

  bench('Cached Copy (1k items)', () => {
    prepareCachedCopy(cachedBuffers1k);
  });

  bench('Current Prep (10k items)', () => {
    prepareCurrent(klines10k);
  });

  bench('Optimized Prep (10k items)', () => {
    prepareOptimized(klines10k);
  });

  bench('Cached Copy (10k items)', () => {
    prepareCachedCopy(cachedBuffers10k);
  });
});
