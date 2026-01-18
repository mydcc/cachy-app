/*
 * Copyright (C) 2026 MYDCT
 *
 * WebWorker for calculating technical indicators.
 * Offloads heavy computations from the main thread.
 */

import { Decimal } from "decimal.js";
import { normalizeSymbol } from "../utils/symbolUtils"; // Assuming we might need this, or just pure math

// Only import what's needed to avoid bloating the worker
// Using the same JSIndicators logic for consistency

interface Kline {
    time: number;
    open: Decimal;
    high: Decimal;
    low: Decimal;
    close: Decimal;
    volume: Decimal;
}

interface WorkerMessage {
    type: string;
    payload: any;
    id?: string;
}

const ctx: Worker = self as any;

// --- JS Implementation (Duplicated for Worker isolation or imported if possible) ---
// Since importing TS files into workers can be tricky with some Vite setups without shared modules,
// and to ensure total isolation, I will include the JSIndicators logic here.
// In a perfect world, this would be a shared pure-function module.

const JSIndicators = {
    sma(data: number[], period: number): number[] {
        const result = new Array(data.length).fill(0);
        if (data.length < period) return result;
        let sum = 0;
        for (let i = 0; i < period; i++) sum += data[i];
        result[period - 1] = sum / period;
        for (let i = period; i < data.length; i++) {
            sum = sum - data[i - period] + data[i];
            result[i] = sum / period;
        }
        return result;
    },

    ema(data: number[], period: number): number[] {
        const result = new Array(data.length).fill(0);
        if (data.length < period) return result;
        const k = 2 / (period + 1);
        let sum = 0;
        for (let i = 0; i < period; i++) sum += data[i];
        let currentEma = sum / period;
        result[period - 1] = currentEma;
        for (let i = period; i < data.length; i++) {
            currentEma = (data[i] - currentEma) * k + currentEma;
            result[i] = currentEma;
        }
        return result;
    },

    rsi(data: number[], period: number): number[] {
        const result = new Array(data.length).fill(0);
        if (data.length <= period) return result;
        let sumGain = 0;
        let sumLoss = 0;
        for (let i = 1; i <= period; i++) {
            const diff = data[i] - data[i - 1];
            if (diff >= 0) sumGain += diff;
            else sumLoss -= diff;
        }
        let avgGain = sumGain / period;
        let avgLoss = sumLoss / period;
        result[period] = 100 - 100 / (1 + avgGain / (avgLoss || 1));

        for (let i = period + 1; i < data.length; i++) {
            const diff = data[i] - data[i - 1];
            const gain = diff >= 0 ? diff : 0;
            const loss = diff < 0 ? -diff : 0;
            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;
            result[i] = 100 - 100 / (1 + avgGain / (avgLoss || 1));
        }
        return result;
    },

    stoch(
        high: number[],
        low: number[],
        close: number[],
        kPeriod: number,
    ): number[] {
        const result = new Array(close.length).fill(0);
        if (close.length < kPeriod) return result;
        for (let i = kPeriod - 1; i < close.length; i++) {
            const lookbackHigh = Math.max(...high.slice(i - kPeriod + 1, i + 1));
            const lookbackLow = Math.min(...low.slice(i - kPeriod + 1, i + 1));
            const range = lookbackHigh - lookbackLow;
            result[i] = range === 0 ? 50 : ((close[i] - lookbackLow) / range) * 100;
        }
        return result;
    },

    macd(data: number[], fast: number, slow: number, signal: number) {
        const emaFast = this.ema(data, fast);
        const emaSlow = this.ema(data, slow);
        const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
        const macdSignal = this.ema(macdLine.slice(slow - 1), signal);
        const paddedSignal = new Array(slow - 1).fill(0).concat(macdSignal);
        return { macd: macdLine, signal: paddedSignal };
    },

    mom(data: number[], period: number): number[] {
        const result = new Array(data.length).fill(0);
        for (let i = period; i < data.length; i++) {
            result[i] = data[i] - data[i - period];
        }
        return result;
    },

    cci(data: number[], period: number): number[] {
        const result = new Array(data.length).fill(0);
        if (data.length < period) return result;

        for (let i = period - 1; i < data.length; i++) {
            const slice = data.slice(i - period + 1, i + 1);
            let sum = new Decimal(0);
            for (const val of slice) sum = sum.plus(val);
            const sma = sum.dividedBy(period);

            let sumAbsDiff = new Decimal(0);
            for (const val of slice) {
                sumAbsDiff = sumAbsDiff.plus(new Decimal(val).minus(sma).abs());
            }
            const meanDev = sumAbsDiff.dividedBy(period);

            if (meanDev.isZero()) {
                result[i] = 0;
            } else {
                const diff = new Decimal(data[i]).minus(sma);
                const divisor = meanDev.times(0.015);
                result[i] = diff.dividedBy(divisor).toNumber();
            }
        }
        return result;
    },

    adx(
        high: number[],
        low: number[],
        close: number[],
        period: number,
    ): number[] {
        const result = new Array(close.length).fill(0);
        if (close.length < period * 2) return result;

        const upMove = new Array(close.length).fill(0);
        const downMove = new Array(close.length).fill(0);
        const tr = new Array(close.length).fill(0);

        for (let i = 1; i < close.length; i++) {
            const up = high[i] - high[i - 1];
            const down = low[i - 1] - low[i];
            upMove[i] = up > down && up > 0 ? up : 0;
            downMove[i] = down > up && down > 0 ? down : 0;

            tr[i] = Math.max(
                high[i] - low[i],
                Math.abs(high[i] - close[i - 1]),
                Math.abs(low[i] - close[i - 1]),
            );
        }

        const plusDI_S = this.ema(upMove, period);
        const minusDI_S = this.ema(downMove, period);
        const tr_S = this.ema(tr, period);

        const dx = new Array(close.length).fill(0);
        for (let i = 0; i < close.length; i++) {
            const pDI = (plusDI_S[i] / (tr_S[i] || 1)) * 100;
            const mDI = (minusDI_S[i] / (tr_S[i] || 1)) * 100;
            const sum = pDI + mDI;
            dx[i] = sum === 0 ? 0 : (Math.abs(pDI - mDI) / sum) * 100;
        }

        return this.ema(dx, period);
    },
};

// --- Helpers that were in the service ---

async function calculateAwesomeOscillator(
    high: number[],
    low: number[],
    fastPeriod: number,
    slowPeriod: number,
): Promise<number> {
    // Simplified logic for worker (returning number instead of Decimal object for serialization)
    const h = high;
    const l = low;
    const hl2 = h.map((val, i) => (val + l[i]) / 2);

    const getSMA = (data: number[], period: number): number => {
        if (data.length < period) return 0;
        let sum = 0;
        for (let i = data.length - period; i < data.length; i++) {
            sum += data[i];
        }
        return sum / period;
    };

    const fastSMA = getSMA(hl2, fastPeriod);
    const slowSMA = getSMA(hl2, slowPeriod);

    return fastSMA - slowSMA;
}

function calculatePivots(klines: Kline[], type: string) {
    if (klines.length < 2) return null;
    const prev = klines[klines.length - 2];

    // We work with Decimals here because pivot math is sensitive
    const high = new Decimal(prev.high);
    const low = new Decimal(prev.low);
    const close = new Decimal(prev.close);
    const open = new Decimal(prev.open);

    let p = new Decimal(0);
    let r1 = new Decimal(0), r2 = new Decimal(0), r3 = new Decimal(0);
    let s1 = new Decimal(0), s2 = new Decimal(0), s3 = new Decimal(0);

    if (type === "woodie") {
        p = high.plus(low).plus(close.times(2)).div(4);
        r1 = p.times(2).minus(low);
        r2 = p.plus(high).minus(low);
        s1 = p.times(2).minus(high);
        s2 = p.minus(high).plus(low);
        r3 = high.plus(p.minus(low).times(2));
        s3 = low.minus(high.minus(p).times(2));
    } else if (type === "camarilla") {
        const range = high.minus(low);
        r3 = close.plus(range.times(1.1).div(4));
        r2 = close.plus(range.times(1.1).div(6));
        r1 = close.plus(range.times(1.1).div(12));
        p = close;
        s1 = close.minus(range.times(1.1).div(12));
        s2 = close.minus(range.times(1.1).div(6));
        s3 = close.minus(range.times(1.1).div(4));
    } else if (type === "fibonacci") {
        p = high.plus(low).plus(close).div(3);
        const range = high.minus(low);
        r1 = p.plus(range.times(0.382));
        r2 = p.plus(range.times(0.618));
        r3 = p.plus(range.times(1.0));
        s1 = p.minus(range.times(0.382));
        s2 = p.minus(range.times(0.618));
        s3 = p.minus(range.times(1.0));
    } else {
        p = high.plus(low).plus(close).div(3);
        r1 = p.times(2).minus(low);
        s1 = p.times(2).minus(high);
        r2 = p.plus(high.minus(low));
        s2 = p.minus(high.minus(low));
        r3 = high.plus(p.minus(low).times(2));
        s3 = low.minus(high.minus(p).times(2));
    }

    // Convert back to string or number for messaging if needed, or keep as string references
    return {
        pivots: {
            classic: {
                p: p.toString(),
                r1: r1.toString(), r2: r2.toString(), r3: r3.toString(),
                s1: s1.toString(), s2: s2.toString(), s3: s3.toString()
            },
        },
        basis: {
            high: high.toString(),
            low: low.toString(),
            close: close.toString(),
            open: open.toString()
        },
    };
}

function getRsiAction(val: number, overbought: number, oversold: number) {
    if (val >= overbought) return "Sell";
    if (val <= oversold) return "Buy";
    return "Neutral";
}

// --- Main Worker Listener ---

ctx.onmessage = async (e: MessageEvent<WorkerMessage>) => {
    const { type, payload, id } = e.data;

    if (type === "CALCULATE") {
        try {
            const { klines, settings } = payload;
            // Klines come in as raw objects with string/number properties.
            // We must handle conversion carefully.

            const klinesDec: Kline[] = klines.map((k: any) => ({
                time: k.time,
                open: new Decimal(k.open),
                high: new Decimal(k.high),
                low: new Decimal(k.low),
                close: new Decimal(k.close),
                volume: new Decimal(k.volume)
            }));

            // --- Perform Calculations ---
            const highsNum = klinesDec.map((k) => k.high.toNumber());
            const lowsNum = klinesDec.map((k) => k.low.toNumber());
            const closesNum = klinesDec.map((k) => k.close.toNumber());
            const currentPrice = klinesDec[klinesDec.length - 1].close;

            const oscillators = [];
            const movingAverages: any[] = [];

            // RSI
            const rsiLen = settings?.rsi?.length || 14;
            const rsiResults = JSIndicators.rsi(closesNum, rsiLen);
            const rsiVal = rsiResults[rsiResults.length - 1];
            oscillators.push({
                name: "RSI",
                value: rsiVal.toString(),
                params: rsiLen.toString(),
                action: getRsiAction(rsiVal, settings?.rsi?.overbought || 70, settings?.rsi?.oversold || 30)
            });

            // MACD
            const macdFast = settings?.macd?.fastLength || 12;
            const macdSlow = settings?.macd?.slowLength || 26;
            const macdSig = settings?.macd?.signalLength || 9;
            const macdRes = JSIndicators.macd(closesNum, macdFast, macdSlow, macdSig);
            const macdVal = macdRes.macd[macdRes.macd.length - 1];
            const macdSigVal = macdRes.signal[macdRes.signal.length - 1];
            let macdAction = "Neutral";
            if (macdVal > macdSigVal) macdAction = "Buy";
            else if (macdVal < macdSigVal) macdAction = "Sell";
            oscillators.push({
                name: "MACD",
                value: macdVal.toString(),
                signal: macdSigVal.toString(),
                params: `${macdFast}, ${macdSlow}, ${macdSig}`,
                action: macdAction
            });

            // Pivot
            const pivotType = settings?.pivots?.type || "classic";
            const pivotResult = calculatePivots(klinesDec, pivotType);

            // Summary Logic
            let buy = 0, sell = 0, neutral = 0;
            oscillators.forEach(o => {
                if (o.action === "Buy") buy++;
                else if (o.action === "Sell") sell++;
                else neutral++;
            });
            let summaryAction = "Neutral";
            if (buy > sell && buy > neutral) summaryAction = "Buy";
            else if (sell > buy && sell > neutral) summaryAction = "Sell";

            const result = {
                oscillators,
                movingAverages, // Add EMAs etc later if needed
                pivots: pivotResult ? pivotResult.pivots : null,
                pivotBasis: pivotResult ? pivotResult.basis : null,
                summary: { buy, sell, neutral, action: summaryAction }
            };

            ctx.postMessage({ type: "RESULT", payload: result, id });

        } catch (error: any) {
            console.error("Worker Calculation Error: ", error);
            ctx.postMessage({ type: "ERROR", error: error.message, id });
        }
    }
};
