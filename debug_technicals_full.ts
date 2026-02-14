
import { JSIndicators } from "./src/utils/indicators";
import { BufferPool } from "./src/utils/bufferPool";
import { Decimal } from "decimal.js";

// Mock technicalsCalculator logic
const bufferPool = new BufferPool();
const len = 50;

// Create Mock Klines (Decimal)
const klines = Array.from({ length: len }, (_, i) => ({
    time: i * 60000,
    open: new Decimal(100 + i),
    high: new Decimal(105 + i),
    low: new Decimal(95 + i),
    close: new Decimal(102 + i),
    volume: new Decimal(1000)
}));

// Acquire buffers
const closesNum = bufferPool.acquire(len);
const outMiddle = bufferPool.acquire(len);
const outUpper = bufferPool.acquire(len);
const outLower = bufferPool.acquire(len);

// Fill closes
for (let i = 0; i < len; i++) {
    closesNum[i] = parseFloat(klines[i].close.toString());
}

// Calculate BB
const bbLen = 20;
const bbStdDev = 2;
const bbResults = JSIndicators.bb(closesNum, bbLen, bbStdDev, outMiddle, outUpper, outLower);

const lastIdx = len - 1;
const upper = bbResults.upper[lastIdx];
const lower = bbResults.lower[lastIdx];
const middle = bbResults.middle[lastIdx];
const width = ((upper - lower) / middle) * 100;

console.log(`Last Middle: ${middle}`); // Should be approx 102 + 49 - 10 = 141 ish
console.log(`Last Upper: ${upper}`);
console.log(`Last Lower: ${lower}`);
console.log(`Width: ${width}`);

// Verify NaN handling
const klinesNaN = Array.from({ length: 10 }, (_, i) => ({
    time: i * 60000,
    open: new Decimal(100),
    high: new Decimal(105),
    low: new Decimal(95),
    close: new Decimal(100),
    volume: new Decimal(1000)
}));
const lenNaN = 10;
const closesNaN = bufferPool.acquire(lenNaN);
const outM_NaN = bufferPool.acquire(lenNaN);
const outU_NaN = bufferPool.acquire(lenNaN);
const outL_NaN = bufferPool.acquire(lenNaN);

for(let i=0; i<lenNaN; i++) closesNaN[i] = parseFloat(klinesNaN[i].close.toString());

const bbNaN = JSIndicators.bb(closesNaN, 20, 2, outM_NaN, outU_NaN, outL_NaN);
console.log(`Insufficient Data Width: ${bbNaN.upper[9]}`);

// Test Flat Data (Manual)
const klinesFlat = Array.from({ length: 50 }, (_, i) => ({
    close: new Decimal(100)
}));
const closesFlat = bufferPool.acquire(50);
const outM_Flat = bufferPool.acquire(50);
const outU_Flat = bufferPool.acquire(50);
const outL_Flat = bufferPool.acquire(50);
for(let i=0; i<50; i++) closesFlat[i] = parseFloat(klinesFlat[i].close.toString());

const bbFlat = JSIndicators.bb(closesFlat, 20, 2, outM_Flat, outU_Flat, outL_Flat);
const wFlat = ((bbFlat.upper[49] - bbFlat.lower[49]) / bbFlat.middle[49]) * 100;
console.log("Flat width:", wFlat);
