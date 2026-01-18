/*
 * Copyright (C) 2026 MYDCT
 *
 * WebWorker for calculating technical indicators.
 * Offloads heavy computations from the main thread.
 */

import { Decimal } from "decimal.js";
import { calculateAllIndicators } from "../utils/technicalsCalculator";
import type { Kline } from "../utils/indicators";
import type { TechnicalsData, WorkerMessage, SerializedTechnicalsData, WorkerCalculatePayload } from "../services/technicalsTypes";

const ctx: Worker = self as any;

// Helper to serialize Decimal based results back to JSON-friendly format
function serializeResult(data: TechnicalsData): SerializedTechnicalsData {
    return {
        oscillators: data.oscillators.map(o => ({
            name: o.name,
            params: o.params,
            value: o.value.toString(),
            signal: o.signal?.toString(),
            histogram: o.histogram?.toString(),
            action: o.action
        })),
        movingAverages: data.movingAverages.map(m => ({
            name: m.name,
            params: m.params,
            value: m.value.toString(),
            action: m.action,
            signal: m.signal?.toString(),
            histogram: m.histogram?.toString()
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
            }
        },
        pivotBasis: data.pivotBasis ? {
            high: data.pivotBasis.high.toString(),
            low: data.pivotBasis.low.toString(),
            close: data.pivotBasis.close.toString(),
            open: data.pivotBasis.open.toString(),
        } : undefined,
        summary: data.summary
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
                volume: new Decimal(k.volume)
            }));

            const result = calculateAllIndicators(klinesDec, settings);

            // Serialize back to string for transport
            const serialized = serializeResult(result);

            const response: WorkerMessage = { type: "RESULT", payload: serialized, id };
            ctx.postMessage(response);

        } catch (error: any) {
            console.error("Worker Calculation Error: ", error);
            const errorResponse: WorkerMessage = { type: "ERROR", error: error.message, id };
            ctx.postMessage(errorResponse);
        }
    }
};
