
import { calculateIndicatorsFromArrays } from '../../src/utils/technicalsCalculator';
import { JSIndicators } from '../../src/utils/indicators';
import { DivergenceScanner } from '../../src/utils/divergenceScanner';
import { BufferPool } from '../../src/utils/bufferPool';

// Setup data
const LENGTH = 5000; // Increased length to make O(N*K) more visible
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
    rsi: { length: 14, source: 'close', overbought: 70, oversold: 30 },
    macd: { fastLength: 12, slowLength: 26, signalLength: 9, source: 'close' },
    bb: { length: 20, stdDev: 2 },
    stochastic: { kPeriod: 14, dPeriod: 3, kSmoothing: 3 },
    adx: { adxSmoothing: 14, diLength: 14 },
    cci: { length: 20 },
    ao: { fastLength: 5, slowLength: 34 },
    ichimoku: { conversionPeriod: 9, basePeriod: 26, spanBPeriod: 52, displacement: 26 },
};

const enabledIndicators = {
    rsi: true,
    macd: true,
    bb: true,
    stochastic: true,
    adx: true,
    cci: true,
    ao: true,
    ichimoku: true,
    ema: true,
    // Add pro indicators if enabled by default
    supertrend: true,
    atrtrailingstop: true,
    obv: true,
    volumeprofile: true,
    vwap: true,
    parabolicsar: true,
    mfi: true,
    choppiness: true,
};

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

runBench('calculateIndicatorsFromArrays (Full - No Pool)', () => {
    calculateIndicatorsFromArrays(
        times,
        opens,
        highs,
        lows,
        closes,
        volumes,
        settings as any,
        enabledIndicators
    );
}, 50);

const pool = new BufferPool();
runBench('calculateIndicatorsFromArrays (Full - With Pool)', () => {
    calculateIndicatorsFromArrays(
        times,
        opens,
        highs,
        lows,
        closes,
        volumes,
        settings as any,
        enabledIndicators,
        pool
    );
}, 50);

runBench('Bollinger Bands (20)', () => {
    JSIndicators.bb(closes, 20, 2);
}, 200);

runBench('Stochastic (14)', () => {
    JSIndicators.stoch(highs, lows, closes, 14);
}, 200);

// Bench Individual Heavy Hitters
runBench('Volume Profile', () => {
    JSIndicators.volumeProfile(highs, lows, closes, volumes, 24);
}, 200);

runBench('Ichimoku', () => {
    JSIndicators.ichimoku(highs, lows, 9, 26, 52, 26);
}, 200);

// Mock divergence data
const rsiData = JSIndicators.rsi(closes, 14);

runBench('Divergence Scan (RSI)', () => {
    DivergenceScanner.scan(highs, lows, rsiData, 'RSI');
}, 200);
