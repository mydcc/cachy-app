/*
 * Copyright (C) 2026 MYDCT
 *
 * WebWorker for calculating technical indicators.
 * Offloads heavy computations from the main thread.
 */

import { Decimal } from "decimal.js";
import { JSIndicators, calculateAwesomeOscillator, calculatePivots, getRsiAction } from "../utils/indicators";
import type { Kline } from "../utils/indicators";

interface WorkerMessage {
    type: string;
    payload: any;
    id?: string;
}

const ctx: Worker = self as any;

// Logic extracted for testing
export function calculateAllIndicators(payload: any) {
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

    // 1. RSI
    const rsiLen = settings?.rsi?.length || 14;
    const rsiResults = JSIndicators.rsi(closesNum, rsiLen);
    const rsiVal = rsiResults[rsiResults.length - 1];
    oscillators.push({
        name: "RSI",
        value: rsiVal.toString(),
        params: rsiLen.toString(),
        action: getRsiAction(rsiVal, settings?.rsi?.overbought || 70, settings?.rsi?.oversold || 30)
    });

    // 2. STOCH
    const stochK = settings?.stochastic?.kPeriod || 14;
    const stochResults = JSIndicators.stoch(highsNum, lowsNum, closesNum, stochK);
    const stochVal = stochResults[stochResults.length - 1];
    let stochAction: "Buy" | "Sell" | "Neutral" = "Neutral";
    if (stochVal >= 80) stochAction = "Sell";
    else if (stochVal <= 20) stochAction = "Buy";
    oscillators.push({
        name: "Stochastic",
        value: stochVal.toString(),
        params: stochK.toString(),
        action: stochAction
    });

    // 3. CCI
    const cciLen = settings?.cci?.length || 20;
    const cciResults = JSIndicators.cci(closesNum, cciLen);
    const cciVal = cciResults[cciResults.length - 1];
    const cciThreshold = settings?.cci?.threshold || 100;
    let cciAction: "Buy" | "Sell" | "Neutral" = "Neutral";
    if (cciVal >= cciThreshold) cciAction = "Sell";
    else if (cciVal <= -cciThreshold) cciAction = "Buy";
    oscillators.push({
        name: "CCI",
        value: cciVal.toString(),
        params: cciLen.toString(),
        action: cciAction
    });

    // 4. ADX
    const adxLen = settings?.adx?.length || 14;
    const adxResults = JSIndicators.adx(highsNum, lowsNum, closesNum, adxLen);
    const adxVal = adxResults[adxResults.length - 1];
    let adxAction: "Buy" | "Sell" | "Neutral" = "Neutral";
    // Simple logic: if ADX > 25, trend is strong. Buy if price > EMA20, Sell if price < EMA20 (proxy)
    // For now, let's look at price vs previous price
    const prevClose = closesNum[closesNum.length - 2];
    const adxThreshold = settings?.adx?.threshold || 25;
    if (adxVal > adxThreshold) {
        adxAction = currentPrice.toNumber() > prevClose ? "Buy" : "Sell";
    }
    oscillators.push({
        name: "ADX",
        value: adxVal.toString(),
        params: adxLen.toString(),
        action: adxAction
    });

    // 5. MOM
    const momLen = settings?.momentum?.length || 10;
    const momResults = JSIndicators.mom(closesNum, momLen);
    const momVal = momResults[momResults.length - 1];
    oscillators.push({
        name: "Momentum",
        value: momVal.toString(),
        params: momLen.toString(),
        action: momVal > 0 ? "Buy" : "Sell"
    });

    // 6. MACD
    const macdFast = settings?.macd?.fastLength || 12;
    const macdSlow = settings?.macd?.slowLength || 26;
    const macdSig = settings?.macd?.signalLength || 9;
    const macdRes = JSIndicators.macd(closesNum, macdFast, macdSlow, macdSig);
    const macdVal = macdRes.macd[macdRes.macd.length - 1];
    const macdSigVal = macdRes.signal[macdRes.signal.length - 1];
    let macdAction: "Buy" | "Sell" | "Neutral" = "Neutral";
    if (macdVal > macdSigVal) macdAction = "Buy";
    else if (macdVal < macdSigVal) macdAction = "Sell";
    oscillators.push({
        name: "MACD",
        value: macdVal.toString(),
        signal: macdSigVal.toString(),
        params: `${macdFast}, ${macdSlow}, ${macdSig}`,
        action: macdAction
    });

    // 7. AO
    const aoFast = settings?.ao?.fastLength || 5;
    const aoSlow = settings?.ao?.slowLength || 34;
    const aoVal = calculateAwesomeOscillator(highsNum, lowsNum, aoFast, aoSlow);
    oscillators.push({
        name: "Awesome Osc.",
        value: aoVal.toString(),
        params: `${aoFast}, ${aoSlow}`,
        action: aoVal > 0 ? "Buy" : "Sell"
    });

    // --- Moving Averages ---
    const ema1 = settings?.ema?.ema1?.length || 21;
    const ema2 = settings?.ema?.ema2?.length || 50;
    const ema3 = settings?.ema?.ema3?.length || 200;
    const maList = [ema1, ema2, ema3];
    const currentClose = closesNum[closesNum.length - 1];

    maList.forEach(period => {
        const res = JSIndicators.ema(closesNum, period);
        const val = res[res.length - 1];
        if (val > 0) {
            movingAverages.push({
                name: "EMA",
                value: val.toString(),
                params: period.toString(),
                action: currentClose > val ? "Buy" : "Sell"
            });
        }
    });

    // Pivot
    const pivotType = settings?.pivots?.type || "classic";
    const pivotResult = calculatePivots(klinesDec, pivotType);

    const serializePivots = (p: any) => {
        if (!p || !p.classic) return { classic: { p: "0", r1: "0", r2: "0", r3: "0", s1: "0", s2: "0", s3: "0" } };
        const c = p.classic;
        return {
            classic: {
                p: c.p.toString(),
                r1: c.r1.toString(),
                r2: c.r2.toString(),
                r3: c.r3.toString(),
                s1: c.s1.toString(),
                s2: c.s2.toString(),
                s3: c.s3.toString(),
            }
        };
    };

    const serializeBasis = (b: any) => {
        if (!b) return { high: "0", low: "0", close: "0", open: "0" };
        return {
            high: b.high.toString(),
            low: b.low.toString(),
            close: b.close.toString(),
            open: b.open.toString()
        };
    };

    // Summary Logic
    let buy = 0, sell = 0, neutral = 0;
    [...oscillators, ...movingAverages].forEach(ind => {
        if (ind.action === "Buy") buy++;
        else if (ind.action === "Sell") sell++;
        else neutral++;
    });
    let summaryAction: "Buy" | "Sell" | "Neutral" = "Neutral";
    if (buy > sell && buy > neutral) summaryAction = "Buy";
    else if (sell > buy && sell > neutral) summaryAction = "Sell";

    return {
        oscillators,
        movingAverages,
        pivots: pivotResult ? serializePivots(pivotResult.pivots) : serializePivots(null),
        pivotBasis: pivotResult ? serializeBasis(pivotResult.basis) : serializeBasis(null),
        summary: { buy, sell, neutral, action: summaryAction }
    };
}

// --- Main Worker Listener ---

ctx.onmessage = async (e: MessageEvent<WorkerMessage>) => {
    const { type, payload, id } = e.data;

    if (type === "CALCULATE") {
        try {
            const result = calculateAllIndicators(payload);
            ctx.postMessage({ type: "RESULT", payload: result, id });

        } catch (error: any) {
            console.error("Worker Calculation Error: ", error);
            ctx.postMessage({ type: "ERROR", error: error.message, id });
        }
    }
};
