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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { technicalsService } from "./technicalsService";
import { Decimal } from "decimal.js";
import { getEmptyData } from "../utils/technicalsCalculator";
import { indicatorState } from "../stores/indicator.svelte";

// Mock worker to force inline calculation or test worker logic
// Since we are testing the service, and the service tries to instantiate a Worker
// which might fail in test environment, we expect it to fallback or we can mock it.
// For simplicity in unit tests, we often test the inline logic or mock the worker manager.

describe("technicalsService", () => {
  const klines = Array.from({ length: 100 }, (_, i) => ({
    time: 1600000000000 + i * 60000,
    open: new Decimal(100 + i),
    high: new Decimal(105 + i),
    low: new Decimal(95 + i),
    close: new Decimal(102 + i),
    volume: new Decimal(1000),
  }));

  it("should calculate new oscillators correctly", async () => {
    const result = await technicalsService.calculateTechnicals(klines);

    expect(result).toBeDefined();
    expect(result.oscillators.length).toBeGreaterThan(0);

    const rsi = result.oscillators.find((o) => o.name === "RSI");
    expect(rsi).toBeDefined();
    expect(typeof rsi?.value).toBe("number");
    // RSI should be calculable for 100 candles
    expect(rsi!.value).not.toBeNaN();

    const cci = result.oscillators.find((o) => o.name === "CCI");
    expect(cci).toBeDefined();
    expect(typeof cci?.value).toBe("number");

    const adx = result.oscillators.find((o) => o.name === "ADX");
    expect(adx).toBeDefined();
  });

  it("should respect custom settings", async () => {
    const customSettings = {
      ...indicatorState,
      rsi: {
        length: 20,
        source: "close",
        overbought: 80,
        oversold: 20,
        showSignal: false,
        signalType: "sma",
        signalLength: 14,
        defaultTimeframe: "1h",
      },
    } as any; // Cast to any to avoid strict type checks on partial settings

    const result = await technicalsService.calculateTechnicals(
      klines,
      customSettings,
    );
    const rsi = result.oscillators.find((o) => o.name === "RSI");
    expect(rsi?.params).toBe("20");
  });
});
