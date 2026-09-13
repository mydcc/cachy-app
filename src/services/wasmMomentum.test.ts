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
 * BUG-0452 — the momentum the Technicals panel shows, checked against the
 * committed WASM artefact rather than the Rust source.
 *
 * The Rust unit test proves the source. This proves what ships: the artefact in
 * `static/wasm` is committed and is not rebuilt on every Rust merge, so a fixed
 * source next to a stale binary would still show traders the wrong number.
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

describe("WASM momentum", () => {
  it("is the close against the close exactly its period back, at every candle", () => {
    const PERIOD = 10;
    const SEED = 40;
    const history = RECORDED_CANDLES.slice(0, SEED);

    const calc = new wasm.TechnicalsCalculator();
    calc.initialize(
      history.map((c) => c.close),
      history.map((c) => c.high),
      history.map((c) => c.low),
      history.map((c) => c.volume ?? "0"),
      new Float64Array(history.map((c) => c.open_time_ms)),
      JSON.stringify({ mom: [{ length: PERIOD }] }),
    );

    const wrong: string[] = [];
    let compared = 0;
    for (let i = SEED; i < RECORDED_CANDLES.length; i++) {
      const c = RECORDED_CANDLES[i];
      const out = JSON.parse(
        calc.update(c.open, c.high, c.low, c.close, c.volume ?? "0", String(c.open_time_ms)),
      ) as { oscillators?: Record<string, string> };

      const shown = out.oscillators?.[`MOM${PERIOD}`];
      const expected = new Decimal(c.close).minus(RECORDED_CANDLES[i - PERIOD].close);
      if (shown === undefined || !new Decimal(shown).eq(expected)) {
        if (wrong.length < 3) wrong.push(`candle ${i}: shown ${shown}, expected ${expected.toFixed()}`);
      } else {
        compared++;
      }

      calc.shift(c.open, c.high, c.low, c.close, c.volume ?? "0", String(c.open_time_ms));
    }

    // Exact, not within a tolerance: both sides are decimal subtractions of the
    // same two recorded closes.
    expect(wrong).toEqual([]);
    expect(compared).toBe(RECORDED_CANDLES.length - SEED);
  });
});
