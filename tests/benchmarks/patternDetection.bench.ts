
import { patternDetector } from '../../src/services/patternDetection';
import type { CandleData } from '../../src/services/candlestickPatterns';

// Setup data
const LENGTH = 1000;
const candles: CandleData[] = [];

// Fill with random walk
let price = 1000;
for (let i = 0; i < LENGTH; i++) {
    price = price * (1 + (Math.random() - 0.5) * 0.01);
    candles.push({
        open: price,
        high: price * 1.01,
        low: price * 0.99,
        close: price * (1 + (Math.random() - 0.5) * 0.005),
        trend: Math.random() > 0.5 ? 'uptrend' : 'downtrend' // Mock trend
    });
}

function runBench(name: string, fn: () => void, iterations = 1000) {
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

runBench('Pattern Detection (1000 candles)', () => {
    // We pass the full array, but detect uses slice inside based on pattern lengths.
    // However, in reality, we might pass a smaller window.
    // But passing a large array also tests the slicing overhead if any (though slice(-N) is fast).
    patternDetector.detect(candles);
}, 2000);

// Test with a smaller window which is more realistic for real-time updates
const smallWindow = candles.slice(-50);
runBench('Pattern Detection (50 candles)', () => {
    patternDetector.detect(smallWindow);
}, 10000);
