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
 *
 * Supports two modes:
 * 1. Stateless (CALCULATE): Recalculates everything (legacy/batch).
 * 2. Stateful (INITIALIZE/UPDATE): Maintains state for O(1) incremental updates.
 */

import { Decimal } from "decimal.js";
import { calculateAllIndicators } from "../utils/technicalsCalculator";
import { BufferPool } from "../utils/bufferPool";
import { StatefulTechnicalsCalculator } from "../utils/statefulTechnicalsCalculator";
import type { Kline } from "../utils/indicators";
import type {
  WorkerMessage,
  WorkerCalculatePayload,
  WorkerCalculatePayloadSoA,
} from "../services/technicalsTypes";
import { calculateIndicatorsFromArrays } from "../utils/technicalsCalculator";

const ctx: Worker = self as any;
const pool = new BufferPool();
const calculators = new Map<string, StatefulTechnicalsCalculator>();

// --- Main Worker Listener ---

ctx.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type, payload, id } = e.data;

  try {
    if (type === "CALCULATE" && payload) {
      await handleCalculate(payload, id);
    }
    else if (type === "INITIALIZE" && payload) {
      const { symbol, timeframe, klines, settings, enabledIndicators } = payload;
      const key = `${symbol}:${timeframe}`;

      const calc = new StatefulTechnicalsCalculator();
      const klinesDec = convertToDecimalKlines(klines);

      const result = calc.initialize(klinesDec, settings, enabledIndicators);
      calculators.set(key, calc);

      ctx.postMessage({ type: "RESULT", payload: result, id });
    }
    else if (type === "UPDATE" && payload) {
      const { symbol, timeframe, kline } = payload;
      const key = `${symbol}:${timeframe}`;
      const calc = calculators.get(key);

      if (calc) {
        // Convert single kline
        const tick: Kline = {
            time: kline.time,
            open: new Decimal(kline.open),
            high: new Decimal(kline.high),
            low: new Decimal(kline.low),
            close: new Decimal(kline.close),
            volume: new Decimal(kline.volume),
        };
        const result = calc.update(tick);
        ctx.postMessage({ type: "RESULT", payload: result, id });
      } else {
        throw new Error(`Calculator not initialized for ${key}`);
      }
    }

  } catch (error: any) {
    console.error("Worker Error: ", error);
    ctx.postMessage({
      type: "ERROR",
      error: error.message,
      id,
    });
  }
};

// Helper: Legacy Stateless Calculation
async function handleCalculate(payload: any, id?: string) {
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

      // Optimization: Pass TypedArrays directly
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

      const klinesDec = convertToDecimalKlines(klines);
      result = calculateAllIndicators(klinesDec, settings, enabledIndicators);
    }

    const response: WorkerMessage = {
      type: "RESULT",
      payload: result,
      id,
      buffers: buffersToReturn,
    };

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

    ctx.postMessage(response, transferList);
}

function convertToDecimalKlines(klines: any[]): Kline[] {
    return klines.map((k) => ({
      time: k.time,
      open: new Decimal(k.open),
      high: new Decimal(k.high),
      low: new Decimal(k.low),
      close: new Decimal(k.close),
      volume: new Decimal(k.volume),
    }));
}
