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


import { JSIndicators } from '../../src/utils/indicators';

// Copy types
type NumberArray = number[] | Float64Array;

// Legacy implementation (O(N^2))
function wmaLegacy(
    data: NumberArray,
    period: number,
    out?: Float64Array,
  ): Float64Array {
    const result = (out && out.length === data.length) ? out : new Float64Array(data.length);
    result.fill(NaN);

    if (data.length < period) return result;

    const denominator = (period * (period + 1)) / 2;

    for (let i = period - 1; i < data.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - period + 1 + j] * (j + 1);
      }
      result[i] = sum / denominator;
    }
    return result;
  }

// Setup data
const LENGTH = 10000;
const PERIOD = 200;
const data = new Float64Array(LENGTH);
for (let i = 0; i < LENGTH; i++) {
    data[i] = Math.random() * 1000;
}

function runBench(name: string, fn: () => void, iterations = 100) {
    // Warmup
    for(let i=0; i<10; i++) fn();

    const start = performance.now();
    for(let i=0; i<iterations; i++) {
        fn();
    }
    const end = performance.now();
    const duration = end - start;
    const opsPerSec = (iterations / duration) * 1000;
    console.log(`${name}: ${duration.toFixed(2)}ms for ${iterations} ops (${opsPerSec.toFixed(0)} ops/s) -> ${(duration/iterations).toFixed(3)} ms/op`);
}

console.log(`Benchmarking WMA with Length=${LENGTH}, Period=${PERIOD}`);

runBench('wmaLegacy (Baseline)', () => {
    wmaLegacy(data, PERIOD);
}, 50);

runBench('JSIndicators.wma (Target)', () => {
    JSIndicators.wma(data, PERIOD);
}, 50);

// Verify correctness
const baseline = wmaLegacy(data, PERIOD);
const target = JSIndicators.wma(data, PERIOD);
let maxDiff = 0;
for(let i=0; i<LENGTH; i++) {
    if (isNaN(baseline[i]) && isNaN(target[i])) continue;
    const diff = Math.abs(baseline[i] - target[i]);
    if (diff > maxDiff) maxDiff = diff;
}
console.log(`Max Diff between baseline and target: ${maxDiff}`);
if (maxDiff > 1e-9) {
    console.warn("WARNING: Significant precision difference detected!");
} else {
    console.log("Verification Passed (Diff < 1e-9)");
}
