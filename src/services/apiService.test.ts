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
import { apiService } from "./apiService";

describe("apiService - normalizeSymbol", () => {
  it("should normalize basic coin symbols to USDT pair", () => {
    expect(apiService.normalizeSymbol("BTC", "bitunix")).toBe("BTCUSDT");
    expect(apiService.normalizeSymbol("ETH", "bitunix")).toBe("ETHUSDT");
  });

  it("should keep existing USDT symbols", () => {
    expect(apiService.normalizeSymbol("BTCUSDT", "bitunix")).toBe("BTCUSDT");
  });

  it("should strip .P suffix", () => {
    expect(apiService.normalizeSymbol("BTCUSDT.P", "bitunix")).toBe("BTCUSDT");
  });

  it("should strip P from USDTP symbols", () => {
    expect(apiService.normalizeSymbol("BTCUSDTP", "bitunix")).toBe("BTCUSDT");
  });

  it("should handle symbols containing USD but not ending in P", () => {
    expect(apiService.normalizeSymbol("BTCUSD", "bitunix")).toBe("BTCUSD"); // No append USDT
  });

  it("should not strip P from other pairs unless specified", () => {
    // If logic is specific to USDTP
    expect(apiService.normalizeSymbol("BTCUSDP", "bitunix")).toBe("BTCUSDP");
  });

  it("should handle lowercase input", () => {
    expect(apiService.normalizeSymbol("btcusdtp", "bitunix")).toBe("BTCUSDT");
  });
});
