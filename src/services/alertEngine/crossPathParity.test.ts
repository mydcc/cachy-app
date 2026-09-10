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

/**
 * FEAT-0028 acceptance criterion 4 — the same indicator, computed by two
 * engines, has to agree.
 *
 * ## Why this matters even though alerts read only one path
 *
 * `indicatorSeries.ts` makes the JS path normative: an alert must not depend on
 * which engine happened to be available. But the *chart* a trader reads while
 * setting that alert is drawn from the WASM path. If the two disagree, the
 * trader arms a rule against one set of numbers and the engine fires on
 * another, and nothing in the product ever says so.
 *
 * ## What is being compared
 *
 * The WASM `TechnicalsCalculator` — the real one, from the committed artefact —
 * driven candle by candle the way `wasmCalculator.ts` drives it in production
 * (`initialize` with history, `update` for the newest, `shift` to commit),
 * against `computeIndicatorSeries` over the same series.
 *
 * The two are different arithmetic by construction: WASM works in `rust_decimal`
 * and JS in `f64`. So they cannot be bit-identical, and the tolerance below is
 * the point of the test rather than an afterthought — it is set at the level of
 * `f64` rounding, so anything structural fails.
 *
 * ## What is not covered
 *
 * The WebGPU path. It needs a real `navigator.gpu`, which no Node test
 * environment provides; the rest of this codebase mocks it wholesale for the
 * same reason (see `engineBenchmark.test.ts`, and BUG-0005's resolution, which
 * settled for a structural check for exactly this reason). Covering it needs a
 * browser, which is Playwright's job, not this file's. Recorded as remaining
 * work in FEAT-0028.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import { CANDLE_SERIES } from "../../lib/rules/__fixtures__/candleSeries";
import { computeIndicatorSeries } from "../../lib/rules/indicatorSeries";
import type { IndicatorRef } from "../../lib/rules/types";

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

/**
 * The bound both engines have to stay inside, as an absolute difference.
 *
 * Absolute rather than relative, because half of these values are differences
 * of two nearly-equal price-scale quantities. The MACD histogram is
 * `(EMA12 - EMA26) - signal`: the inputs are around 50,000 and the output
 * passes through zero at every cross, so a relative bound on the *output* asks
 * for precision the *inputs* never had, and tightens to infinity exactly where
 * the value matters most.
 *
 * The scale that governs is therefore the input's. `f64` carries about 16
 * significant digits, so at 50,000 its own noise is around 1e-11 absolute, and
 * a few hundred EMA steps accumulate some multiple of that. `1e-9` leaves that
 * room and is still nine orders below the mismatch this test was written to
 * catch, which sat at 1.7. A bound loose enough to be quiet about that would
 * not be worth running.
 *
 * It is tied to this fixture's price scale. A series at a different order of
 * magnitude needs this recomputed, not reused.
 */
const TOLERANCE = 1e-9;

/**
 * Where each indicator lands in the WASM result, and how much history it needs.
 *
 * `needs` is not decoration. `TechnicalsCalculator.initialize` decides once,
 * from the history it is handed, whether an indicator is initialised at all —
 * an EMA(50) seeded with 40 candles stays silent rather than starting late. So
 * a sweep from 40 candles legitimately cannot compare it, and the test says so
 * by name instead of quietly comparing nine things and claiming ten.
 */
const MAPPING: Array<{ label: string; group: string; key: string; needs: number; ref: IndicatorRef }> = [
  { label: "SMA(20)", group: "movingAverages", key: "SMA20", needs: 20, ref: { id: "sma", params: { period: 20 } } },
  { label: "EMA(50)", group: "movingAverages", key: "EMA50", needs: 50, ref: { id: "ema", params: { period: 50 } } },
  { label: "VolumeMA(20)", group: "movingAverages", key: "VolMa20", needs: 20, ref: { id: "volume_ma", params: { period: 20 } } },
  { label: "RSI(14)", group: "oscillators", key: "RSI14", needs: 15, ref: { id: "rsi", params: { period: 14 } } },
  { needs: 34, label: "MACD line", group: "oscillators", key: "12-26-9.macd", ref: { id: "macd", params: { fast_period: 12, slow_period: 26, signal_period: 9 }, output: "macd" } },
  { needs: 34, label: "MACD signal", group: "oscillators", key: "12-26-9.signal", ref: { id: "macd", params: { fast_period: 12, slow_period: 26, signal_period: 9 }, output: "signal" } },
  { needs: 34, label: "MACD histogram", group: "oscillators", key: "12-26-9.histogram", ref: { id: "macd", params: { fast_period: 12, slow_period: 26, signal_period: 9 }, output: "histogram" } },
  { needs: 20, label: "Bollinger upper", group: "volatility", key: "BB20_upper", ref: { id: "bollinger", params: { period: 20, std_dev: 2 }, output: "upper" } },
  { needs: 20, label: "Bollinger lower", group: "volatility", key: "BB20_lower", ref: { id: "bollinger", params: { period: 20, std_dev: 2 }, output: "lower" } },
  { needs: 20, label: "Bollinger basis", group: "volatility", key: "BB20_basis", ref: { id: "bollinger", params: { period: 20, std_dev: 2 }, output: "middle" } },
];

/** The settings payload `wasmCalculator.ts` builds, reduced to what is compared. */
const WASM_SETTINGS = JSON.stringify({
  ema: [{ length: 50 }],
  sma: [{ length: 20 }],
  wma: [], vwma: [], hma: [], supertrend: [], psar: [],
  rsi: [{ length: 14 }],
  macd: [{ fast: 12, slow: 26, signal: 9 }],
  stoch: [], cci: [], adx: [], mom: [], wr: [], mfi: [],
  bb: [{ length: 20, std_dev: 2 }],
  atr: [], chop: [],
  volma: [{ length: 20 }],
  vwap: [], pivots: [],
});

interface WasmModule {
  default: (binary: BufferSource) => Promise<unknown>;
  TechnicalsCalculator: new () => {
    initialize(
      closes: string[], highs: string[], lows: string[], volumes: string[],
      times: Float64Array, settingsJson: string,
    ): void;
    update(o: string, h: string, l: string, c: string, v: string, t: string): string;
    shift(o: string, h: string, l: string, c: string, v: string, t: string): void;
  };
}

let wasm: WasmModule;

beforeAll(async () => {
  wasm = (await import(/* @vite-ignore */ WASM_JS)) as unknown as WasmModule;
  await wasm.default(readFileSync(WASM_BINARY));
});

function jsSeries(ref: IndicatorRef): (string | null)[] {
  const result = computeIndicatorSeries({ indicator: ref, timeframe: "1h" }, CANDLE_SERIES);
  if (!result.supported) throw new Error(result.reason);
  return result.values;
}

/**
 * Walk both engines from `startIndex` to the end of the series, collecting the
 * worst relative disagreement per indicator.
 *
 * `startIndex` is how much history WASM is initialised with — the parameter the
 * seeding bug hid behind, so every assertion here names the one it used.
 */
function worstDivergence(startIndex: number): Map<string, { worst: number; at: number; samples: number }> {
  const calc = new wasm.TechnicalsCalculator();
  const history = CANDLE_SERIES.slice(0, startIndex);

  calc.initialize(
    history.map((c) => c.close),
    history.map((c) => c.high),
    history.map((c) => c.low),
    history.map((c) => c.volume ?? "0"),
    new Float64Array(history.map((c) => c.open_time_ms)),
    WASM_SETTINGS,
  );

  const js = new Map(MAPPING.map((m) => [m.label, jsSeries(m.ref)]));
  const result = new Map<string, { worst: number; at: number; samples: number }>();

  for (let i = startIndex; i < CANDLE_SERIES.length; i++) {
    const c = CANDLE_SERIES[i];
    const out = JSON.parse(
      calc.update(c.open, c.high, c.low, c.close, c.volume ?? "0", String(c.open_time_ms)),
    ) as Record<string, Record<string, string> | undefined>;

    for (const m of MAPPING) {
      const fromWasm = out[m.group]?.[m.key];
      const fromJs = js.get(m.label)?.[i];
      if (fromWasm === undefined || fromJs === null || fromJs === undefined) continue;

      const difference = Math.abs(Number(fromWasm) - Number(fromJs));

      const seen = result.get(m.label) ?? { worst: 0, at: -1, samples: 0 };
      seen.samples++;
      if (difference > seen.worst) {
        seen.worst = difference;
        seen.at = i;
      }
      result.set(m.label, seen);
    }

    calc.shift(c.open, c.high, c.low, c.close, c.volume ?? "0", String(c.open_time_ms));
  }
  return result;
}

describe("WASM and JS compute the same indicators", () => {
  /**
   * 40 candles is barely past what the core will evaluate a MACD rule on (27),
   * and is where the seeding mismatch was loudest. Agreement here means
   * agreement everywhere later, because the paths converge rather than drift.
   */
  for (const startIndex of [40, 120, 250]) {
    it(`agrees to within ${TOLERANCE} after ${startIndex} candles of history`, () => {
      const divergence = worstDivergence(startIndex);

      const failures: string[] = [];
      for (const [label, { worst, at, samples }] of divergence) {
        if (samples === 0) {
          failures.push(`${label}: never compared — one engine produced nothing`);
          continue;
        }
        if (worst > TOLERANCE) {
          failures.push(`${label}: worst ${worst.toExponential(3)} at candle ${at} (${samples} samples)`);
        }
      }

      expect(failures).toEqual([]);

      const expected = MAPPING.filter((m) => m.needs <= startIndex).map((m) => m.label);
      expect([...divergence.keys()].sort()).toEqual(expected.sort());
    });
  }

  it("compares every indicator on a real number of candles, not a handful", () => {
    const divergence = worstDivergence(120);
    expect(divergence.size).toBe(MAPPING.length);

    for (const [label, { samples }] of divergence) {
      expect(samples, label).toBeGreaterThan(200);
    }
  });

  /**
   * The regression guard for the seeding mismatch specifically.
   *
   * A tolerance test passes the moment the numbers agree, and would keep
   * passing if someone reintroduced a seeding difference that happened to
   * converge faster. So this asserts the *shape* instead.
   *
   * A seed gap decays geometrically as the EMA forgets it, which means less
   * history disagrees far more than more history does. Before the fix that
   * ratio was about 5,000,000 to 1 between 40 and 250 candles. With one
   * convention on both sides there is no seed left to forget, so the two are
   * the same order of magnitude and the ratio collapses.
   */
  it("does not converge with more history, because there is no seed gap to forget", () => {
    const early = worstDivergence(40).get("MACD histogram");
    const late = worstDivergence(250).get("MACD histogram");

    expect(early).toBeDefined();
    expect(late).toBeDefined();

    const ratio = (early?.worst ?? 0) / Math.max(late?.worst ?? 0, Number.MIN_VALUE);
    expect(ratio).toBeLessThan(1000);
  });
});
