/*
 * Audit Verification Script
 * Validates precision of Bollinger Bands and edge case handling.
 */

import { JSIndicators } from "../src/utils/indicators";

function testBollingerPrecision() {
  console.log("--- Testing Bollinger Bands Precision ---");

  // Case 1: Large numbers, small variance.
  // Base: 1,000,000,000
  // Values: 1e9, 1e9+1, 1e9, 1e9-1, ...
  // Variance should be small (approx 0.5 or so).
  // If "sumSq - N*avg^2" fails, variance might be negative or highly inaccurate.

  const base = 1000000000;
  const data = [
    base,
    base + 1,
    base,
    base - 1,
    base,
    base + 1,
    base,
    base - 1,
    base,
    base + 1
  ];
  const period = 5;

  // Expected (approx):
  // Avg of first 5: 1e9.
  // Variance: ((0)^2 + (1)^2 + (0)^2 + (-1)^2 + (0)^2) / 5 = 2/5 = 0.4
  // StdDev: sqrt(0.4) = 0.6324555

  console.log(`Base Value: ${base}`);
  console.log(`Data (offset from base): [0, 1, 0, -1, 0...]`);

  const result = JSIndicators.bb(data, period, 2);

  // Check index 4 (5th element)
  const idx = 4;
  const middle = result.middle[idx];
  const upper = result.upper[idx];
  const lower = result.lower[idx];
  const stdDevCalc = (upper - middle) / 2;

  console.log(`Index ${idx}:`);
  console.log(`  Middle: ${middle} (Expected: ${base})`);
  console.log(`  Upper:  ${upper}`);
  console.log(`  Lower:  ${lower}`);
  console.log(`  Calc StdDev: ${stdDevCalc} (Expected: ~0.6324555)`);

  const error = Math.abs(stdDevCalc - 0.6324555320336759);
  console.log(`  Error: ${error}`);

  if (error > 1e-5) {
    console.error("FAIL: Precision error detected in BB calculation.");
  } else {
    console.log("PASS: Precision acceptable for 1e9.");
  }

  // Case 2: Extreme numbers (1e15 - approaching JS integer limit)
  const base2 = 1e15;
  const data2 = data.map(v => v - base + base2);
  const result2 = JSIndicators.bb(data2, period, 2);
  const stdDevCalc2 = (result2.upper[idx] - result2.middle[idx]) / 2;

  console.log(`\nBase Value: ${base2} (1e15)`);
  console.log(`  Calc StdDev: ${stdDevCalc2}`);
  const error2 = Math.abs(stdDevCalc2 - 0.6324555320336759);
  console.log(`  Error: ${error2}`);
   if (error2 > 0.1) { // Allow more drift here, but if it's 0 or NaN, it's a fail.
    console.error("FAIL: Precision breakdown at 1e15.");
  } else {
    console.log("PASS: Precision acceptable for 1e15.");
  }
}

function testRsiEdgeCases() {
  console.log("\n--- Testing RSI Edge Cases ---");

  // Case 1: NaN in middle
  const data = [10, 11, 12, NaN, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
  const period = 5;
  // 15 points.
  // NaN at index 3.

  const rsi = JSIndicators.rsi(data, period);

  console.log("Data with NaN at index 3:", data);
  console.log("RSI Output:", rsi);

  // Check propagation
  // If RSI at index 14 is NaN, then it propagated.
  if (isNaN(rsi[14])) {
      console.warn("WARN: NaN propagated to end of array.");
  } else {
      console.log("PASS: RSI recovered from NaN (or wasn't affected).");
  }
}

testBollingerPrecision();
testRsiEdgeCases();
