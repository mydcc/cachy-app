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

import { describe, it, expect, vi, afterEach } from "vitest";
import { jitteredDelay } from "./backoff";

describe("jitteredDelay", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("spreads the delay by ±20 %", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(jitteredDelay(1000, 30000)).toBe(800);

    vi.spyOn(Math, "random").mockReturnValue(0.9999);
    expect(jitteredDelay(1000, 30000)).toBe(1200);
  });

  it("never exceeds the cap, even on the high draw", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9999);
    expect(jitteredDelay(30000, 30000)).toBe(30000);
  });

  it("stays below the cap on the low draw", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(jitteredDelay(30000, 30000)).toBe(24000);
  });
});
