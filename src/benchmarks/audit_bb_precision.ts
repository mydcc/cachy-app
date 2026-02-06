import { JSIndicators } from '../utils/indicators';
import { Decimal } from 'decimal.js';

// Naive, high-precision implementation for verification
function calculateBB_GoldStandard(data: number[], period: number, stdDev: number) {
    const len = data.length;
    const resultUpper = new Float64Array(len).fill(NaN);
    const resultLower = new Float64Array(len).fill(NaN);
    const resultMiddle = new Float64Array(len).fill(NaN);

    for (let i = period - 1; i < len; i++) {
        // 1. Calculate Mean (SMA)
        let sum = new Decimal(0);
        for (let j = 0; j < period; j++) {
            sum = sum.plus(data[i - j]);
        }
        const mean = sum.dividedBy(period);
        resultMiddle[i] = mean.toNumber();

        // 2. Calculate Variance: Sum((x - mean)^2) / N
        let sumSqDiff = new Decimal(0);
        for (let j = 0; j < period; j++) {
            const diff = new Decimal(data[i - j]).minus(mean);
            sumSqDiff = sumSqDiff.plus(diff.pow(2));
        }
        // Population Variance
        const variance = sumSqDiff.dividedBy(period);
        const std = variance.sqrt();

        resultUpper[i] = mean.plus(std.times(stdDev)).toNumber();
        resultLower[i] = mean.minus(std.times(stdDev)).toNumber();
    }
    return { upper: resultUpper, lower: resultLower, middle: resultMiddle };
}

function runTest() {
    console.log("=== Bollinger Bands Precision Audit ===");

    // Case 1: High Price, Low Volatility
    // Base: 1,000,000. Fluctuation: +/- 0.01
    const base = 1000000;
    const period = 20;
    const data: number[] = [];
    for (let i = 0; i < 100; i++) {
        // Toggle between +0.01 and -0.01
        const sign = i % 2 === 0 ? 1 : -1;
        data.push(base + sign * 0.01);
    }

    const start = performance.now();
    const resultCurrent = JSIndicators.bb(data, period, 2);
    const timeCurrent = performance.now() - start;

    const resultGold = calculateBB_GoldStandard(data, period, 2);

    let maxError = 0;
    let maxErrorIdx = -1;

    for (let i = period; i < data.length; i++) {
        const diffUpper = Math.abs(resultCurrent.upper[i] - resultGold.upper[i]);
        const diffLower = Math.abs(resultCurrent.lower[i] - resultGold.lower[i]);

        if (diffUpper > maxError) { maxError = diffUpper; maxErrorIdx = i; }
        if (diffLower > maxError) { maxError = diffLower; maxErrorIdx = i; }
    }

    console.log(`Data: Base ${base}, Fluctuation +/- 0.01`);
    console.log(`Max Error: ${maxError.toExponential(4)}`);
    console.log(`Error at index ${maxErrorIdx}: Current ${resultCurrent.upper[maxErrorIdx]} vs Gold ${resultGold.upper[maxErrorIdx]}`);

    if (maxError > 1e-8) {
        console.error("FAIL: Precision error exceeds 1e-8 tolerance.");
        process.exit(1);
    } else {
        console.log("PASS: Precision within tolerance.");
    }
}

runTest();
