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
        console.log("[Worker] WASM Engine ready.");
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
        else if (type === "SHIFT") {
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
                calc.commitCandle(tick);
                ctx.postMessage({ type: "RESULT", payload: { success: true }, id });
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
