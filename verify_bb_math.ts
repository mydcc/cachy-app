
import { JSIndicators } from "./src/utils/indicators";

const createBuffer = (len: number, val: number | "NaN" | "inc") => {
  const buf = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    if (val === "NaN") buf[i] = NaN;
    else if (val === "inc") buf[i] = 100 + i;
    else buf[i] = val;
  }
  return buf;
};

// Test 1: Flat Data
const d1 = createBuffer(50, 100);
const bb1 = JSIndicators.bb(d1, 20, 2);
const width1 = (bb1.upper[49] - bb1.lower[49]) / bb1.middle[49] * 100;
console.log("Flat Data Width:", width1);

// Test 2: Real Data (Increasing)
const d2 = createBuffer(50, "inc");
const bb2 = JSIndicators.bb(d2, 20, 2);
const width2 = (bb2.upper[49] - bb2.lower[49]) / bb2.middle[49] * 100;
console.log("Inc Data Width:", width2);

// Test 3: Insufficient Data (NaNs)
const d3 = createBuffer(10, 100); // Only 10 points
const bb3 = JSIndicators.bb(d3, 20, 2);
console.log("Insufficient Data Upper:", bb3.upper[9]);

// Test 4: Mixed NaNs
const d4 = createBuffer(50, 100);
d4[40] = NaN; // Gap
const bb4 = JSIndicators.bb(d4, 20, 2);
console.log("Mixed NaN Data Upper:", bb4.upper[49]);
