
import { calculateIndicatorsFromArrays } from '../../src/utils/technicalsCalculator';
import { JSIndicators } from '../../src/utils/indicators';
import type { IndicatorSettings } from '../../src/types/indicators';

// Setup data
const LENGTH = 5000;
const times = new Float64Array(LENGTH);
const opens = new Float64Array(LENGTH);
const highs = new Float64Array(LENGTH);
const lows = new Float64Array(LENGTH);
const closes = new Float64Array(LENGTH);
const volumes = new Float64Array(LENGTH);

// Fill with random walk
let price = 1000;
for (let i = 0; i < LENGTH; i++) {
    times[i] = Date.now() + i * 60000;
    price = price * (1 + (Math.random() - 0.5) * 0.01);
    opens[i] = price;
    highs[i] = price * 1.01;
    lows[i] = price * 0.99;
    closes[i] = price * (1 + (Math.random() - 0.5) * 0.005);
    volumes[i] = Math.random() * 1000;
}

const settings = {
    stochRsi: { length: 14, rsiLength: 14, kPeriod: 3, dPeriod: 3 },
} as unknown as IndicatorSettings;

function runBench(name: string, fn: () => void, iterations = 200) {
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

runBench('JSIndicators.stochRsi (Standalone)', () => {
    JSIndicators.stochRsi(closes, 14, 3, 3, 1);
}, 200);

// calculateIndicatorsFromArrays's real signature is
// (highs, lows, closes, opens, volumes, times, settings?) — it uses an
// internal buffer pool singleton and always calculates every configured
// indicator (no separate enabled-indicators or external-pool params), so
// there's only one call shape to benchmark here.
runBench('calculateIndicatorsFromArrays (StochRSI)', () => {
    calculateIndicatorsFromArrays(
        highs,
        lows,
        closes,
        opens,
        volumes,
        times,
        settings
    );
}, 200);
