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
 * The windowed indicators the Technicals panel shows, checked against the
 * committed WASM artefact rather than the Rust source.
 *
 * The Rust unit tests prove the source. This proves what ships: the artefact in
 * `static/wasm` is committed and is not rebuilt on every Rust merge, so a fixed
 * source next to a stale binary would still show traders the wrong number.
 *
 * Every reference here is recomputed in `Decimal` from the recorded candles by
 * its textbook definition, not taken from the JavaScript indicators — so it
 * can tell which of two disagreeing engines is wrong. Each one exists because
 * `TechnicalsCalculator::update` receives the candle it is updating outside its
 * history, and a window counted from the history alone came out one too long:
 * momentum (BUG-0452), Williams %R and the choppiness range (BUG-0455).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import { Decimal } from "decimal.js";

import { RECORDED_CANDLES } from "./__fixtures__/recordedSeries";

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

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

const SEED = 40;

/**
 * Seed WASM with `SEED` candles, then walk the rest of the fixture and hand
 * each candle's output and index to `check`, which returns a mismatch or null.
 */
function walkWasm(
  settings: object,
  check: (out: Record<string, Record<string, string> | undefined>, i: number) => string | null,
): { wrong: string[]; compared: number } {
  const history = RECORDED_CANDLES.slice(0, SEED);
  const calc = new wasm.TechnicalsCalculator();
  calc.initialize(
    history.map((c) => c.close),
    history.map((c) => c.high),
    history.map((c) => c.low),
    history.map((c) => c.volume ?? "0"),
    new Float64Array(history.map((c) => c.open_time_ms)),
    JSON.stringify(settings),
  );

  const wrong: string[] = [];
  let compared = 0;
  for (let i = SEED; i < RECORDED_CANDLES.length; i++) {
    const c = RECORDED_CANDLES[i];
    const out = JSON.parse(
      calc.update(c.open, c.high, c.low, c.close, c.volume ?? "0", String(c.open_time_ms)),
    ) as Record<string, Record<string, string> | undefined>;
    const mismatch = check(out, i);
    if (mismatch === null) compared++;
    else if (wrong.length < 3) wrong.push(mismatch);
    calc.shift(c.open, c.high, c.low, c.close, c.volume ?? "0", String(c.open_time_ms));
  }
  return { wrong, compared };
}

const high = (i: number) => new Decimal(RECORDED_CANDLES[i].high);
const low = (i: number) => new Decimal(RECORDED_CANDLES[i].low);
const close = (i: number) => new Decimal(RECORDED_CANDLES[i].close);

/** Highest high and lowest low of the `n` candles ending at `i`, inclusive. */
function extremes(i: number, n: number): { highest: Decimal; lowest: Decimal } {
  let highest = high(i);
  let lowest = low(i);
  for (let k = i - n + 1; k < i; k++) {
    highest = Decimal.max(highest, high(k));
    lowest = Decimal.min(lowest, low(k));
  }
  return { highest, lowest };
}

function trueRange(i: number): Decimal {
  const previousClose = close(i - 1);
  return Decimal.max(
    high(i).minus(low(i)),
    high(i).minus(previousClose).abs(),
    low(i).minus(previousClose).abs(),
  );
}

/**
 * Within this bound rather than exact: the choppiness reference goes through
 * `log10`, and `decimal.js` and `rust_decimal` round a quotient at different
 * digit counts. A window one candle off is tens of units away.
 */
const TOLERANCE = new Decimal("1e-9");

function within(shown: string | undefined, expected: Decimal, label: string, i: number): string | null {
  if (shown !== undefined && new Decimal(shown).minus(expected).abs().lte(TOLERANCE)) return null;
  return `candle ${i}: ${label} shown ${shown}, expected ${expected.toFixed(12)}`;
}

describe("WASM windowed indicators against their definitions", () => {
  it("momentum is the close against the close exactly its period back, at every candle", () => {
    const PERIOD = 10;
    const { wrong, compared } = walkWasm({ mom: [{ length: PERIOD }] }, (out, i) => {
      const shown = out.oscillators?.[`MOM${PERIOD}`];
      const expected = close(i).minus(close(i - PERIOD));
      // Exact, not within the tolerance: both sides are one decimal subtraction.
      return shown !== undefined && new Decimal(shown).eq(expected)
        ? null
        : `candle ${i}: shown ${shown}, expected ${expected.toFixed()}`;
    });

    expect(wrong).toEqual([]);
    expect(compared).toBe(RECORDED_CANDLES.length - SEED);
  });

  it("Williams %R reads the highest high and lowest low of exactly its period", () => {
    const PERIOD = 14;
    const { wrong, compared } = walkWasm({ wr: [{ length: PERIOD }] }, (out, i) => {
      const { highest, lowest } = extremes(i, PERIOD);
      const expected = highest.minus(close(i)).div(highest.minus(lowest)).times(-100);
      return within(out.oscillators?.[`WR${PERIOD}`], expected, "%R", i);
    });

    expect(wrong).toEqual([]);
    expect(compared).toBe(RECORDED_CANDLES.length - SEED);
  });

  it("choppiness sums the true ranges and spans the range of the same period", () => {
    const PERIOD = 14;
    const { wrong, compared } = walkWasm({ chop: [{ length: PERIOD }] }, (out, i) => {
      let sum = new Decimal(0);
      for (let k = i - PERIOD + 1; k <= i; k++) sum = sum.plus(trueRange(k));
      const { highest, lowest } = extremes(i, PERIOD);
      const expected = Decimal.log10(sum.div(highest.minus(lowest)))
        .times(100)
        .div(Decimal.log10(PERIOD));
      return within(out.volatility?.[`CHOP${PERIOD}`], expected, "CHOP", i);
    });

    expect(wrong).toEqual([]);
    expect(compared).toBe(RECORDED_CANDLES.length - SEED);
  });
});
