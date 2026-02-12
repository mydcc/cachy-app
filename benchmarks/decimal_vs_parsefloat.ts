import { Decimal } from "decimal.js";

const ITERATIONS = 1_000_000;
const testValues = [
  "0",
  "0.0",
  "0.000",
  "10.5",
  "100",
  "-5.2",
  "0.00000001",
  "-0.00000001",
  "123456789.123456789",
  null,
  undefined,
];

console.log(`Running benchmark with ${ITERATIONS} iterations per method...`);

// Benchmark 1: Decimal.js
const startDecimal = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  for (const val of testValues) {
    const p = { size: val };
    const res = !new Decimal(p.size || 0).isZero();
  }
}
const endDecimal = performance.now();
const timeDecimal = endDecimal - startDecimal;

console.log(`Decimal.js: ${timeDecimal.toFixed(2)}ms`);

// Benchmark 2: parseFloat
const startParseFloat = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  for (const val of testValues) {
    const p = { size: val };
    // Simulate the behavior: parseFloat(val) !== 0
    // Note: p.size || 0 handles null/undefined becoming 0 before parseFloat
    // But parseFloat("0") is 0.
    const size = p.size || 0;
    const res = parseFloat(size as string) !== 0;
  }
}
const endParseFloat = performance.now();
const timeParseFloat = endParseFloat - startParseFloat;

console.log(`parseFloat: ${timeParseFloat.toFixed(2)}ms`);

const speedup = timeDecimal / timeParseFloat;
console.log(`Speedup: ${speedup.toFixed(2)}x`);
