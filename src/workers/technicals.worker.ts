/*
 * Copyright (C) 2026 MYDCT
 *
 * Technicals Calculation Worker
 * Offloads heavy indicator math to a background thread.
 */

import { Decimal } from "decimal.js";
import { calculateAllIndicators, calculateIndicatorsFromArrays } from "../utils/technicalsCalculator";
import { BufferPool } from "../utils/bufferPool";
import type { WorkerMessage, WorkerCalculatePayload, WorkerCalculatePayloadSoA, KlineBuffers } from "../services/technicalsTypes";

const ctx: Worker = self as any;
const bufferPool = new BufferPool();

// Stateful Cache for "INITIALIZE" / "UPDATE"
// Keyed by request ID (symbol:timeframe)
interface WorkerHistory {
    times: Float64Array;
    opens: Float64Array;
    highs: Float64Array;
    lows: Float64Array;
    closes: Float64Array;
    volumes: Float64Array;
    length: number; // Actual used length
    capacity: number;
}

const historyCache = new Map<string, WorkerHistory>();

ctx.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { type, payload, id } = e.data;

  try {
    if (type === "CALCULATE") {
      // Stateless calculation
      let result;
      const useSoA = payload.times instanceof Float64Array || payload.times instanceof Array;

      if (useSoA) {
          result = calculateIndicatorsFromArrays(
             payload.highs,
             payload.lows,
             payload.closes,
             payload.opens,
             payload.volumes,
             payload.times,
             payload.settings,
             payload.enabledIndicators
          );
      } else {
          // Legacy Path
          const klines = payload.klines.map((k: any) => ({
              time: k.time,
              open: new Decimal(k.open),
              high: new Decimal(k.high),
              low: new Decimal(k.low),
              close: new Decimal(k.close),
              volume: new Decimal(k.volume),
          }));

          result = calculateAllIndicators(klines, payload.settings, payload.enabledIndicators);
      }

      ctx.postMessage({
        type: "RESULT",
        id,
        payload: result
      });
    }
    else if (type === "INITIALIZE") {
        if (!id) throw new Error("INITIALIZE requires an ID");
        // Payload contains full history (usually AoS)
        const klines = payload.klines;
        const len = klines.length;

        // Allocate buffers with some headroom
        const capacity = Math.max(len + 100, 1000);
        const hist: WorkerHistory = {
            times: new Float64Array(capacity),
            opens: new Float64Array(capacity),
            highs: new Float64Array(capacity),
            lows: new Float64Array(capacity),
            closes: new Float64Array(capacity),
            volumes: new Float64Array(capacity),
            length: len,
            capacity: capacity
        };

        for(let i=0; i<len; i++) {
            const k = klines[i];
            hist.times[i] = k.time;
            hist.opens[i] = parseFloat(k.open);
            hist.highs[i] = parseFloat(k.high);
            hist.lows[i] = parseFloat(k.low);
            hist.closes[i] = parseFloat(k.close);
            hist.volumes[i] = parseFloat(k.volume);
        }

        historyCache.set(id, hist);

        // Perform initial calculation
        const result = calculateIndicatorsFromArrays(
            hist.highs.subarray(0, len),
            hist.lows.subarray(0, len),
            hist.closes.subarray(0, len),
            hist.opens.subarray(0, len),
            hist.volumes.subarray(0, len),
            hist.times.subarray(0, len),
            payload.settings,
            payload.enabledIndicators
        );

        ctx.postMessage({ type: "RESULT", id, payload: result });
    }
    else if (type === "UPDATE") {
        if (!id) throw new Error("UPDATE requires an ID");
        const hist = historyCache.get(id);
        if (!hist) throw new Error(`Worker state not found for ${id}`);

        const k = payload.kline; // Single serialized kline

        // Check if we need to resize
        if (hist.length >= hist.capacity) {
            // Simple resize strategy: new array, copy
            // For now, let's just shift if full? Or throw?
            // Proper resize:
            const newCap = hist.capacity * 2;
            const resize = (arr: Float64Array) => {
                const n = new Float64Array(newCap);
                n.set(arr);
                return n;
            }
            hist.times = resize(hist.times);
            hist.opens = resize(hist.opens);
            hist.highs = resize(hist.highs);
            hist.lows = resize(hist.lows);
            hist.closes = resize(hist.closes);
            hist.volumes = resize(hist.volumes);
            hist.capacity = newCap;
        }

        // Logic: Is this an update to the last candle or a new candle?
        // Service logic usually sends "UPDATE" for realtime tick.
        // Assuming append or replace based on time.
        const time = k.time;
        const lastTime = hist.times[hist.length - 1];

        if (time === lastTime) {
            // Replace last
            const i = hist.length - 1;
            hist.opens[i] = parseFloat(k.open);
            hist.highs[i] = parseFloat(k.high);
            hist.lows[i] = parseFloat(k.low);
            hist.closes[i] = parseFloat(k.close);
            hist.volumes[i] = parseFloat(k.volume);
        } else if (time > lastTime) {
            // Append
            const i = hist.length;
            hist.times[i] = time;
            hist.opens[i] = parseFloat(k.open);
            hist.highs[i] = parseFloat(k.high);
            hist.lows[i] = parseFloat(k.low);
            hist.closes[i] = parseFloat(k.close);
            hist.volumes[i] = parseFloat(k.volume);
            hist.length++;
        }

        // Recalculate
        const result = calculateIndicatorsFromArrays(
            hist.highs.subarray(0, hist.length),
            hist.lows.subarray(0, hist.length),
            hist.closes.subarray(0, hist.length),
            hist.opens.subarray(0, hist.length),
            hist.volumes.subarray(0, hist.length),
            hist.times.subarray(0, hist.length),
            payload.settings,
            payload.enabledIndicators
        );

        ctx.postMessage({ type: "RESULT", id, payload: result });
    }
    else if (type === "CLEANUP") {
        if (id) {
            historyCache.delete(id);
        }
        // Always acknowledge cleanup
        ctx.postMessage({ type: "RESULT", id, payload: { cleaned: true } });
    }

  } catch (err: any) {
    console.error("Technicals Worker Error:", err);
    ctx.postMessage({
      type: "ERROR",
      id,
      error: err.message || "Unknown worker error"
    });
  }
};
