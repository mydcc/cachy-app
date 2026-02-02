
import { JSIndicators } from '../../src/utils/indicators';

// Copy types
type NumberArray = number[] | Float64Array;

// Legacy implementation (O(N*P)) - replicating the current implementation logic
function mfiLegacy(
    high: NumberArray,
    low: NumberArray,
    close: NumberArray,
    volume: NumberArray,
    period: number,
  ): Float64Array {
    const len = close.length;
    const result = new Float64Array(len).fill(NaN);
    if (len < period + 1) return result;

    const tp = new Float64Array(len);
    for(let i=0; i<len; i++) {
        tp[i] = (high[i] + low[i] + close[i]) / 3;
    }

    const moneyFlow = new Float64Array(len);
    for (let i = 0; i < len; i++) moneyFlow[i] = tp[i] * volume[i];

    const posFlow = new Float64Array(len).fill(0);
    const negFlow = new Float64Array(len).fill(0);

    // 1. Calculate Flows
    for (let i = 1; i < len; i++) {
      if (tp[i] > tp[i - 1]) {
        posFlow[i] = moneyFlow[i];
      } else if (tp[i] < tp[i - 1]) {
        negFlow[i] = moneyFlow[i];
      }
    }

    // 2. Sum over period (Nested Loop)
    for (let i = period; i < len; i++) {
      let sumPos = 0;
      let sumNeg = 0;
      for (let j = 0; j < period; j++) {
        sumPos += posFlow[i - j];
        sumNeg += negFlow[i - j];
      }

      if (sumPos + sumNeg === 0) {
        result[i] = 50;
      } else if (sumNeg === 0) {
        result[i] = 100;
      } else {
        const mfr = sumPos / sumNeg;
        result[i] = 100 - 100 / (1 + mfr);
      }
    }

    return result;
}

// Setup data
const LENGTH = 10000;
const PERIOD = 14; // Typical MFI period
const PERIOD_LARGE = 200; // Stress test

const high = new Float64Array(LENGTH);
const low = new Float64Array(LENGTH);
const close = new Float64Array(LENGTH);
const volume = new Float64Array(LENGTH);

for (let i = 0; i < LENGTH; i++) {
    high[i] = 100 + Math.random() * 10;
    low[i] = 90 + Math.random() * 10;
    close[i] = (high[i] + low[i]) / 2;
    volume[i] = Math.random() * 1000;
}

function runBench(name: string, fn: () => void, iterations = 50) {
    // Warmup
    for(let i=0; i<5; i++) fn();

    const start = performance.now();
    for(let i=0; i<iterations; i++) {
        fn();
    }
    const end = performance.now();
    const duration = end - start;
    const opsPerSec = (iterations / duration) * 1000;
    console.log(`${name}: ${duration.toFixed(2)}ms for ${iterations} ops (${opsPerSec.toFixed(0)} ops/s) -> ${(duration/iterations).toFixed(3)} ms/op`);
}

console.log(`Benchmarking MFI with Length=${LENGTH}`);

console.log(`\n--- Period ${PERIOD} ---`);
runBench(`mfiLegacy (P=${PERIOD})`, () => {
    mfiLegacy(high, low, close, volume, PERIOD);
}, 100);

runBench(`JSIndicators.mfi (Current, P=${PERIOD})`, () => {
    JSIndicators.mfi(high, low, close, volume, PERIOD);
}, 100);

console.log(`\n--- Period ${PERIOD_LARGE} ---`);
runBench(`mfiLegacy (P=${PERIOD_LARGE})`, () => {
    mfiLegacy(high, low, close, volume, PERIOD_LARGE);
}, 20);

runBench(`JSIndicators.mfi (Current, P=${PERIOD_LARGE})`, () => {
    JSIndicators.mfi(high, low, close, volume, PERIOD_LARGE);
}, 20);
