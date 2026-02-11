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
    
    // Simplistic settings conversion for the WASM module
    const wasmSettings = {
        ema: [settings.ema.ema1.length, settings.ema.ema2.length, settings.ema.ema3.length].filter(l => l > 0),
        rsi: [settings.rsi.length],
        macd: [{ fast: settings.macd.fastLength, slow: settings.macd.slowLength, signal: settings.macd.signalLength }]
    };

    this.instance.initialize(closes, highs, lows, volumes, times, JSON.stringify(wasmSettings));
    
    const last = klines[len - 1];
    const resultJson = this.instance.update(toNumFast(last.open), highs[len-1], lows[len-1], closes[len-1], volumes[len-1], last.time);
    
    return this.convertResult(JSON.parse(resultJson), klines, settings);
  }
  
  private convertResult(raw: any, klines: any[], settings: IndicatorSettings): TechnicalsData {
    const data = getEmptyData();
    const lastPrice = toNumFast(klines[klines.length - 1].close);
    
    // Basic mapping for visibility
    if (raw.movingAverages) {
        data.movingAverages = Object.entries(raw.movingAverages).map(([k, v]) => ({
            name: "EMA",
            params: k.replace(/[^0-9]/g, ''),
            value: v as number,
            action: lastPrice > (v as number) ? 'Buy' : 'Sell'
        }));
    }

    if (raw.oscillators) {
        data.oscillators = Object.entries(raw.oscillators).map(([k, v]) => ({
            name: "RSI",
            params: settings.rsi.length.toString(),
            value: v as number,
            action: (v as number) > 70 ? "Sell" : ((v as number) < 30 ? "Buy" : "Neutral")
        }));
    }

    data.lastUpdated = Date.now();
    return data;
  }
  
  isAvailable(): boolean {
    return !!this.wasmModule || typeof WebAssembly !== 'undefined';
  }
}

export const wasmCalculator = new WasmCalculator();