/*
 * Copyright (C) 2026 MYDCT
 *
 * WebWorker for calculating technical indicators.
 * Offloads heavy computations from the main thread.
 */

import { Decimal } from "decimal.js";
import { calculateAllIndicators } from "../utils/technicalsCalculator";
import type { Kline } from "../utils/indicators";
import type { TechnicalsData } from "../services/technicalsTypes";

interface WorkerMessage {
    type: string;
    payload: any;
    id?: string;
}

const ctx: Worker = self as any;

// Helper to serialize Decimal based results back to JSON-friendly format
function serializeResult(data: TechnicalsData): any {
    return {
        oscillators: data.oscillators.map(o => ({
            ...o,
            value: o.value.toString(),
            signal: o.signal?.toString(),
            histogram: o.histogram?.toString()
        })),
        movingAverages: data.movingAverages.map(m => ({
            ...m,
            value: m.value.toString()
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

    if (type === "CALCULATE") {
        try {
            const { klines, settings } = payload;

            // Rehydrate Klines to Decimal for calculation
            const klinesDec: Kline[] = klines.map((k: any) => ({
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

            ctx.postMessage({ type: "RESULT", payload: serialized, id });

        } catch (error: any) {
            console.error("Worker Calculation Error: ", error);
            ctx.postMessage({ type: "ERROR", error: error.message, id });
        }
    }
};
