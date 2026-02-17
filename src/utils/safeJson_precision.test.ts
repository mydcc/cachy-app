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

import { describe, it, expect } from "vitest";
import { safeJsonParse } from "./safeJson";

describe("safeJsonParse Precision", () => {
  it("should preserve high-precision floating point numbers as strings", () => {
    // 19 decimal places
    const highPrecision = "0.1234567890123456789";
    const json = `{"val": ${highPrecision}}`;

    const parsed = safeJsonParse(json);
    expect(parsed.val).toBe(highPrecision);
    expect(typeof parsed.val).toBe("string");
  });

  it("should preserve large floating point numbers as strings", () => {
    const largeFloat = "1234567890.123456789";
    const json = `{"val": ${largeFloat}}`;

    const parsed = safeJsonParse(json);
    expect(parsed.val).toBe(largeFloat);
    expect(typeof parsed.val).toBe("string");
  });

  it("should handle normal floats correctly (as numbers)", () => {
    const normalFloat = "123.45";
    const json = `{"val": ${normalFloat}}`;

    const parsed = safeJsonParse(json);
    expect(parsed.val).toBe(123.45);
    expect(typeof parsed.val).toBe("number");
  });
});
