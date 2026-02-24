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

import init, { TechnicalsEngine } from "cachy-technicals-wasm";
import { indicatorState } from "../stores/indicator.svelte";
import type { IndicatorSettings } from "../types/indicators";
import type { Kline, TechnicalsData, PivotLevels } from "./technicalsTypes";
import { getEmptyData } from "./technicalsTypes";

export class WasmCalculator {
  private wasmModule: TechnicalsEngine | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  async init() {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        await init();
        this.wasmModule = new TechnicalsEngine();
        this.isInitialized = true;
      } catch (e) {
        console.error("Failed to initialize WASM calculator:", e);
        this.initPromise = null;
        throw e;
      }
    })();

    return this.initPromise;
  }

  calculate(
    klines: Kline[],
    settings: IndicatorSettings = indicatorState.toJSON(),
    enabledIndicators?: Partial<Record<string, boolean>>
  ): TechnicalsData {
    if (!this.wasmModule) {
      if (import.meta.env.DEV) {
        console.warn("WASM calculator not initialized, returning empty data");
      }
      return getEmptyData();
    }

    try {
      // Convert klines to flat Float64Arrays for WASM (SoA layout)
      const len = klines.length;
      const times = new Float64Array(len);
      const opens = new Float64Array(len);
      const highs = new Float64Array(len);
      const lows = new Float64Array(len);
      const closes = new Float64Array(len);
      const volumes = new Float64Array(len);

      for (let i = 0; i < len; i++) {
        const k = klines[i];
        times[i] = k.time;
        opens[i] = k.open.toNumber();
        highs[i] = k.high.toNumber();
        lows[i] = k.low.toNumber();
        closes[i] = k.close.toNumber();
        volumes[i] = k.volume.toNumber();
      }

      // Convert settings to plain object
      // The WASM engine expects camelCase
      const engineSettings = {
        rsiLength: settings.rsi.length,
        stochK: settings.stochastic.kPeriod,
        stochD: settings.stochastic.dPeriod,
        stochSmooth: settings.stochastic.kSmoothing,
        macdFast: settings.macd.fastLength,
        macdSlow: settings.macd.slowLength,
        macdSignal: settings.macd.signalLength,
        bbLength: settings.bollingerBands.length,
        bbStdDev: settings.bollingerBands.stdDev,
        atrLength: settings.atr.length,

        // Pivot settings
        pivotType: settings.pivots.type,

        // Include new indicators if WASM supports them
        emaPeriods: [
            settings.ema.ema1.length,
            settings.ema.ema2.length,
            settings.ema.ema3.length
        ],
        smaPeriods: [
            settings.sma.sma1.length,
            settings.sma.sma2.length,
            settings.sma.sma3.length
        ],
        wmaLength: settings.wma.length,
        vwmaLength: settings.vwma.length,
        hmaLength: settings.hma.length,

        volumeMaLength: settings.volumeMa.length,
        volumeMaType: settings.volumeMa.maType,

        superTrendPeriod: settings.superTrend.period,
        superTrendFactor: settings.superTrend.factor,

        // Filter map
        enabled: enabledIndicators || {}
      };

      // Call WASM
      // The engine.calculate returns a raw JSON string or object
      // We assume it returns an object matching our needs
      const resultJson = this.wasmModule.calculate_all(
        times, opens, highs, lows, closes, volumes,
        JSON.stringify(engineSettings)
      );

      const rawResult = JSON.parse(resultJson);

      return this.convertResult(rawResult, settings, closes[len - 1]);

    } catch (e) {
      console.error("WASM Calculation Error:", e);
      return getEmptyData();
    }
  }

  private convertResult(raw: any, settings: IndicatorSettings, lastPrice: number): TechnicalsData {
    const data = getEmptyData();

    // 1. Moving Averages
    if (raw.movingAverages) {
        data.movingAverages = [];
        for (const [key, value] of Object.entries(raw.movingAverages)) {
            const val = value as number;
            // WASM returns keys like "EMA9", "SMA20", "WMA14"
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
    if (raw.pivots) {
        // TechnicalsData.pivots structure:
        /*
          pivots: {
            classic: { ... },
            woodie?: { ... },
            camarilla?: { ... },
            fibonacci?: { ... }
          }
        */
        const type = settings.pivots.type; // 'classic' | 'woodie' | 'camarilla' | 'fibonacci'
        
        // Map raw pivots to the correct type structure
        const pivotData: PivotLevels = {
             p: raw.pivots.P || 0,
             r1: raw.pivots.R1 || 0,
             r2: raw.pivots.R2 || 0,
             r3: raw.pivots.R3 || 0,
             s1: raw.pivots.S1 || 0,
             s2: raw.pivots.S2 || 0,
             s3: raw.pivots.S3 || 0,
             // Optional R4/S4 for Camarilla
             r4: raw.pivots.R4,
             s4: raw.pivots.S4,
        };

        // Populate the correct key based on type
        if (type === 'woodie') {
            data.pivots.woodie = pivotData;
        } else if (type === 'camarilla') {
            data.pivots.camarilla = pivotData;
        } else if (type === 'fibonacci') {
            data.pivots.fibonacci = pivotData;
        } else {
            // Default to classic
            data.pivots.classic = pivotData;
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
