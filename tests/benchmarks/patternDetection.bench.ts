
import { patternDetector } from '../../src/services/patternDetection';
import type { CandleData } from '../../src/services/candlestickPatterns';

// Setup data
const LENGTH = 200;
const candles: CandleData[] = [];

// Fill with random walk
let price = 1000;
for (let i = 0; i < LENGTH; i++) {
    price = price * (1 + (Math.random() - 0.5) * 0.02);
    candles.push({
        open: price,
        high: price * 1.01,
        low: price * 0.99,
        close: price * (1 + (Math.random() - 0.5) * 0.01),
        trend: Math.random() > 0.5 ? 'uptrend' : 'downtrend' // Mock trend
    });
}

function runBench(name: string, fn: () => void, iterations = 10000) {
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

runBench('patternDetector.detect', () => {
    patternDetector.detect(candles);
}, 20000);
