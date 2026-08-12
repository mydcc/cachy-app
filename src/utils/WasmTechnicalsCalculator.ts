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

/**
 * Wrapper for the Rust/WASM Technicals Calculator.
 * Adapts the WASM interface to match the JS `StatefulTechnicalsCalculator`.
 */

import type { Kline } from "./indicators";
import type { TechnicalsData } from "../services/technicalsTypes";
import { getEmptyData } from "./technicalsCalculator";

// The WASM glue module and calculator instance it exports — see the
// equivalent (and actually used) types in services/wasmCalculator.ts.
interface WasmTechnicalsInstance {
  initialize(closes: string[], highs: string[], lows: string[], volumes: string[], times: Float64Array, settingsJson: string): void;
  update(open: string, high: string, low: string, close: string, volume: string, time: number): string;
  free?(): void;
}

interface WasmModule {
  TechnicalsCalculator: new () => WasmTechnicalsInstance;
}

// Parsed (or pre-parsed) WASM update/initialize result — assigned straight
// onto the matching TechnicalsData fields below, unlike the reshaping done
// in services/wasmCalculator.ts's WasmRawResult.
interface WasmParsedResult {
  movingAverages?: TechnicalsData["movingAverages"];
  oscillators?: TechnicalsData["oscillators"];
  volatility?: TechnicalsData["volatility"];
  summary?: TechnicalsData["summary"];
  pivots?: TechnicalsData["pivots"];
  pivotBasis?: TechnicalsData["pivotBasis"];
  advanced?: TechnicalsData["advanced"];
}

export class WasmTechnicalsCalculator {
  private instance: WasmTechnicalsInstance | null = null;
  private wasm: WasmModule;

  constructor(wasmModule: WasmModule) {
    this.wasm = wasmModule;
    // Instantiate Rust struct

  }

  public initialize(
    history: Kline[],
    settings: Record<string, unknown>
  ): TechnicalsData {
    // 1. Prepare data for WASM (Float64Array)
    const len = history.length;
    const closes: string[] = new Array(len);
    const highs: string[] = new Array(len);
    const lows: string[] = new Array(len);
    const volumes: string[] = new Array(len);
    const times = new Float64Array(len);

    for(let i=0; i<len; i++) {
        closes[i] = history[i].close.toString();
        highs[i] = history[i].high.toString();
        lows[i] = history[i].low.toString();
        volumes[i] = history[i].volume.toString();
        times[i] = history[i].time;
    }

    // 2. Call Rust initialize
    // Signature Update: initialize(closes, highs, lows, volumes, times, settings)
    try {
        if (!this.instance) this.instance = new this.wasm.TechnicalsCalculator();
        this.instance.initialize(closes, highs, lows, volumes, times, JSON.stringify(settings || {}));

        // 3. Construct Initial Result
        const result = getEmptyData();
        const lastTick = history[len-1];

        const updateJson = this.instance.update(
            lastTick.open.toString(),
            lastTick.high.toString(),
            lastTick.low.toString(),
            lastTick.close.toString(),
            lastTick.volume.toString(),
            lastTick.time
        );

        return this.parseWasmResult(updateJson, result);
    } catch (e) {
        if (this.instance) {
            try { this.instance.free?.(); } catch { /* Ignore */ }
            this.instance = null;
        }
        throw e;
    }
  }

  public update(tick: Kline): TechnicalsData {
      try {
          if (!this.instance) this.instance = new this.wasm.TechnicalsCalculator();
          // Pass full candle data: Open, High, Low, Close, Volume, Time
          const resultJson = this.instance.update(
              tick.open.toString(),
              tick.high.toString(),
              tick.low.toString(),
              tick.close.toString(),
              tick.volume.toString(),
              tick.time
          );
          return this.parseWasmResult(resultJson, getEmptyData());
      } catch (e) {
          if (this.instance) {
              try { this.instance.free?.(); } catch { /* Ignore */ }
              this.instance = null;
          }
          throw e;
      }
  }

  public shift() {
      // WASM shift logic
  }

  public free() {
      if (this.instance && this.instance.free) {
          this.instance.free();
      }
  }

  private parseWasmResult(json: string | WasmParsedResult, base: TechnicalsData): TechnicalsData {
      let data: WasmParsedResult;
      if (typeof json === 'string') {
          try {
            data = JSON.parse(json);
          } catch { return base; }
      } else {
          data = json;
      }

      if (data.movingAverages) base.movingAverages = data.movingAverages;
      if (data.oscillators) base.oscillators = data.oscillators;
      if (data.volatility) base.volatility = data.volatility;
      if (data.summary) base.summary = data.summary;
      if (data.pivots) base.pivots = data.pivots;
      if (data.pivotBasis) base.pivotBasis = data.pivotBasis;
      if (data.advanced) base.advanced = data.advanced;

      return base;
  }
}
