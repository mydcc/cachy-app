import { bench, describe } from 'vitest';
import { Decimal } from 'decimal.js';

interface Kline {
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: Decimal;
  time: number;
}

const ZERO_VOL = new Decimal(0);

// ORIGINAL IMPLEMENTATION (from marketWatcher.ts)
function fillGaps_Original(klines: Kline[], intervalMs: number): Kline[] {
    if (!klines || klines.length < 2) return klines || [];

    // Validating Decimal presence
    if (klines[0] && !(klines[0].open instanceof Decimal)) {
        return klines;
    }

    const filled: Kline[] = [klines[0]];

    for (let i = 1; i < klines.length; i++) {
        const prev = filled[filled.length - 1];
        const curr = klines[i];

        // Hardening: Basic structural check for current item
        if (!curr || typeof curr.time !== 'number') continue;

        // Check for gap (> 1 interval + small buffer for jitter)
        if (curr.time - prev.time > intervalMs * 1.1) {
            let nextTime = prev.time + intervalMs;
            let gapCount = 0;
            // Limit gap fill to prevent freezing on massive gaps (e.g. months of missing data)
            const MAX_GAP_FILL = 5000;

            while (nextTime < curr.time) {
                if (gapCount >= MAX_GAP_FILL) {
                    break;
                }
                // Fill with flat candle (Close of previous)
                filled.push({
                    time: nextTime,
                    open: prev.close, // Share reference to previous close Decimal (immutable)
                    high: prev.close,
                    low: prev.close,
                    close: prev.close,
                    volume: ZERO_VOL // Use static constant
                });
                nextTime += intervalMs;
                gapCount++;
            }
        }
        filled.push(curr);
    }
    return filled;
}

// OPTIMIZED IMPLEMENTATION
function fillGaps_Optimized(klines: Kline[], intervalMs: number): Kline[] {
    if (!klines || klines.length < 2) return klines || [];

    // Validating Decimal presence
    if (klines[0] && !(klines[0].open instanceof Decimal)) {
        return klines;
    }

    // Fast Path: Check for gaps without allocation
    let hasGaps = false;
    // Use a slightly larger buffer (1.1x) to account for timestamp jitter
    const threshold = intervalMs * 1.1;

    // Check first few candles and then every 10th to be faster?
    // No, we must check all for correctness. But simple subtraction is very cheap.
    for (let i = 1; i < klines.length; i++) {
        if (klines[i].time - klines[i-1].time > threshold) {
            hasGaps = true;
            break;
        }
    }

    if (!hasGaps) {
        return klines;
    }

    // Slow Path: Fill gaps (Same logic as original, just moved here)
    const filled: Kline[] = [klines[0]];

    for (let i = 1; i < klines.length; i++) {
        const prev = filled[filled.length - 1];
        const curr = klines[i];

        if (!curr || typeof curr.time !== 'number') continue;

        if (curr.time - prev.time > threshold) {
            let nextTime = prev.time + intervalMs;
            let gapCount = 0;
            const MAX_GAP_FILL = 5000;

            while (nextTime < curr.time) {
                if (gapCount >= MAX_GAP_FILL) break;
                filled.push({
                    time: nextTime,
                    open: prev.close,
                    high: prev.close,
                    low: prev.close,
                    close: prev.close,
                    volume: ZERO_VOL
                });
                nextTime += intervalMs;
                gapCount++;
            }
        }
        filled.push(curr);
    }
    return filled;
}

// SETUP DATA
const INTERVAL = 60000; // 1m
const COUNT = 1000;

// Scenario 1: No Gaps (Happy Path)
const klinesNoGaps: Kline[] = [];
let time = 1600000000000;
for (let i = 0; i < COUNT; i++) {
    klinesNoGaps.push({
        time: time,
        open: new Decimal(100),
        high: new Decimal(101),
        low: new Decimal(99),
        close: new Decimal(100.5),
        volume: new Decimal(1000)
    });
    time += INTERVAL;
}

// Scenario 2: With Gaps (Sad Path)
const klinesWithGaps: Kline[] = [];
time = 1600000000000;
for (let i = 0; i < COUNT; i++) {
    // Introduce a gap every 100 candles
    if (i > 0 && i % 100 === 0) {
        time += INTERVAL * 5; // Skip 5 intervals
    }
    klinesWithGaps.push({
        time: time,
        open: new Decimal(100),
        high: new Decimal(101),
        low: new Decimal(99),
        close: new Decimal(100.5),
        volume: new Decimal(1000)
    });
    time += INTERVAL;
}

describe('fillGaps Benchmark', () => {
  bench('Original - No Gaps', () => {
    fillGaps_Original(klinesNoGaps, INTERVAL);
  });

  bench('Optimized - No Gaps', () => {
    fillGaps_Optimized(klinesNoGaps, INTERVAL);
  });

  bench('Original - With Gaps', () => {
    fillGaps_Original(klinesWithGaps, INTERVAL);
  });

  bench('Optimized - With Gaps', () => {
    fillGaps_Optimized(klinesWithGaps, INTERVAL);
  });
});
