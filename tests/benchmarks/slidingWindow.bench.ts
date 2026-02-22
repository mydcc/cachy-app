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


import { slidingWindowMax, slidingWindowMin } from '../../src/utils/slidingWindow';

const LENGTH = 10000;
const data = new Float64Array(LENGTH);
for (let i = 0; i < LENGTH; i++) {
    data[i] = Math.random() * 1000;
}

function runBench(name: string, fn: () => void, iterations = 500) {
    // Warmup
    for(let i=0; i<100; i++) fn();

    const start = performance.now();
    for(let i=0; i<iterations; i++) {
        fn();
    }
    const end = performance.now();
    const duration = end - start;
    const opsPerSec = (iterations / duration) * 1000;
    console.log(`${name}: ${duration.toFixed(2)}ms for ${iterations} ops (${opsPerSec.toFixed(0)} ops/s) -> ${(duration/iterations).toFixed(3)} ms/op`);
}

runBench('slidingWindowMax (Period 14)', () => {
    slidingWindowMax(data, 14);
}, 500);

runBench('slidingWindowMax (Period 50)', () => {
    slidingWindowMax(data, 50);
}, 500);

runBench('slidingWindowMax (Period 200)', () => {
    slidingWindowMax(data, 200);
}, 500);

runBench('slidingWindowMin (Period 14)', () => {
    slidingWindowMin(data, 14);
}, 500);
