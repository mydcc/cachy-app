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
import { technicalsService } from "./technicalsService";
import { Decimal } from "decimal.js";
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

  });

  it("exposes ADX under `advanced` once it is enabled", async () => {
    // ADX is not an oscillator — the calculator writes it to `advanced.adx`
    // alongside its +DI/-DI components. It is also disabled by default
    // (`adx.enabled === false` in indicator.svelte.ts), so it has to be switched
    // on explicitly. The previous version of this assertion searched
    // `result.oscillators` for a name that is never pushed there, with ADX
    // switched off, so it could not have passed either way.
    const base = indicatorState.toJSON();
    const withAdx = {
      ...base,
      adx: { ...base.adx, enabled: true, diLength: 14, adxSmoothing: 14 },
    };

    const result = await technicalsService.calculateTechnicals(klines, withAdx);

    expect(result.advanced?.adx).toBeDefined();
    expect(typeof result.advanced.adx.value).toBe("number");
    expect(typeof result.advanced.adx.pdi).toBe("number");
    expect(typeof result.advanced.adx.mdi).toBe("number");
  });

  it("should respect custom settings", async () => {
    // Oscillators carry { name, value, action } — only movingAverages entries
    // have a `params` string. This used to assert `rsi.params === "20"`, a field
    // oscillators never had.
    //
    // The setting is instead verified by its effect: a different RSI length must
    // produce a different RSI value. That needs price data that actually
    // oscillates — with the strictly rising `klines` fixture every candle is a
    // gain, so RSI saturates at 100 for any length and the lengths are
    // indistinguishable.
    const wave = Array.from({ length: 100 }, (_, i) => {
      const base = 100 + Math.sin(i / 3) * 10;
      return {
        time: 1600000000000 + i * 60000,
        open: new Decimal(base),
        high: new Decimal(base + 2),
        low: new Decimal(base - 2),
        close: new Decimal(base + Math.cos(i / 2)),
        volume: new Decimal(1000),
      };
    });

    const base = indicatorState.toJSON();
    const rsiOf = async (length: number) => {
      const result = await technicalsService.calculateTechnicals(wave, {
        ...base,
        rsi: { ...base.rsi, length },
      });
      return result.oscillators.find((o) => o.name === "RSI")?.value;
    };

    const short = await rsiOf(14);
    const long = await rsiOf(20);

    expect(typeof short).toBe("number");
    expect(typeof long).toBe("number");
    expect(short).not.toBeNaN();
    expect(long).not.toBeNaN();
    expect(short).not.toBe(long);
  });
});
