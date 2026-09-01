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

/*
 * Copyright (C) 2026 MYDCT
 *
 * WebAssembly Bridge for Technicals Calculation
 * Hardened version using static assets.
 */

import type { Kline, TechnicalsData, IndicatorSettings } from './technicalsTypes';
import { getEmptyData, deriveChoppinessState } from './technicalsTypes';
import { toNumFast } from '../utils/fastConversion';

// The WASM glue module and calculator instance it exports — both are
// dynamically imported from a static asset (see ensureLoaded below), so
// there is no static type from the module itself to import.
interface WasmTechnicalsInstance {
  initialize(closes: string[], highs: string[], lows: string[], volumes: string[], times: Float64Array, settingsJson: string): void;
  update(open: string, high: string, low: string, close: string, volume: string, time: string): string;
  shift(open: string, high: string, low: string, close: string, volume: string, time: string): void;
}

interface WasmModule {
  default: (wasmBinaryPath: string) => Promise<void>;
  TechnicalsCalculator: new () => WasmTechnicalsInstance;
}

interface WasmInstanceEntry {
  instance: WasmTechnicalsInstance;
  // First candle time of the history initialize() was called with, and the
  // time of the last candle shift() committed. Both must match the incoming
  // klines for a shift() update: same history start (firstTime) and the
  // second-to-last incoming candle == the previously committed last one.
  firstTime: number;
  lastTime: number;
}

// Parsed JSON emitted by the WASM module — flat maps of indicator name to
// value, grouped and reshaped into TechnicalsData below.
// Since the Rust side moved to rust_decimal, every value in these maps is
// serialized as a decimal *string*, not a JSON number. Typing them honestly
// keeps the conversion below explicit — a bare `as number` cast would compile
// and then silently put strings into TechnicalsData's number fields.
interface WasmRawResult {
  movingAverages?: Record<string, string>;
  oscillators?: Record<string, string>;
  volatility?: Record<string, string>;
  pivots?: Record<string, string>;
}

// TechnicalsData is a display-layer type and still holds native numbers, so
// the decimal strings are parsed exactly once, here at the boundary.
function fromWasmDecimal(value: string | undefined): number {
  if (value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

class WasmCalculator {
  private wasmModule: WasmModule | null = null;
  // Persistent calculator instances keyed by the settings snapshot. Each
  // entry keeps the candle range it last committed via shift(), so a follow-up
  // call with one new candle (same settings, same history start) can skip the
  // O(N) initialize() replay and push just the newest candle (IDEA-0318 F-9).
  private instances = new Map<string, WasmInstanceEntry>();
  private loadingPromise: Promise<void> | null = null;

  // Cap on live WASM instances. Each holds the full indicator state (decimal
  // rolling windows), so an unbounded map across settings churn would leak
  // memory. Oldest-inserted eviction keeps the count flat for the realistic
  // one-settings-at-a-time usage.
  private static readonly MAX_INSTANCES = 8;

  // Seam for unit tests: stubbing this avoids the real dynamic import of the
  // runtime URL (which only resolves against the served static directory).
  // Production behavior is unchanged — it is the same dynamic import.
  private loadGlueModule(path: string): Promise<WasmModule> {
    return import(/* @vite-ignore */ path);
  }
  
  async ensureLoaded(): Promise<void> {
    if (this.wasmModule) return;
    if (this.loadingPromise) return this.loadingPromise;
    
    this.loadingPromise = (async () => {
        let lastError: Error | null = null;
        const maxRetries = 3;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Import the glue code from the static directory
                // Note: We use a relative path from the current file to the static asset via Vite's resolution
                const wasmJsPath = '/wasm/technicals_wasm.js';
                const wasmBinaryPath = '/wasm/technicals_wasm_bg.wasm';

                // We use dynamic import on the static URL. 
                // In SvelteKit/Vite, /static/ maps to / at runtime.
                const mod = await this.loadGlueModule(wasmJsPath);
                
                // Initialize with the explicit path to the binary
                await mod.default(wasmBinaryPath);
                
                this.wasmModule = mod;
                if (import.meta.env.DEV) {
                    console.log(`[WASM] Engine initialized successfully (Attempt ${attempt}).`);
                }
                return; // Success!
            } catch (error) {
                // `catch` binds unknown; normalise once rather than typing the
                // binding as any and reaching into it four times.
                const err = error instanceof Error ? error : new Error(String(error));
                lastError = err;
                console.warn(`[WASM] Load attempt ${attempt}/${maxRetries} failed:`, err.message);

                // Classify error
                const isCompileError = err.message.includes('LinkError') || err.message.includes('CompileError');
                
                // If it's a compile error, retrying won't help.
                if (isCompileError) throw err;
                
                // If expected retry, wait with backoff
                if (attempt < maxRetries) {
                    const delay = 200 * Math.pow(2, attempt - 1); // 200, 400, 800
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }
        
        // If we get here, all retries failed
        console.error(`[WASM] Failed to initialize after ${maxRetries} attempts.`);
        this.loadingPromise = null;
        throw lastError || new Error('WASM module failed to load');
    })();
    
    return this.loadingPromise;
  }

  async calculate(klines: Kline[], settings: IndicatorSettings): Promise<TechnicalsData> {
    // A $derived on the IndicatorManager snapshot — cheap and stable across
    // calls, so two ticks with unchanged settings share one WASM instance.
    const settingsKey = settings?._cachedJson || JSON.stringify(settings);
    try {
      return await this.runCalculation(klines, settings, settingsKey);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // A trapped WASM instance cannot be reused — every further call would
      // rethrow until page reload (BUG-0314). Drop the poisoned instance (and
      // only that one; other settings keys keep their warm instances) and the
      // module handle, then retry exactly once against a fresh load.
      const isRuntimeTrap =
        err.message.includes('RuntimeError') ||
        err.message.includes('unreachable') ||
        err.name === 'RuntimeError';
      if (isRuntimeTrap) {
        console.warn('[WASM] Runtime trap detected, recreating instance:', err.message);
        this.instances.delete(settingsKey);
        this.wasmModule = null;
        this.loadingPromise = null;
        return this.runCalculation(klines, settings, settingsKey);
      }
      throw err;
    }
  }

  private async runCalculation(
    klines: Kline[],
    settings: IndicatorSettings,
    settingsKey: string
  ): Promise<TechnicalsData> {
    await this.ensureLoaded();
    if (!this.wasmModule) throw new Error('WASM unavailable');

    let entry = this.instances.get(settingsKey);
    const firstTime = klines[0]?.time ?? 0;
    const last = klines[klines.length - 1];

    // Incremental shift() update (IDEA-0318 F-9): same settings key AND the
    // incoming history still starts at the committed firstTime AND the
    // second-to-last incoming candle is the previously committed last one.
    // That last condition is the double-count guard (BUG-0315): a fresh
    // candle that was already committed would be applied again. When it
    // holds, only the newest candle is new — push it via shift() instead of
    // replaying initialize() over the whole history.
    if (
      entry &&
      firstTime === entry.firstTime &&
      klines.length >= 2 &&
      klines[klines.length - 2].time === entry.lastTime
    ) {
      const resultJson = entry.instance.update(
        last.open.toString(),
        last.high.toString(),
        last.low.toString(),
        last.close.toString(),
        last.volume ? last.volume.toString() : "0",
        last.time.toString()
      );
      // update() is a read of the state including `last`; shift() commits the
      // same candle so the next tick sees it as history (streaming protocol
      // pinned by test_streaming_update_shift_equals_batch).
      entry.instance.shift(
        last.open.toString(),
        last.high.toString(),
        last.low.toString(),
        last.close.toString(),
        last.volume ? last.volume.toString() : "0",
        last.time.toString()
      );
      entry.lastTime = last.time;
      // Reorder as most-recently-used for LRU eviction semantics
      this.instances.delete(settingsKey);
      this.instances.set(settingsKey, entry);
      return this.convertResult(JSON.parse(resultJson), klines, settings);
    }

    // Full initialization — either first call for this settings key, or the
    // history changed in a way that invalidates the committed range.
    if (!entry) {
      if (this.instances.size >= WasmCalculator.MAX_INSTANCES) {
        const oldestKey = this.instances.keys().next().value;
        if (oldestKey) this.instances.delete(oldestKey);
      }
      entry = { instance: new this.wasmModule.TechnicalsCalculator(), firstTime, lastTime: 0 };
      this.instances.set(settingsKey, entry);
    }

    // Prices and volumes cross the boundary as decimal strings so the WASM
    // side can parse them straight into rust_decimal. Only `times` stays
    // numeric — it is a timestamp, not a financial value.
    //
    // Module protocol (see the Rust test_initialize_and_update_are_exact):
    // initialize() receives the HISTORY and update() receives the newest
    // candle. Passing the last candle to both double-counts it in every
    // rolling-window indicator, so the history here is everything except the
    // final kline (BUG-0315).
    const history = klines.slice(0, -1);
    const hLen = history.length;
    const closes = new Array<string>(hLen);
    const highs = new Array<string>(hLen);
    const lows = new Array<string>(hLen);
    const volumes = new Array<string>(hLen);
    const times = new Float64Array(hLen);

    for (let i = 0; i < hLen; i++) {
      const k = history[i];
      closes[i] = k.close.toString();
      highs[i] = k.high.toString();
      lows[i] = k.low.toString();
      volumes[i] = k.volume ? k.volume.toString() : "0";
      times[i] = k.time;
    }

    // Settings conversion for WASM module (matches Rust IndicatorSettings struct)
    const wasmSettings = {
        // Trend
        ema: settings.ema?.enabled !== false ? [settings.ema.ema1, settings.ema.ema2, settings.ema.ema3].filter(s => s.length > 0).map(s => ({ length: s.length })) : [],
        sma: settings.sma?.enabled !== false ? [settings.sma.sma1, settings.sma.sma2, settings.sma.sma3].filter(s => s.length > 0).map(s => ({ length: s.length })) : [],
        wma: settings.wma?.enabled !== false && settings.wma.length > 0 ? [{ length: settings.wma.length }] : [],
        vwma: settings.vwma?.enabled !== false && settings.vwma.length > 0 ? [{ length: settings.vwma.length }] : [],
        hma: settings.hma?.enabled !== false && settings.hma.length > 0 ? [{ length: settings.hma.length }] : [],
        supertrend: settings.superTrend?.enabled !== false && settings.superTrend.period > 0 ? [{ length: settings.superTrend.period, multiplier: settings.superTrend.factor }] : [],
        psar: settings.parabolicSar?.enabled !== false ? [{ start: settings.parabolicSar.start, increment: settings.parabolicSar.increment, max: settings.parabolicSar.max }] : [],

        // Oscillators
        rsi: settings.rsi?.enabled !== false && settings.rsi.length > 0 ? [{ length: settings.rsi.length }] : [],
        macd: settings.macd?.enabled !== false && settings.macd.fastLength > 0 ? [{ fast: settings.macd.fastLength, slow: settings.macd.slowLength, signal: settings.macd.signalLength }] : [],
        stoch: settings.stochastic?.enabled !== false && settings.stochastic.kPeriod > 0 ? [{ k: settings.stochastic.kPeriod, d: settings.stochastic.dPeriod, smooth: settings.stochastic.kSmoothing }] : [],
        cci: settings.cci?.enabled !== false && settings.cci.length > 0 ? [{ length: settings.cci.length }] : [],
        adx: settings.adx?.enabled !== false ? [{ length: settings.adx.adxSmoothing }] : [],
        mom: settings.momentum?.enabled !== false && settings.momentum.length > 0 ? [{ length: settings.momentum.length }] : [],
        wr: settings.williamsR?.enabled !== false && settings.williamsR.length > 0 ? [{ length: settings.williamsR.length }] : [],
        mfi: settings.mfi?.enabled !== false && settings.mfi.length > 0 ? [{ length: settings.mfi.length }] : [],

        // Volatility
        bb: settings.bollingerBands?.enabled !== false && settings.bollingerBands.length > 0 ? [{ length: settings.bollingerBands.length, std_dev: settings.bollingerBands.stdDev }] : [],
        atr: settings.atr?.enabled !== false && settings.atr.length > 0 ? [{ length: settings.atr.length }] : [],
        chop: settings.choppiness?.enabled !== false && settings.choppiness.length > 0 ? [{ length: settings.choppiness.length }] : [],

        // Volume & Other
        volma: settings.volumeMa?.enabled !== false && settings.volumeMa.length > 0 ? [{ length: settings.volumeMa.length }] : [],
        vwap: settings.vwap?.enabled !== false ? [{ anchor: settings.vwap.anchor }] : [],
        pivots: settings.pivots?.enabled !== false ? [{ type_: settings.pivots.type }] : []
    };

    entry.instance.initialize(closes, highs, lows, volumes, times, JSON.stringify(wasmSettings));
    entry.firstTime = firstTime;

    // Pass the Decimal values straight through as strings. Reading them back
    // out of the Float64Arrays above would round-trip them through f64 first
    // and throw away the precision the string boundary exists to preserve.
    const resultJson = entry.instance.update(
        last.open.toString(),
        last.high.toString(),
        last.low.toString(),
        last.close.toString(),
        last.volume ? last.volume.toString() : "0",
        last.time.toString()
    );
    // Commit the newest candle so the next tick can shift() instead of replay.
    entry.instance.shift(
        last.open.toString(),
        last.high.toString(),
        last.low.toString(),
        last.close.toString(),
        last.volume ? last.volume.toString() : "0",
        last.time.toString()
    );
    entry.lastTime = last.time;
    // Reorder as most-recently-used for LRU eviction semantics
    this.instances.delete(settingsKey);
    this.instances.set(settingsKey, entry);

    return this.convertResult(JSON.parse(resultJson), klines, settings);
  }
  
  private convertResult(raw: WasmRawResult, klines: Kline[], settings: IndicatorSettings): TechnicalsData {
    const data = getEmptyData();
    const lastPrice = toNumFast(klines[klines.length - 1].close);
    
    // 1. Moving Averages
    if (raw.movingAverages) {
        data.movingAverages = [];
        for (const [key, value] of Object.entries(raw.movingAverages)) {
            const val = fromWasmDecimal(value);
            
            // Standard MAs
            data.movingAverages.push({
                name: key.replace(/\d+/, ''), // Extract "EMA" from "EMA9"
                params: key.replace(/\D+/, ''), // Extract "9"
                value: val,
                action: lastPrice > val ? 'Buy' : 'Sell'
            });

            // Map VolumeMA to advanced
            if (key.startsWith("VolMa")) {
                if (!data.advanced) data.advanced = {};
                data.advanced.volumeMa = val;
            }
        }
    }

    // 2. Oscillators
    if (raw.oscillators) {
        data.oscillators = [];
        const macdGroups: Record<string, Record<string, number>> = {};
        const stochGroups: Record<string, Record<string, number>> = {};
        const adxGroups: Record<string, Record<string, number>> = {};

        for (const [key, value] of Object.entries(raw.oscillators)) {
            const val = fromWasmDecimal(value);

            if (key.includes(".macd") || key.includes(".signal") || key.includes(".histogram")) {
                const [params, type] = key.split('.');
                if (!macdGroups[params]) macdGroups[params] = {};
                macdGroups[params][type] = val;
            } else if (key.startsWith("STOCH")) {
                const [pre, type] = key.split('.'); // STOCH_14-3-3 . k
                const params = pre.replace("STOCH_", "");
                if (!stochGroups[params]) stochGroups[params] = {};
                stochGroups[params][type] = val;
            } else if (key.startsWith("ADX")) {
                // ADX14, ADX14_plus, ADX14_minus
                const parts = key.split('_');
                const base = parts[0]; // ADX14
                const type = parts.length > 1 ? parts[1] : 'main';
                const len = base.replace("ADX", "");
                if (!adxGroups[len]) adxGroups[len] = {};
                adxGroups[len][type] = val;
            } else if (key.startsWith("RSI")) {
                data.oscillators.push({
                    name: "RSI",
                    params: key.replace("RSI", ""),
                    value: val,
                    action: val > 70 ? "Sell" : (val < 30 ? "Buy" : "Neutral")
                });
            } else if (key.startsWith("CCI")) {
                data.oscillators.push({
                    name: "CCI",
                    params: key.replace("CCI", ""),
                    value: val,
                    action: val > 100 ? "Sell" : (val < -100 ? "Buy" : "Neutral")
                });
            } else if (key.startsWith("MOM")) {
                data.oscillators.push({ name: "Momentum", params: key.replace("MOM", ""), value: val, action: val > 0 ? "Buy" : "Sell" });
            } else if (key.startsWith("WR")) {
                const action = val > -20 ? "Sell" : (val < -80 ? "Buy" : "Neutral");
                data.oscillators.push({ name: "Williams %R", params: key.replace("WR", ""), value: val, action });
                
                // Advanced mapping
                if (!data.advanced) data.advanced = {};
                data.advanced.williamsR = { value: val, action };

            } else if (key.startsWith("MFI")) {
                 const action = val > 80 ? "Sell" : (val < 20 ? "Buy" : "Neutral");
                 data.oscillators.push({ name: "MFI", params: key.replace("MFI", ""), value: val, action });
                 
                 // Advanced mapping
                 if (!data.advanced) data.advanced = {};
                 data.advanced.mfi = { value: val, action };
            }
        }
        
        // Add Grouped MACD
        for (const [params, vals] of Object.entries(macdGroups)) {
            if (vals.macd !== undefined && vals.signal !== undefined && vals.histogram !== undefined) {
                 data.oscillators.push({
                    name: "MACD",
                    params: params,
                    value: vals.macd,
                    signal: vals.signal,
                    histogram: vals.histogram,
                    action: vals.macd > vals.signal ? "Buy" : "Sell"
                });
            }
        }
        
        // Add Grouped Stoch
        for (const [params, vals] of Object.entries(stochGroups)) {
             data.oscillators.push({
                name: "Stoch",
                params: params,
                value: vals.k,
                signal: vals.d,
                action: vals.k > 80 ? "Sell" : (vals.k < 20 ? "Buy" : "Neutral")
            });
        }

        // Add Grouped ADX
        for (const [len, vals] of Object.entries(adxGroups)) {
            if (vals.main !== undefined) {
                let action: "Buy" | "Sell" | "Neutral" | "Strong Buy" | "Strong Sell" = "Neutral";
                // Determine action based on DI if available
                if (vals.plus !== undefined && vals.minus !== undefined && vals.main > 25) {
                    action = vals.plus > vals.minus ? "Buy" : "Sell";
                }
                
                data.oscillators.push({
                    name: "ADX",
                    params: len,
                    value: vals.main,
                    action: action
                });
            }
        }
    }

    // 3. Volatility & Advanced
    if (raw.volatility) {
        if (!data.volatility) data.volatility = { atr: 0, bb: { upper: 0, lower: 0, middle: 0, percentP: 0 }};
        if (!data.advanced) data.advanced = {};

        const bbGroups: Record<string, Record<string, number>> = {};
        const stGroups: Record<string, Record<string, number>> = {};

        for (const [key, value] of Object.entries(raw.volatility)) {
             const val = fromWasmDecimal(value);
             
             if (key.startsWith("BB")) {
                 const parts = key.split('_');
                 const params = parts[0]; 
                 const type = parts[1]; 
                 if (!bbGroups[params]) bbGroups[params] = {};
                 bbGroups[params][type] = val;
             } else if (key.startsWith("SuperTrend")) {
                 if (key.endsWith("_upper") || key.endsWith("_lower")) {
                     const parts = key.split('_'); 
                     const params = parts[1];
                     const type = parts[2];
                     if (!stGroups[params]) stGroups[params] = {};
                     stGroups[params][type] = val;
                 } else {
                     const parts = key.split('_');
                     const params = parts[1];
                     if (!stGroups[params]) stGroups[params] = {};
                     stGroups[params]['trend'] = val; 
                 }
             } else if (key.startsWith("ATR")) {
                 const [, len] = key.split("ATR");
                 if (parseInt(len) === settings.atr.length) {
                     data.volatility.atr = val;
                 }
             } else if (key.startsWith("CHOP")) {
                  data.advanced.choppiness = deriveChoppinessState(val);
              } else if (key === "PSAR") {
                  data.advanced.parabolicSar = val;
              } else if (key.startsWith("VWAP")) {
                   data.advanced.vwap = val;
              }
        }
        
        // Finalize BB
        for (const [params, vals] of Object.entries(bbGroups)) {
             const len = parseInt(params.replace("BB", ""));
             // Only map if it matches the primary BB setting, as TechnicalsData only holds one BB result
             // (Or simplistic logic: take the last one encountered)
             if (len === settings.bollingerBands.length) {
                 const upper = vals.upper;
                 const lower = vals.lower;
                 const middle = vals.basis;
                 const percentP = upper !== lower ? (lastPrice - lower) / (upper - lower) : 0.5;
                 data.volatility.bb = { upper, lower, middle, percentP };
             }
        }

        // Finalize SuperTrend
        for (const [params, vals] of Object.entries(stGroups)) {
            // params "10-3"
            const [len, mult] = params.split('-').map(Number);
            if (len === settings.superTrend.period && mult === settings.superTrend.factor) {
                 data.advanced.superTrend = {
                     value: vals.trend === 1 ? vals.lower : vals.upper,
                     trend: vals.trend === 1 ? 'bull' : 'bear'
                 };
            }
        }
    }

    // 4. Pivots
    // raw.pivots is a flat map ("P", "R1", "S1", ...) for whichever pivot
    // type was requested. TechnicalsData.pivots only declares a 'classic'
    // slot, so only that type is mapped.
    if (raw.pivots) {
        const type = settings.pivots.type as "classic";
        if (type === 'classic') {
             data.pivots = {
                 classic: {
                     p: fromWasmDecimal(raw.pivots.P),
                     r1: fromWasmDecimal(raw.pivots.R1),
                     r2: fromWasmDecimal(raw.pivots.R2),
                     r3: fromWasmDecimal(raw.pivots.R3),
                     s1: fromWasmDecimal(raw.pivots.S1),
                     s2: fromWasmDecimal(raw.pivots.S2),
                     s3: fromWasmDecimal(raw.pivots.S3),
                 },
             };
        }
    }

    data.lastUpdated = Date.now();
    return data;
  }
  
  isAvailable(): boolean {
    return !!this.wasmModule || typeof WebAssembly !== 'undefined';
  }
}

export const wasmCalculator = new WasmCalculator();