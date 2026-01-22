import { parseDecimal } from './src/utils/utils';
import { Decimal } from 'decimal.js';

const tests = [
  { input: "1.200,50", expected: 1200.5 },
  { input: "1,200.50", expected: 1200.5 },
  { input: "1,5", expected: 1.5 },
  { input: "1.5", expected: 1.5 },
  { input: "1.000.000", expected: 1000000 },
  { input: "1,000,000", expected: 1000000 },
];

tests.forEach(t => {
  const result = parseDecimal(t.input);
  if (result.toNumber() !== t.expected) {
    console.error(`Failed: ${t.input} -> Expected ${t.expected}, got ${result.toNumber()}`);
    process.exit(1);
  }
});
console.log("All tests passed");
