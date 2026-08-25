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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';
import type { Kline, IndicatorSettings } from './technicalsTypes';
import { wasmCalculator } from './wasmCalculator';

/**
 * BUG-0314 recovery contract: a WASM instance that trapped at runtime must be
 * dropped and recreated instead of poisoning every later call until reload.
 */

function kline(close: string, time: number): Kline {
  return {
    open: new Decimal(close),
    high: new Decimal(close).plus(1),
    low: new Decimal(close).minus(1),
    close: new Decimal(close),
    volume: new Decimal('1000'),
    time,
  };
}

interface FakeInstance {
  initialize: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

// Every indicator group disabled, so wasmSettings collapses to empty arrays
// and the fake instances never need to produce real indicator output.
function disabledSettings(): IndicatorSettings {
  const off = { enabled: false } as never;
  return {
    ema: off, sma: off, wma: off, vwma: off, hma: off,
    superTrend: off, parabolicSar: off, rsi: off, macd: off,
    stochastic: off, cci: off, adx: off, momentum: off,
    williamsR: off, mfi: off, bb: off, atr: off,
    choppiness: off, volumeMa: off, vwap: off, pivots: off,
  } as unknown as IndicatorSettings;
}

describe('wasmCalculator runtime-trap recovery', () => {
  // FIFO queue: each `new TechnicalsCalculator()` consumes the next entry,
  // so tests declare instance behaviour in construction order.
  let queue: FakeInstance[];

  // The calculator is a module singleton; clear its cached module/instance
  // so every test starts from a cold load.
  function resetSingleton(): void {
    const c = wasmCalculator as unknown as Record<string, unknown>;
    c.wasmModule = null;
    c.instance = null;
    c.loadingPromise = null;
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    resetSingleton();
    queue = [];

    const fakeModule = {
      default: vi.fn(async () => {}),
      TechnicalsCalculator: class {
        initialize: FakeInstance['initialize'];
        update: FakeInstance['update'];
        constructor() {
          const inst = queue.shift() ?? {
            initialize: vi.fn(),
            update: vi.fn(() => '{}'),
          };
          this.initialize = inst.initialize;
          this.update = inst.update;
        }
      },
    };

    // Stub the dynamic-import seam instead of fetching the real glue.
    (
      wasmCalculator as unknown as { loadGlueModule: (p: string) => Promise<unknown> }
    ).loadGlueModule = vi.fn(async () => fakeModule);
  });

  it('recovers with a fresh instance after a RuntimeError trap', async () => {
    const trapped: FakeInstance = {
      initialize: vi.fn(),
      update: vi.fn(() => {
        throw new Error('RuntimeError: unreachable executed');
      }),
    };
    const healthy: FakeInstance = { initialize: vi.fn(), update: vi.fn(() => '{}') };
    queue.push(trapped, healthy);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await wasmCalculator.calculate(
      [kline('100', 1), kline('101', 2)],
      disabledSettings(),
    );

    expect(result).toBeDefined();
    expect(trapped.update).toHaveBeenCalledTimes(1);
    expect(healthy.initialize).toHaveBeenCalledTimes(1);
    expect(healthy.update).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Runtime trap'),
      expect.stringContaining('RuntimeError'),
    );
  });

  it('does not reset on ordinary errors', async () => {
    const failing: FakeInstance = {
      initialize: vi.fn(),
      update: vi.fn(() => {
        throw new Error('some ordinary failure');
      }),
    };
    queue.push(failing);

    await expect(
      wasmCalculator.calculate([kline('100', 1), kline('101', 2)], disabledSettings()),
    ).rejects.toThrow('some ordinary failure');

    expect(failing.update).toHaveBeenCalledTimes(1);
  });
});
