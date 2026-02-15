/*
 * Copyright (C) 2026 MYDCT
 *
 * WebWorker for Technical Indicators - CONSOLIDATED ACE VERSION
 * Bundled into a single file by Vite for maximum COEP compatibility.
 */

import { Decimal } from "decimal.js";
import { calculateAllIndicators, calculateIndicatorsFromArrays } from "../utils/technicalsCalculator";
import { BufferPool } from "../utils/bufferPool";
import { StatefulTechnicalsCalculator } from "../utils/statefulTechnicalsCalculator";
import { WasmTechnicalsCalculator } from "../utils/WasmTechnicalsCalculator";
import { loadWasm, WASM_SUPPORTED_INDICATORS } from "../utils/wasmTechnicals";

const ctx: Worker = self as any;
const pool = new BufferPool();
const calculators = new Map<string, any>();
let wasmModule: any = null;

// Hardened WASM load
loadWasm().then(mod => {
    if (mod) {
        console.debug("[Worker] WASM Engine ready.");
        wasmModule = mod;
    }
}).catch(() => {
    console.warn("[Worker] WASM not available, using JS fallback.");
});

ctx.onmessage = async (e: MessageEvent<any>) => {
    const { type, payload, id } = e.data;

    try {
        if (type === "CALCULATE") {
            const result = payload.times 
                ? calculateIndicatorsFromArrays(
                    payload.times, payload.opens, payload.highs, payload.lows, payload.closes, payload.volumes,
                    payload.settings, payload.enabledIndicators, pool
                  )
                : calculateAllIndicators(
                    convertToDecimalKlines(payload.klines), 
                    payload.settings, payload.enabledIndicators
                  );
            
            ctx.postMessage({ type: "RESULT", payload: result, id });
        } 
        else if (type === "INITIALIZE") {
            const { symbol, timeframe, klines, settings, enabledIndicators } = payload;
            const key = `${symbol}:${timeframe}`;
            
            const calc = new StatefulTechnicalsCalculator();
            const result = calc.initialize(convertToDecimalKlines(klines), settings, enabledIndicators);
            
            calculators.set(key, calc);
            ctx.postMessage({ type: "RESULT", payload: result, id });
        }
        else if (type === "UPDATE") {
            const { symbol, timeframe, kline } = payload;
            const key = `${symbol}:${timeframe}`;
            const calc = calculators.get(key);
            if (calc) {
                const tick = {
                    time: kline.time,
                    open: new Decimal(kline.open),
                    high: new Decimal(kline.high),
                    low: new Decimal(kline.low),
                    close: new Decimal(kline.close),
                    volume: new Decimal(kline.volume),
                };
                ctx.postMessage({ type: "RESULT", payload: calc.update(tick), id });
            }
        }
    } catch (err: any) {
        ctx.postMessage({ type: "ERROR", error: err.message, id });
    }
};

function convertToDecimalKlines(klines: any[]): any[] {
    return klines.map((k) => ({
      time: k.time,
      open: new Decimal(k.open),
      high: new Decimal(k.high),
      low: new Decimal(k.low),
      close: new Decimal(k.close),
      volume: new Decimal(k.volume),
    }));
}
