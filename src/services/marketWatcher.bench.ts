import { bench, describe } from 'vitest';
import { marketWatcher } from './marketWatcher';
import { Decimal } from 'decimal.js';

describe('marketWatcher fillGaps', () => {
    // Generate data - Deterministic
    const intervalMs = 60000;
    const start = 1700000000000;
    const count = 10000;
    const klines: any[] = [];
    let currentTime = start;

    for (let i = 0; i < count; i++) {
        klines.push({
            time: currentTime,
            open: new Decimal(50000),
            high: new Decimal(50100),
            low: new Decimal(49900),
            close: new Decimal(50050),
            volume: new Decimal(1.5)
        });

        // Fixed pattern: Every 20 candles, introduce a gap of 5 candles
        if (i % 20 === 19) {
            // Gap of 5 minutes
            currentTime += (5 + 1) * intervalMs;
        } else {
            currentTime += intervalMs;
        }
    }

    bench('fillGaps with fixed gaps', () => {
        (marketWatcher as any).fillGaps(klines, intervalMs);
    });
});
