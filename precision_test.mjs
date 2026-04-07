import { Decimal } from 'decimal.js';
import assert from 'assert';

const val1 = "0.1";
const val2 = "0.2";

// Floating point issue
const floatResult = Number(val1) + Number(val2);
console.log("Float Result:", floatResult); // 0.30000000000000004

// Decimal issue
const decimalResult = new Decimal(val1).plus(new Decimal(val2)).toNumber();
console.log("Decimal.toNumber() Result:", decimalResult); // 0.3

// Can we use Decimal directly inside TypedArrays? No, Float64Array takes Numbers.
// The issue here is the comment says "Skip Decimal.toNumber() overhead" and uses `Number(val)`.
// If `val` is a string like "0.1", `Number("0.1")` is fine for charting, BUT if we use these arrays for strict PnL math later, it's problematic.

// Wait, the arrays are `Float64Array`. They MUST store primitive numbers. We can't put `Decimal` objects in them.
