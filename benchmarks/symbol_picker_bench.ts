import { Decimal } from 'decimal.js';

// Mock data to avoid complex imports
const MAJORS = [
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT"
];

// Generate 2000 symbols
const SYMBOLS = Array.from({ length: 2000 }, (_, i) => `SYM${i}USDT`);
// Add Majors to Symbols
SYMBOLS.push(...MAJORS);

// Mock Snapshot with random volumes
const SNAPSHOT: Record<string, { quoteVolume: string }> = {};
SYMBOLS.forEach(s => {
    SNAPSHOT[s] = {
        quoteVolume: (Math.random() * 100000000).toFixed(8)
    };
});

const ITERATIONS = 1000;

console.log(`Running Benchmark with ${SYMBOLS.length} symbols and ${ITERATIONS} iterations...`);

// ---------------------------------------------------------
// TEST 1: SET CREATION (Majors Filter)
// ---------------------------------------------------------

// Baseline: Re-creating Set every time
function testSetCreationBaseline() {
    let count = 0;
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
        const majors = new Set(MAJORS);
        const res = SYMBOLS.filter(s => majors.has(s));
        count += res.length;
    }
    const end = performance.now();
    return end - start;
}

// Optimized: Hoisted Set
const majorsSet = new Set(MAJORS);
function testSetCreationOptimized() {
    let count = 0;
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
        // defined outside
        const res = SYMBOLS.filter(s => majorsSet.has(s));
        count += res.length;
    }
    const end = performance.now();
    return end - start;
}

// ---------------------------------------------------------
// TEST 2: VOLUME FILTER
// ---------------------------------------------------------

const MIN_VOL = 1000000; // 1M

// Baseline: new Decimal()
function testVolumeFilterBaseline() {
    let count = 0;
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
        const res = SYMBOLS.filter(s => {
            const data = SNAPSHOT[s];
            if (!data) return false;
            return new Decimal(data.quoteVolume || 0).gte(MIN_VOL);
        });
        count += res.length;
    }
    const end = performance.now();
    return end - start;
}

// Optimized: Number()
function testVolumeFilterOptimized() {
    let count = 0;
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
        const res = SYMBOLS.filter(s => {
            const data = SNAPSHOT[s];
            if (!data) return false;
            // Using Number/parseFloat is much faster
            return Number(data.quoteVolume || 0) >= MIN_VOL;
        });
        count += res.length;
    }
    const end = performance.now();
    return end - start;
}

// ---------------------------------------------------------
// TEST 3: VOLUME SORT
// ---------------------------------------------------------

// We'll sort a subset to be realistic (e.g. filtered list)
const FILTERED_SYMBOLS = SYMBOLS.slice(0, 500);

// Baseline: new Decimal() in sort
function testVolumeSortBaseline() {
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
        const toSort = [...FILTERED_SYMBOLS];
        toSort.sort((a, b) => {
             const volA = new Decimal(SNAPSHOT[a]?.quoteVolume || 0).toNumber();
             const volB = new Decimal(SNAPSHOT[b]?.quoteVolume || 0).toNumber();
             return volB - volA;
        });
    }
    const end = performance.now();
    return end - start;
}

// Optimized: Number() in sort
function testVolumeSortOptimized() {
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
        const toSort = [...FILTERED_SYMBOLS];
        toSort.sort((a, b) => {
             const volA = Number(SNAPSHOT[a]?.quoteVolume || 0);
             const volB = Number(SNAPSHOT[b]?.quoteVolume || 0);
             return volB - volA;
        });
    }
    const end = performance.now();
    return end - start;
}


// RUN TESTS

const t1_base = testSetCreationBaseline();
const t1_opt = testSetCreationOptimized();
console.log(`\n[Majors Filter] Set Creation vs Hoisted`);
console.log(`Baseline (Creation): ${t1_base.toFixed(2)}ms`);
console.log(`Optimized (Hoisted): ${t1_opt.toFixed(2)}ms`);
console.log(`Improvement: ${(t1_base / t1_opt).toFixed(2)}x`);

const t2_base = testVolumeFilterBaseline();
const t2_opt = testVolumeFilterOptimized();
console.log(`\n[Volume Filter] Decimal vs Number`);
console.log(`Baseline (Decimal): ${t2_base.toFixed(2)}ms`);
console.log(`Optimized (Number): ${t2_opt.toFixed(2)}ms`);
console.log(`Improvement: ${(t2_base / t2_opt).toFixed(2)}x`);

const t3_base = testVolumeSortBaseline();
const t3_opt = testVolumeSortOptimized();
console.log(`\n[Volume Sort] Decimal vs Number`);
console.log(`Baseline (Decimal): ${t3_base.toFixed(2)}ms`);
console.log(`Optimized (Number): ${t3_opt.toFixed(2)}ms`);
console.log(`Improvement: ${(t3_base / t3_opt).toFixed(2)}x`);
