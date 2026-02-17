/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */


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
