
import { parseDecimal } from '../src/utils/utils';
import { Decimal } from 'decimal.js';

console.log("Running Decimal Repro Test...");

const cases = [
    { input: "1,200", expected: 1200 },       // The critical failure case (EN thousands)
    { input: "1.200", expected: 1.2 },        // Ambiguous. 1.200 could be DE 1200, but in JS/EN it's 1.2. Safer to treat as 1.2.
    { input: "1,200.50", expected: 1200.5 },  // EN standard
    { input: "1.200,50", expected: 1200.5 },  // DE standard
    { input: "1200", expected: 1200 },        // Plain
    { input: "1.2", expected: 1.2 },          // Plain float
    { input: "1,2", expected: 1.2 },          // DE float (ambiguous, usually 1.2)
    { input: "0,123", expected: 0.123 },      // DE float (0 prefix)
    { input: "-0,123", expected: -0.123 },    // DE float (negative 0 prefix)
];

let failed = 0;

cases.forEach(c => {
    const result = parseDecimal(c.input);
    const num = result.toNumber();
    if (num !== c.expected) {
        console.error(`[FAIL] Input: "${c.input}" -> Got: ${num}, Expected: ${c.expected}`);
        failed++;
    } else {
        console.log(`[PASS] Input: "${c.input}" -> ${num}`);
    }
});

if (failed > 0) {
    console.error(`\n${failed} tests failed!`);
    process.exit(1);
} else {
    console.log("\nAll tests passed!");
}
