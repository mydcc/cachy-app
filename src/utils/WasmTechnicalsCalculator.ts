
/*
 * Copyright (C) 2026 MYDCT
 *
 * Wrapper for the Rust/WASM Technicals Calculator.
 * Adapts the WASM interface to match the JS `StatefulTechnicalsCalculator`.
 */

import type { Kline } from "./indicators";
import type { TechnicalsData } from "../services/technicalsTypes";
import { getEmptyData } from "./technicalsCalculator";

export class WasmTechnicalsCalculator {
  private instance: any; // WASM struct instance
  private wasm: any; // WASM module

  constructor(wasmModule: any) {
    this.wasm = wasmModule;
    // Instantiate Rust struct
    this.instance = new wasmModule.TechnicalsCalculator();
  }

  public initialize(
    history: Kline[],
    settings: any,
    enabledIndicators?: Partial<Record<string, boolean>>
  ): TechnicalsData {
    // 1. Prepare data for WASM (Float64Array)
    const len = history.length;
    const closes = new Float64Array(len);
    const highs = new Float64Array(len);
    const lows = new Float64Array(len);
    const volumes = new Float64Array(len);
    const times = new Float64Array(len);

    for(let i=0; i<len; i++) {
        closes[i] = history[i].close.toNumber();
        highs[i] = history[i].high.toNumber();
        lows[i] = history[i].low.toNumber();
        volumes[i] = history[i].volume.toNumber();
        times[i] = history[i].time;
    }

    // 2. Call Rust initialize
    // Signature Update: initialize(closes, highs, lows, volumes, times, settings)
    this.instance.initialize(closes, highs, lows, volumes, times, JSON.stringify(settings || {}));

    // 3. Construct Initial Result
    const result = getEmptyData();
    const lastTick = history[len-1];

    const updateJson = this.instance.update(
        lastTick.open.toNumber(),
        lastTick.high.toNumber(),
        lastTick.low.toNumber(),
        lastTick.close.toNumber(),
        lastTick.volume.toNumber(),
        lastTick.time
    );

    return this.parseWasmResult(updateJson, result);
  }

  public update(tick: Kline): TechnicalsData {
      // Pass full candle data: Open, High, Low, Close, Volume, Time
      const resultJson = this.instance.update(
          tick.open.toNumber(),
          tick.high.toNumber(),
          tick.low.toNumber(),
          tick.close.toNumber(),
          tick.volume.toNumber(),
          tick.time
      );
      return this.parseWasmResult(resultJson, getEmptyData());
  }

  public shift(newCandle: Kline) {
      // WASM shift logic
  }

  public free() {
      if (this.instance && this.instance.free) {
          this.instance.free();
      }
  }

  private parseWasmResult(json: any, base: TechnicalsData): TechnicalsData {
      let data: any;
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
