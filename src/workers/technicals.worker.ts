/*
 * Copyright (C) 2026 MYDCT
 *
 * WebWorker for calculating technical indicators.
 * Offloads heavy computations from the main thread.
 */

import { Decimal } from "decimal.js";
import { calculateAllIndicators } from "../utils/technicalsCalculator";
import type { Kline } from "../utils/indicators";
import type {
  TechnicalsData,
  WorkerMessage,
  SerializedTechnicalsData,
  WorkerCalculatePayload,
} from "../services/technicalsTypes";

const ctx: Worker = self as any;

// Helper to serialize Decimal based results back to JSON-friendly format
function serializeResult(data: TechnicalsData): SerializedTechnicalsData {
  return {
    oscillators: data.oscillators.map((o) => ({
      name: o.name,
      params: o.params,
      value: o.value.toString(),
      signal: o.signal?.toString(),
      histogram: o.histogram?.toString(),
      action: o.action,
    })),
    movingAverages: data.movingAverages.map((m) => ({
      name: m.name,
      params: m.params,
      value: m.value.toString(),
      action: m.action,
      signal: m.signal?.toString(),
      histogram: m.histogram?.toString(),
    })),
    pivots: {
      classic: {
        p: data.pivots.classic.p.toString(),
        r1: data.pivots.classic.r1.toString(),
        r2: data.pivots.classic.r2.toString(),
        r3: data.pivots.classic.r3.toString(),
        s1: data.pivots.classic.s1.toString(),
        s2: data.pivots.classic.s2.toString(),
        s3: data.pivots.classic.s3.toString(),
      },
    },
    pivotBasis: data.pivotBasis
      ? {
        high: data.pivotBasis.high.toString(),
        low: data.pivotBasis.low.toString(),
        close: data.pivotBasis.close.toString(),
        open: data.pivotBasis.open.toString(),
      }
      : undefined,
    summary: data.summary,
    volatility: data.volatility
      ? {
        atr: data.volatility.atr.toString(),
        bb: {
          upper: data.volatility.bb.upper.toString(),
          middle: data.volatility.bb.middle.toString(),
          lower: data.volatility.bb.lower.toString(),
          percentP: data.volatility.bb.percentP.toString(),
        },
      }
      : undefined,
    divergences: data.divergences?.map((d) => ({
      ...d,
      priceStart: d.priceStart.toString(),
      priceEnd: d.priceEnd.toString(),
      indStart: d.indStart.toString(),
      indEnd: d.indEnd.toString(),
    })),
    confluence: data.confluence,
    advanced: data.advanced
      ? {
        vwap: data.advanced.vwap?.toString(),
        mfi: data.advanced.mfi
          ? {
            value: data.advanced.mfi.value.toString(),
            action: data.advanced.mfi.action,
          }
          : undefined,
        stochRsi: data.advanced.stochRsi
          ? {
            k: data.advanced.stochRsi.k.toString(),
            d: data.advanced.stochRsi.d.toString(),
            action: data.advanced.stochRsi.action,
          }
          : undefined,
        williamsR: data.advanced.williamsR
          ? {
            value: data.advanced.williamsR.value.toString(),
            action: data.advanced.williamsR.action,
          }
          : undefined,
        choppiness: data.advanced.choppiness
          ? {
            value: data.advanced.choppiness.value.toString(),
            state: data.advanced.choppiness.state,
          }
          : undefined,
        ichimoku: data.advanced.ichimoku
          ? {
            conversion: data.advanced.ichimoku.conversion.toString(),
            base: data.advanced.ichimoku.base.toString(),
            spanA: data.advanced.ichimoku.spanA.toString(),
            spanB: data.advanced.ichimoku.spanB.toString(),
            action: data.advanced.ichimoku.action,
          }
          : undefined,
        parabolicSar: data.advanced.parabolicSar?.toString(),
        // Phase 5: Pro Serialization
        superTrend: data.advanced.superTrend
          ? {
            value: data.advanced.superTrend.value.toString(),
            trend: data.advanced.superTrend.trend,
          }
          : undefined,
        atrTrailingStop: data.advanced.atrTrailingStop
          ? {
            buy: data.advanced.atrTrailingStop.buy.toString(),
            sell: data.advanced.atrTrailingStop.sell.toString(),
          }
          : undefined,
        obv: data.advanced.obv?.toString(),
        volumeProfile: data.advanced.volumeProfile
          ? {
            poc: data.advanced.volumeProfile.poc.toString(),
            vaHigh: data.advanced.volumeProfile.vaHigh.toString(),
            vaLow: data.advanced.volumeProfile.vaLow.toString(),
            rows: data.advanced.volumeProfile.rows.map((r) => ({
              priceStart: r.priceStart.toString(),
              priceEnd: r.priceEnd.toString(),
              volume: r.volume.toString(),
            })),
          }
          : undefined,
      }
      : undefined,
  };
}

// --- Main Worker Listener ---

ctx.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type, payload, id } = e.data;

  if (type === "CALCULATE" && payload) {
    try {
      const calculatePayload = payload as WorkerCalculatePayload;
      const { klines, settings } = calculatePayload;

      // Rehydrate Klines to Decimal for calculation
      const klinesDec: Kline[] = klines.map((k) => ({
        time: k.time,
        open: new Decimal(k.open),
        high: new Decimal(k.high),
        low: new Decimal(k.low),
        close: new Decimal(k.close),
        volume: new Decimal(k.volume),
      }));

      const result = calculateAllIndicators(klinesDec, settings);

      const response: WorkerMessage = {
        type: "RESULT",
        payload: result,
        id,
      };
      ctx.postMessage(response);
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
