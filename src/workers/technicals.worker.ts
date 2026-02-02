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
 * WebWorker for calculating technical indicators.
 * Offloads heavy computations from the main thread.
 */

import { Decimal } from "decimal.js";
import { calculateAllIndicators } from "../utils/technicalsCalculator";
import { BufferPool } from "../utils/bufferPool";
import type { Kline } from "../utils/indicators";
import type {
  WorkerMessage,
  WorkerCalculatePayload,
  WorkerCalculatePayloadSoA,
} from "../services/technicalsTypes";
import { calculateIndicatorsFromArrays } from "../utils/technicalsCalculator";

const ctx: Worker = self as any;
const pool = new BufferPool();

// --- Main Worker Listener ---

ctx.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type, payload, id } = e.data;

  if (type === "CALCULATE" && payload) {
    try {
      let result;
      let buffersToReturn;

      // Check for SoA Payload (Zero-Copy Path)
      if ('times' in payload && payload.times instanceof Float64Array) {
        const soa = payload as WorkerCalculatePayloadSoA;

        // Capture buffers to return them for recycling
        buffersToReturn = {
           times: soa.times,
           opens: soa.opens,
           highs: soa.highs,
           lows: soa.lows,
           closes: soa.closes,
           volumes: soa.volumes
        };

        // Optimization: Pass TypedArrays directly (cast to any to satisfy TS signature if needed)
        result = calculateIndicatorsFromArrays(
          soa.times as any,
          soa.opens as any,
          soa.highs as any,
          soa.lows as any,
          soa.closes as any,
          soa.volumes as any,
          soa.settings,
          soa.enabledIndicators,
          pool
        );
      } else {
        // Legacy Path (Object Array)
        const calculatePayload = payload as WorkerCalculatePayload;
        const { klines, settings, enabledIndicators } = calculatePayload;

        // Rehydrate Klines to Decimal for calculation (if passing object array)
        // But the new calculator expects Decimals in input Klines?
        // calculateAllIndicators signature takes Kline[] which has Decimals.
        // We need to convert string-based klines to Decimal klines.

        const klinesDec: Kline[] = klines.map((k) => ({
          time: k.time,
          open: new Decimal(k.open),
          high: new Decimal(k.high),
          low: new Decimal(k.low),
          close: new Decimal(k.close),
          volume: new Decimal(k.volume),
        }));
        result = calculateAllIndicators(klinesDec, settings, enabledIndicators);
      }

      // Optimization: Return TechnicalsData directly (Structured Clone handles numbers/objects/arrays)
      // No serialization needed!

      const response: WorkerMessage = {
        type: "RESULT",
        payload: result,
        id,
        buffers: buffersToReturn,
      };

      // Prepare transfer list to give ownership back to main thread
      const transferList: Transferable[] = [];
      if (buffersToReturn) {
          transferList.push(
              buffersToReturn.times.buffer,
              buffersToReturn.opens.buffer,
              buffersToReturn.highs.buffer,
              buffersToReturn.lows.buffer,
              buffersToReturn.closes.buffer,
              buffersToReturn.volumes.buffer
          );
      }

      // If we received transferables, we technically own them. 
      // We send them back to enable buffer recycling (Ping-Pong).
      ctx.postMessage(response, transferList);
    } catch (error: any) {
      console.error("Worker Calculation Error: ", error);
      const errorResponse: WorkerMessage = {
        type: "ERROR",
        error: error.message,
        id,
      };
      ctx.postMessage(errorResponse);
    }
  }
};
