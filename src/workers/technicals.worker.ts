/*
 * Copyright (C) 2026 MYDCT
 *
 * Technicals Calculation Worker
 * Offloads heavy indicator math to a background thread.
 */

import { Decimal } from "decimal.js";
import { calculateAllIndicators, calculateIndicatorsFromArrays } from "../utils/technicalsCalculator";
import { BufferPool } from "../utils/bufferPool";
import type { WorkerMessage, WorkerCalculatePayload, WorkerCalculatePayloadSoA } from "../services/technicalsTypes";

const ctx: Worker = self as any;
const bufferPool = new BufferPool();

// Keep a local cache of buffers to minimize allocation/transfer overhead
// Double buffering strategy
let buffersA: any = null;
let buffersB: any = null;

ctx.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { type, payload, id } = e.data;

  try {
    if (type === "CALCULATE") {
      // Support two modes:
      // 1. Structure of Arrays (SoA) - Zero Copy (Transferable) - PREFERRED
      // 2. Array of Objects (AoS) - Legacy / Simple

      let result;
      const useSoA = payload.times instanceof Float64Array || payload.times instanceof Array;

      if (useSoA) {
          // Optimized Path
          // payload is WorkerCalculatePayloadSoA
          // We can pass these directly to the calculator if it supports arrays
          // Our refactored calculator supports this!

          const pool = bufferPool; // Use worker's pool

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
          // Legacy Path (Object Array)
          // payload is WorkerCalculatePayload
          // calculateAllIndicators handles conversion
          // BUT klines need to be deserialized or mapped
          // calculateAllIndicators expects Kline objects with Decimal or number.
          // Payload has strings?

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
  } catch (err: any) {
    console.error("Technicals Worker Error:", err);
    ctx.postMessage({
      type: "ERROR",
      id,
      error: err.message || "Unknown worker error"
    });
  }
};
