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

import { describe, it, expect } from "vitest";
import { getBitunixErrorKey } from "./errorUtils";

describe("errorUtils", () => {
  it("should return the correct key for a known error code", () => {
    expect(getBitunixErrorKey(10001)).toBe("bitunixErrors.10001");
    expect(getBitunixErrorKey("10003")).toBe("bitunixErrors.10003");
    expect(getBitunixErrorKey(30042)).toBe("bitunixErrors.30042");
  });

  it("should return generic error key for unknown error code", () => {
    expect(getBitunixErrorKey(99999)).toBe("apiErrors.generic");
    expect(getBitunixErrorKey("invalid_code")).toBe("apiErrors.generic");
  });

  it("should handle number and string inputs correctly", () => {
    expect(getBitunixErrorKey(20001)).toBe("bitunixErrors.20001");
    expect(getBitunixErrorKey("20001")).toBe("bitunixErrors.20001");
  });
});
