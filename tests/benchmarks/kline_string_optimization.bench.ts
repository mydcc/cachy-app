import { Decimal } from 'decimal.js';

// Simulate typical API response data (mix of strings and numbers)
// Bitunix sends strings in "open", "high", etc. and numbers in "time".
const dataSize = 10000;
const iterations = 50;

const rawData = Array.from({ length: dataSize }, (_, i) => ({
  id: 1678886400000 + i * 60000,
  open: "23456.78",
  high: "23500.12",
  low: "23400.00",
  close: "23480.50",
  vol: "123.456",
  // Sometimes API sends numbers or nulls, simulate mixed bag
  extra: i % 2 === 0 ? 123.45 : null
}));

console.log(`Running benchmark with ${dataSize} items over ${iterations} iterations...`);

// Scenario A: Using new Decimal().toString()
// This mimics the "Inefficient" code pattern.
function runDecimalScenario() {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
        const mapped = rawData.map((k: any) => ({
            open: new Decimal(k.open || 0).toString(),
            high: new Decimal(k.high || 0).toString(),
            low: new Decimal(k.low || 0).toString(),
            close: new Decimal(k.close || 0).toString(),
            volume: new Decimal(k.vol || 0).toString(),
            timestamp: k.id
        }));
    }
    const end = performance.now();
    return end - start;
}

// Scenario B: Using String()
// This mimics the "Current" optimized code pattern.
function runStringScenario() {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
        const mapped = rawData.map((k: any) => ({
            open: String(k.open || 0),
            high: String(k.high || 0),
            low: String(k.low || 0),
            close: String(k.close || 0),
            volume: String(k.vol || 0),
            timestamp: k.id
        }));
    }
    const end = performance.now();
    return end - start;
}

// Warmup
runDecimalScenario();
runStringScenario();

// Execute
const timeDecimal = runDecimalScenario();
const timeString = runStringScenario();

console.log(`\nResults:`);
console.log(`--------------------------------------------------`);
console.log(`Decimal Approach: ${timeDecimal.toFixed(2)}ms`);
console.log(`String Approach:  ${timeString.toFixed(2)}ms`);
console.log(`--------------------------------------------------`);

const speedup = timeDecimal / timeString;
console.log(`Speedup Factor:   ${speedup.toFixed(2)}x Faster`);
console.log(`--------------------------------------------------`);

if (timeString < timeDecimal) {
    console.log("SUCCESS: String conversion is faster.");
} else {
    console.error("FAILURE: String conversion is slower (unexpected).");
    process.exit(1);
}
