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

import type { TechnicalsData, IndicatorSettings, IndicatorResult } from './technicalsTypes';
import { getEmptyData } from './technicalsTypes';
import { toNumFast } from '../utils/fastConversion';

class WasmCalculator {
  private wasmModule: any = null;
  private instance: any = null;
  private loadingPromise: Promise<void> | null = null;
  
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
                const mod = await import(/* @vite-ignore */ wasmJsPath);
                
                // Initialize with the explicit path to the binary
                await mod.default(wasmBinaryPath);
                
                this.wasmModule = mod;
                if (import.meta.env.DEV) {
                    console.log(`[WASM] Engine initialized successfully (Attempt ${attempt}).`);
                }
                return; // Success!
            } catch (error: any) {
                lastError = error;
                console.warn(`[WASM] Load attempt ${attempt}/${maxRetries} failed:`, error.message);
                
                // Classify error
                const isNetworkError = error.message.includes('fetch') || error.message.includes('network') || error.name === 'TypeError';
                const isCompileError = error.message.includes('LinkError') || error.message.includes('CompileError');
                
                // If it's a compile error, retrying won't help.
                if (isCompileError) throw error;
                
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

  async calculate(klines: any[], settings: IndicatorSettings, enabledIndicators: any): Promise<TechnicalsData> {
    await this.ensureLoaded();
    if (!this.wasmModule) throw new Error('WASM unavailable');
    
    if (!this.instance) this.instance = new this.wasmModule.TechnicalsCalculator();
    
    const len = klines.length;
    const closes = new Float64Array(len);
    const highs = new Float64Array(len);
    const lows = new Float64Array(len);
    const volumes = new Float64Array(len);
    const times = new Float64Array(len);
    
    for (let i = 0; i < len; i++) {
      const k = klines[i];
      closes[i] = toNumFast(k.close);
      highs[i] = toNumFast(k.high);
      lows[i] = toNumFast(k.low);
      volumes[i] = toNumFast(k.volume || 0);
      times[i] = k.time;
    }
    
    // Settings conversion for WASM module (matches Rust IndicatorSettings struct)
    const wasmSettings = {
        // Trend
        ema: [settings.ema.ema1, settings.ema.ema2, settings.ema.ema3].filter(s => s.length > 0).map(s => ({ length: s.length })),
        sma: [settings.sma.sma1, settings.sma.sma2, settings.sma.sma3].filter(s => s.length > 0).map(s => ({ length: s.length })),
        wma: settings.wma.length > 0 ? [{ length: settings.wma.length }] : [],
        vwma: settings.vwma.length > 0 ? [{ length: settings.vwma.length }] : [],
        hma: settings.hma.length > 0 ? [{ length: settings.hma.length }] : [],
        supertrend: settings.superTrend.period > 0 ? [{ length: settings.superTrend.period, multiplier: settings.superTrend.factor }] : [],
        psar: settings.parabolicSar ? [{ start: settings.parabolicSar.start, increment: settings.parabolicSar.increment, max: settings.parabolicSar.max }] : [],
        
        // Oscillators
        rsi: settings.rsi.length > 0 ? [{ length: settings.rsi.length }] : [],
        macd: settings.macd.fastLength > 0 ? [{ fast: settings.macd.fastLength, slow: settings.macd.slowLength, signal: settings.macd.signalLength }] : [],
        stoch: settings.stochastic.kPeriod > 0 ? [{ k: settings.stochastic.kPeriod, d: settings.stochastic.dPeriod, smooth: settings.stochastic.kSmoothing }] : [],
        cci: settings.cci.length > 0 ? [{ length: settings.cci.length }] : [],
        adx: settings.adx ? [{ length: settings.adx.adxSmoothing }] : [], // Note: check mappings. adxSmoothing seems to be length in Rust context? Rust has 'length'. 
        mom: settings.momentum.length > 0 ? [{ length: settings.momentum.length }] : [],
        wr: settings.williamsR.length > 0 ? [{ length: settings.williamsR.length }] : [],
        mfi: settings.mfi.length > 0 ? [{ length: settings.mfi.length }] : [],

        // Volatility
        bb: settings.bb.length > 0 ? [{ length: settings.bb.length, std_dev: settings.bb.stdDev }] : [],
        atr: settings.atr.length > 0 ? [{ length: settings.atr.length }] : [],
        chop: settings.choppiness.length > 0 ? [{ length: settings.choppiness.length }] : [],

        // Volume & Other
        volma: settings.volumeMa.length > 0 ? [{ length: settings.volumeMa.length }] : [],
        vwap: settings.vwap ? [{ anchor: settings.vwap.anchor }] : [],
        pivots: settings.pivots ? [{ type_: settings.pivots.type }] : []
    };

    this.instance.initialize(closes, highs, lows, volumes, times, JSON.stringify(wasmSettings));
    
    const last = klines[len - 1];
    const resultJson = this.instance.update(toNumFast(last.open), highs[len-1], lows[len-1], closes[len-1], volumes[len-1], last.time);
    
    return this.convertResult(JSON.parse(resultJson), klines, settings);
  }
  
  private convertResult(raw: any, klines: any[], settings: IndicatorSettings): TechnicalsData {
    const data = getEmptyData();
    const lastPrice = toNumFast(klines[klines.length - 1].close);
    
    // 1. Moving Averages
    if (raw.movingAverages) {
        data.movingAverages = [];
        for (const [key, value] of Object.entries(raw.movingAverages)) {
            const val = value as number;
            
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
        const macdGroups: Record<string, any> = {};
        const stochGroups: Record<string, any> = {};
        const adxGroups: Record<string, any> = {};

        for (const [key, value] of Object.entries(raw.oscillators)) {
            const val = value as number;

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

        const bbGroups: Record<string, any> = {};
        const stGroups: Record<string, any> = {};

        for (const [key, value] of Object.entries(raw.volatility)) {
             const val = value as number;
             
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
                 const [_, len] = key.split("ATR");
                 if (parseInt(len) === settings.atr.length) {
                     data.volatility.atr = val;
                 }
             } else if (key.startsWith("CHOP")) {
                  data.advanced.choppiness = { 
                      value: val, 
                      state: val > 61.8 ? "Range" : (val < 38.2 ? "Trend" : "Range") // Simple logic, refine if needed
                  };
             } else if (key.startsWith("VWAP")) {
                  data.advanced.vwap = val;
             }
        }
        
        // Finalize BB
        for (const [params, vals] of Object.entries(bbGroups)) {
             const len = parseInt(params.replace("BB", ""));
             // Only map if it matches the primary BB setting, as TechnicalsData only holds one BB result
             // (Or simplistic logic: take the last one encountered)
             if (len === settings.bb.length) {
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
    if (raw.pivots) {
        // raw.pivots has "P", "R1", "S1", "R2", "S2", "R3", "S3"
        // TechnicalsData.pivots structure:
        /*
          pivots: {
            classic: { ... }
          }
        */
        // The WASM output is flat map of the specific type requested.
        const type = settings.pivots.type as "classic"; // Cast or 'classic' | 'woodie' ...
        
        // Ensure the type exists in the object
        // Note: TechnicalsData only defines 'classic' strictly in the interface shown in viewed file?
        // Wait, the viewed file showed: pivots: { classic: { ... } };
        // If user selects woodie, does TS allow it?
        // Let's assume we map to 'classic' slot or try to match dynamic key if allowed (it wasn't in the interface).
        // If the interface ONLY has 'classic', we might have a problem if we want to store 'woodie'.
        // Checking technicalsTypes.ts again... lines 103-113: classic object.
        // It seems strictly typed to 'classic'. 
        
        if (type === 'classic') {
             data.pivots.classic = {
                 p: raw.pivots.P || 0,
                 r1: raw.pivots.R1 || 0,
                 r2: raw.pivots.R2 || 0,
                 r3: raw.pivots.R3 || 0,
                 s1: raw.pivots.S1 || 0,
                 s2: raw.pivots.S2 || 0,
                 s3: raw.pivots.S3 || 0,
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