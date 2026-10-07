import { describe, test } from 'vitest';
import { Decimal } from 'decimal.js';
import { toNumFast } from '../../src/utils/fastConversion';

// Setup data
const decimals = Array(1000).fill(0).map(() => new Decimal(Math.random()));
const strings = Array(1000).fill(0).map(() => Math.random().toString());
const numbers = Array(1000).fill(0).map(() => Math.random());
const decimalLikes = Array(1000).fill(0).map(() => ({ s: 1, e: 1, d: [123], toNumber: () => 0.123 }));

// The pre-optimization implementation, as it was in 4150fe8f0 before
// `toNumFast` extracted and optimized it: an inline closure doing
// `new Decimal(val).toNumber()` for every non-primitive.
//
// Deliberately *not* a copy of today's `toNumFast`. That one has two later
// additions this never had — the `toNumber()` fast path and an `Object.assign`
// branch for serialized Decimal state — and matching them would make the
// comparison measure nothing. The `decimalLikes` fixture below has a `toNumber`
// method precisely because the real code prefers it; this one cannot use it,
// which is the cost being measured.
const createCurrent = () => {
    return (val: unknown): number => {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
           const p = parseFloat(val);
           return isNaN(p) ? 0 : p;
        }
        if (val instanceof Decimal) return val.toNumber();
        // Duck typing for serialized Decimal state. `new Decimal()` needs a
        // real Decimal here, so a plain state object has to be copied onto one —
        // same as the current code does.
        if (val && typeof val === 'object') {
            const decimalLike = val as { s?: unknown; e?: unknown };
            if (decimalLike.s !== undefined && decimalLike.e !== undefined) {
                const d = new Decimal(0);
                Object.assign(d, val);
                return d.toNumber();
            }
        }
        try { return new Decimal(val as Decimal.Value).toNumber(); } catch { return 0; }
    };
};

describe('toNumFast Benchmark', () => {
  const currentFn = createCurrent();

  test('Current - Numbers', async ({ bench }) => {
    await bench('Current - Numbers', () => {
      for (let i = 0; i < 1000; i++) currentFn(numbers[i]);
    }).run();
  });
  test('Optimized (Imported) - Numbers', async ({ bench }) => {
    await bench('Optimized (Imported) - Numbers', () => {
      for (let i = 0; i < 1000; i++) toNumFast(numbers[i]);
    }).run();
  });

  test('Current - Strings', async ({ bench }) => {
    await bench('Current - Strings', () => {
      for (let i = 0; i < 1000; i++) currentFn(strings[i]);
    }).run();
  });
  test('Optimized (Imported) - Strings', async ({ bench }) => {
    await bench('Optimized (Imported) - Strings', () => {
      for (let i = 0; i < 1000; i++) toNumFast(strings[i]);
    }).run();
  });

  test('Current - Decimals', async ({ bench }) => {
    await bench('Current - Decimals', () => {
      for (let i = 0; i < 1000; i++) currentFn(decimals[i]);
    }).run();
  });
  test('Optimized (Imported) - Decimals', async ({ bench }) => {
    await bench('Optimized (Imported) - Decimals', () => {
      for (let i = 0; i < 1000; i++) toNumFast(decimals[i]);
    }).run();
  });

  test('Current - DecimalLikes (Method)', async ({ bench }) => {
    await bench('Current - DecimalLikes (Method)', () => {
      for (let i = 0; i < 1000; i++) currentFn(decimalLikes[i]);
    }).run();
  });
  test('Optimized (Imported) - DecimalLikes (Method)', async ({ bench }) => {
    await bench('Optimized (Imported) - DecimalLikes (Method)', () => {
      for (let i = 0; i < 1000; i++) toNumFast(decimalLikes[i]);
    }).run();
  });
});
