
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
    // Rust expect closes: &[f64]
    const len = history.length;
    const closes = new Float64Array(len);
    for(let i=0; i<len; i++) {
        closes[i] = history[i].close.toNumber();
    }

    // 2. Call Rust initialize
    // Note: Rust currently mocks settings parsing. We pass empty string for now.
    this.instance.initialize(closes, JSON.stringify(settings || {}));

    // 3. Construct Initial Result
    // Rust doesn't return the full `TechnicalsData` struct yet (it's hard to bind complex structs).
    // It returns internal state setup.
    // For this phase, we might need to RUN the JS calculation once to get the full object structure,
    // since the Rust side is partial.
    // OR we return a dummy structure with just the values Rust tracks.

    // To be safe and compatible, let's run the JS calc ONCE for the history to populate the full object.
    // This seems redundant ($O(N)$), but `initialize` is rare.
    // The main benefit is `update` being $O(1)$ in WASM.

    // Actually, we can just return a basic structure if the UI handles missing fields gracefully.
    // But `technicalsService` expects a full `TechnicalsData`.

    // Let's use `getEmptyData()` and fill what we have.
    const result = getEmptyData();
    // Retrieve initial values from Rust?
    // Rust's `initialize` doesn't return values, it sets state.
    // We can call `update` with the last price to get the current values.
    const lastPrice = closes[len-1];
    const updateJson = this.instance.update(lastPrice);

    return this.parseWasmResult(updateJson, result);
  }

  public update(tick: Kline): TechnicalsData {
      const price = tick.close.toNumber();
      const resultJson = this.instance.update(price);
      return this.parseWasmResult(resultJson, getEmptyData());
  }

  public shift(newCandle: Kline) {
      // WASM shift logic not yet exposed in Rust.
      // For now, we ignore or TODO.
      // Phase 2.5 is focused on basic integration.
  }

  public free() {
      if (this.instance && this.instance.free) {
          this.instance.free();
      }
  }

  private parseWasmResult(json: any, base: TechnicalsData): TechnicalsData {
      // Rust returns a JS object/string directly?
      // Rust `update` returns `JsValue` (string currently in my impl).
      // Let's assume it returns a string JSON for now as per `lib.rs`.

      let data: any;
      if (typeof json === 'string') {
          try {
            data = JSON.parse(json);
          } catch { return base; }
      } else {
          data = json;
      }

      // Map "ema20" -> movingAverages
      if (data.ema20 !== undefined) {
          base.movingAverages.push({
              name: "EMA",
              params: "20",
              value: data.ema20,
              action: "Neutral" // logic needed
          });
      }

      // Map "rsi14" -> oscillators
      if (data.rsi14 !== undefined) {
          base.oscillators.push({
              name: "RSI",
              params: "14",
              value: data.rsi14,
              action: data.rsi14 > 70 ? "Sell" : data.rsi14 < 30 ? "Buy" : "Neutral"
          });
      }

      return base;
  }
}
