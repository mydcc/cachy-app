/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
