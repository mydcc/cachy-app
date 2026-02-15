/*
 * Copyright (C) 2026 MYDCT
 *
 * Technicals Calculation Worker
 * Offloads heavy calculations to a separate thread.
 */

import { calculateAllIndicators } from "../utils/technicalsCalculator";
import type {
    WorkerMessage,
    WorkerCalculatePayloadSoA,
    KlineBuffers
} from "./technicalsTypes";
import type { Kline } from "../utils/indicators";
import { Decimal } from "decimal.js";

// Reusable Kline array to avoid excessive allocations between calls for stateless CALCULATE
let klineBuffer: Kline[] = [];

// State for stateful operations (INITIALIZE/UPDATE)
interface WorkerState {
    klines: Kline[];
    settings: any;
    enabledIndicators: any;
    lastAccessed: number;
}
const stateMap = new Map<string, WorkerState>();
const MAX_STATE_ENTRIES = 50;

function getKey(symbol: string, timeframe: string) {
    return `${symbol}:${timeframe}`;
}

// Simple LRU cleanup
function enforceLimit() {
    if (stateMap.size <= MAX_STATE_ENTRIES) return;

    let oldestKey = '';
    let oldestTime = Infinity;

    for (const [key, state] of stateMap.entries()) {
        if (state.lastAccessed < oldestTime) {
            oldestTime = state.lastAccessed;
            oldestKey = key;
        }
    }

    if (oldestKey) {
        stateMap.delete(oldestKey);
    }
}

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const { type, payload, id } = e.data;

    try {
        if (type === "CALCULATE" && payload) {
            const data = payload as WorkerCalculatePayloadSoA;
            const len = data.closes.length;

            if (klineBuffer.length !== len) {
                klineBuffer = new Array(len);
                for (let i = 0; i < len; i++) {
                    klineBuffer[i] = {
                        time: 0,
                        open: new Decimal(0),
                        high: new Decimal(0),
                        low: new Decimal(0),
                        close: new Decimal(0),
                        volume: new Decimal(0)
                    };
                }
            }

            for (let i = 0; i < len; i++) {
                const k = klineBuffer[i];
                k.time = data.times[i];
                k.open = new Decimal(data.opens[i]);
                k.high = new Decimal(data.highs[i]);
                k.low = new Decimal(data.lows[i]);
                k.close = new Decimal(data.closes[i]);
                k.volume = new Decimal(data.volumes[i]);
            }

            const result = calculateAllIndicators(klineBuffer.slice(0, len), data.settings, data.enabledIndicators);

            const buffers: KlineBuffers = {
                times: data.times,
                opens: data.opens,
                highs: data.highs,
                lows: data.lows,
                closes: data.closes,
                volumes: data.volumes
            };

            const response: WorkerMessage = {
                type: "RESULT",
                id,
                payload: result,
                buffers
            };

            // @ts-ignore
            self.postMessage(response, [
                buffers.times.buffer,
                buffers.opens.buffer,
                buffers.highs.buffer,
                buffers.lows.buffer,
                buffers.closes.buffer,
                buffers.volumes.buffer
            ]);

        } else if (type === "INITIALIZE") {
             const { symbol, timeframe, klines, settings, enabledIndicators } = payload;
             const key = getKey(symbol, timeframe);

             // Enforce LRU limit before adding new state
             enforceLimit();

             const parsedKlines: Kline[] = klines.map((k: any) => ({
                 time: k.time,
                 open: new Decimal(k.open),
                 high: new Decimal(k.high),
                 low: new Decimal(k.low),
                 close: new Decimal(k.close),
                 volume: new Decimal(k.volume)
             }));

             stateMap.set(key, {
                 klines: parsedKlines,
                 settings,
                 enabledIndicators,
                 lastAccessed: Date.now()
             });

             const result = calculateAllIndicators(parsedKlines, settings, enabledIndicators);

             self.postMessage({ type: "RESULT", id, payload: result });

        } else if (type === "UPDATE") {
             const { symbol, timeframe, kline } = payload;
             const key = getKey(symbol, timeframe);
             const state = stateMap.get(key);

             if (!state) {
                 throw new Error("Worker state missing for " + key);
             }

             // Update access time
             state.lastAccessed = Date.now();

             const newKline: Kline = {
                 time: kline.time,
                 open: new Decimal(kline.open),
                 high: new Decimal(kline.high),
                 low: new Decimal(kline.low),
                 close: new Decimal(kline.close),
                 volume: new Decimal(kline.volume)
             };

             const history = state.klines;
             const last = history[history.length - 1];
             if (last && last.time === newKline.time) {
                 history[history.length - 1] = newKline;
             } else {
                 history.push(newKline);
                 if (history.length > 1500) history.shift(); // Keep buffer limited
             }

             const result = calculateAllIndicators(history, state.settings, state.enabledIndicators);

             self.postMessage({ type: "RESULT", id, payload: result });

        } else if (type === "CLEANUP") {
             // Explicit cleanup
             const { symbol, timeframe } = payload;
             if (symbol && timeframe) {
                 const key = getKey(symbol, timeframe);
                 stateMap.delete(key);
             } else if (symbol) {
                 // Clear all timeframes for symbol
                 for (const key of stateMap.keys()) {
                     if (key.startsWith(symbol + ":")) {
                         stateMap.delete(key);
                     }
                 }
             } else {
                 // Clear all
                 stateMap.clear();
             }
             self.postMessage({ type: "RESULT", id, payload: { success: true } });
        }
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        self.postMessage({
            type: "ERROR",
            id,
            error: errorMsg
        });
    }
};
