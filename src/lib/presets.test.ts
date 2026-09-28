// @vitest-environment jsdom
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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONSTANTS } from "./constants";
import { loadPresets } from "./presets";

vi.mock("$app/environment", () => ({
  browser: true,
  dev: true,
}));

describe("preset trade direction normalization", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("normalizes uppercase and mixed-case directions when loading presets", () => {
    localStorage.setItem(
      CONSTANTS.LOCAL_STORAGE_PRESETS_KEY,
      JSON.stringify({
        upper: { tradeType: "SHORT" },
        mixed: { tradeType: "ShOrT" },
        unknown: { tradeType: "UNKNOWN" },
        untouched: { symbol: "ETHUSDT" },
      }),
    );

    const presets = loadPresets();

    expect(presets.upper.tradeType).toBe("short");
    expect(presets.mixed.tradeType).toBe("short");
    expect(presets.unknown.tradeType).toBe("unknown");
    expect(presets.untouched).not.toHaveProperty("tradeType");
  });
});
