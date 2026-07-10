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


import { calculateIndicatorsFromArrays } from '../../src/utils/technicalsCalculator';
import { BufferPool } from '../../src/utils/bufferPool';
import { performance } from 'perf_hooks';

// Setup Data
const HISTORY_LENGTH = 1000;
const times = new Float64Array(HISTORY_LENGTH);
const opens = new Float64Array(HISTORY_LENGTH);
const highs = new Float64Array(HISTORY_LENGTH);
const lows = new Float64Array(HISTORY_LENGTH);
const closes = new Float64Array(HISTORY_LENGTH);
const volumes = new Float64Array(HISTORY_LENGTH);

for (let i = 0; i < HISTORY_LENGTH; i++) {
  times[i] = Date.now() + i * 60000;
  opens[i] = 100 + Math.random() * 10;
  highs[i] = opens[i] + Math.random();
  lows[i] = opens[i] - Math.random();
  closes[i] = (highs[i] + lows[i]) / 2;
  volumes[i] = Math.random() * 1000;
}

const settings = {
    rsi: { length: 14, source: 'close' },
    stochastic: { kPeriod: 14, dPeriod: 3, kSmoothing: 3 },
    macd: { fastLength: 12, slowLength: 26, signalLength: 9 },
    ema: { ema1: { length: 20 }, ema2: { length: 50 }, ema3: { length: 200 } },
    bb: { length: 20, stdDev: 2 },
    atr: { length: 14 }
};
const enabledIndicators = {
    rsi: true,
    stochastic: true,
    macd: true,
    ema: true,
    bb: true,
    atr: true
};

const pool = new BufferPool();

// Simulation of Incremental State
class IncrementalState {
    prevEma = 100;
    prevRsiGain = 0;
    prevRsiLoss = 0;

    update(price: number) {
        // EMA: (Price - Prev) * K + Prev
        // O(1) Math
        const k = 2 / (14 + 1);
        this.prevEma = (price - this.prevEma) * k + this.prevEma;

        // RSI Logic (simplified incremental)
        const change = price - 100; // Mock change
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;
        this.prevRsiGain = (this.prevRsiGain * 13 + gain) / 14;
        this.prevRsiLoss = (this.prevRsiLoss * 13 + loss) / 14;

        return { ema: this.prevEma, rsi: 100 - (100 / (1 + this.prevRsiGain/this.prevRsiLoss)) };
    }
}
const incrementalState = new IncrementalState();

function benchmark(name: string, fn: () => void, iterations: number) {
    // Warmup
    for(let i=0; i<10; i++) fn();

    const start = performance.now();
    for(let i=0; i<iterations; i++) {
        fn();
    }
    const end = performance.now();
    const duration = end - start;
    const opsPerSec = (iterations / duration) * 1000;

    console.log(`${name}:`);
    console.log(`  Total Time: ${duration.toFixed(2)}ms`);
    console.log(`  Ops/Sec: ${Math.floor(opsPerSec).toLocaleString()}`);
    console.log(`  Avg Latency: ${(duration/iterations).toFixed(4)}ms`);
    console.log('-----------------------------------');
}

console.log('--- Worker Simulation Benchmark ---\n');

benchmark('Current: Full Recalc (1000 candles)', () => {
    calculateIndicatorsFromArrays(
        times, opens, highs, lows, closes, volumes,
        settings as any, enabledIndicators, pool
    );
}, 1000);

benchmark('Target: Incremental Update (1 candle)', () => {
    incrementalState.update(105);
}, 1000000);
