/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * Copyright (C) 2026 MYDCT
 *
 * Memory Profiling Tests
 * Ensures calculation loop doesn't leak memory.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { calculateAllIndicators } from '../../utils/technicalsCalculator';
import type { Kline } from '../../services/technicalsTypes';

function generateKlines(count: number): Kline[] {
  const klines: Kline[] = [];
  let price = 100;
  const baseTime = Date.now() - count * 60000;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 2;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * 0.5;
    const low = Math.min(open, close) - Math.random() * 0.5;
    const volume = 1000 + Math.random() * 9000;

    klines.push({
      time: baseTime + i * 60000,
      open: new Decimal(open),
      high: new Decimal(high),
      low: new Decimal(low),
      close: new Decimal(close),
      volume: new Decimal(volume),
    });
    price = close;
  }
  return klines;
}

/**
 * Heap growth only means anything if a collection can be forced first.
 * `global.gc` exists solely under `node --expose-gc`, which vitest.perf.config.ts
 * passes to the worker. Without it the old `if (global.gc)` guards silently did
 * nothing and the assertions compared two arbitrary points in V8's allocation
 * cycle — that is why CI saw 16 MB of "growth" against a 10 MB limit while the
 * calculator was unchanged. Skipping is the honest outcome: a number nobody can
 * interpret is worse than no number.
 */
const canForceGc = typeof global.gc === "function";

/** Two passes: the first can resurrect objects through finalizers. */
function forceGc(): void {
  global.gc!();
  global.gc!();
}

describe('Memory Profiling', () => {
  it.skipIf(!canForceGc)('does not leak memory over repeated calculations', () => {
    const klines = generateKlines(2000);
    const iterations = 50;

    // Warmup + stabilize GC
    for (let i = 0; i < 3; i++) {
      calculateAllIndicators(klines);
    }
    forceGc();

    const heapBefore = process.memoryUsage().heapUsed;

    for (let i = 0; i < iterations; i++) {
      calculateAllIndicators(klines);
    }

    forceGc();
    const heapAfter = process.memoryUsage().heapUsed;
    const heapGrowthMB = (heapAfter - heapBefore) / (1024 * 1024);

    console.log(
      `🧠 Memory: before=${(heapBefore / 1024 / 1024).toFixed(1)}MB, ` +
      `after=${(heapAfter / 1024 / 1024).toFixed(1)}MB, ` +
      `growth=${heapGrowthMB.toFixed(2)}MB over ${iterations} iterations`
    );

    // Allow up to 10MB growth (GC may not run precisely)
    expect(heapGrowthMB).toBeLessThan(10);
  }, 60000);

  it.skipIf(!canForceGc)('buffer pool releases buffers correctly', () => {
    const klines = generateKlines(1000);

    // Run many times — if pool leaks, heap would explode
    forceGc();
    const heapBefore = process.memoryUsage().heapUsed;

    for (let i = 0; i < 100; i++) {
      calculateAllIndicators(klines);
    }

    forceGc();
    const heapAfter = process.memoryUsage().heapUsed;
    const growthMB = (heapAfter - heapBefore) / (1024 * 1024);

    console.log(`🔄 Buffer pool test: growth=${growthMB.toFixed(2)}MB over 100 iterations`);

    // 100 iterations with 1k candles should not grow more than 15MB
    expect(growthMB).toBeLessThan(15);
  }, 60000);
});
