/*
 * Copyright (C) 2026 MYDCT
 *
 * Shared Calculation Logic for Technical Indicators.
 * Used by running both in Main Thread (Fallback) and Worker (Performance).
 */

import { Decimal } from "decimal.js";
import {
    JSIndicators,
    calculateAwesomeOscillator,
    calculatePivots,
    getRsiAction,
    type Kline
} from "./indicators";
import type { IndicatorSettings } from "../stores/indicatorStore";
import type { TechnicalsData, IndicatorResult } from "../services/technicalsTypes";

export function calculateAllIndicators(
    klines: Kline[],
    settings?: IndicatorSettings
): TechnicalsData {
    if (klines.length < 2) return getEmptyData();

    // Prepare data arrays (number[] for speed)
    const highsNum = klines.map((k) => k.high.toNumber());
    const lowsNum = klines.map((k) => k.low.toNumber());
    const closesNum = klines.map((k) => k.close.toNumber());
    const currentPrice = klines[klines.length - 1].close;

    // Helper to get source array based on config
    const getSource = (sourceType: string): number[] => {
        switch (sourceType) {
            case "open":
                return klines.map((k) => k.open.toNumber());
            case "high":
                return highsNum;
            case "low":
                return lowsNum;
            case "hl2":
                return klines.map((k) => k.high.plus(k.low).div(2).toNumber());
            case "hlc3":
                return klines.map((k) => k.high.plus(k.low).plus(k.close).div(3).toNumber());
            default:
                return closesNum;
        }
    };

    // --- Oscillators ---
    const oscillators: IndicatorResult[] = [];

    try {
        // 1. RSI
        const rsiLen = settings?.rsi?.length || 14;
        const rsiSource = getSource(settings?.rsi?.source || "close");
        const rsiResults = JSIndicators.rsi(rsiSource, rsiLen);
        const rsiVal = new Decimal(rsiResults[rsiResults.length - 1]);

        oscillators.push({
            name: "RSI",
            value: rsiVal,
            params: rsiLen.toString(),
            action: getRsiAction(
                rsiVal,
                settings?.rsi?.overbought || 70,
                settings?.rsi?.oversold || 30,
            ),
        });

        // 2. Stochastic
        const stochK = settings?.stochastic?.kPeriod || 14;
        const stochD = settings?.stochastic?.dPeriod || 3;
        const stochKSmooth = settings?.stochastic?.kSmoothing || 1;

        let kLine = JSIndicators.stoch(
            Array.from(highsNum),
            Array.from(lowsNum),
            Array.from(closesNum),
            stochK,
        );
        if (stochKSmooth > 1) kLine = JSIndicators.sma(kLine, stochKSmooth);
        const dLine = JSIndicators.sma(kLine, stochD);

        const stochKVal = new Decimal(kLine[kLine.length - 1]);
        const stochDVal = new Decimal(dLine[dLine.length - 1]);

        let stochAction: "Buy" | "Sell" | "Neutral" = "Neutral";
        // Classic Stoch Strategy
        if (stochKVal.lt(20) && stochDVal.lt(20) && stochKVal.gt(stochDVal))
            stochAction = "Buy";
        else if (stochKVal.gt(80) && stochDVal.gt(80) && stochKVal.lt(stochDVal))
            stochAction = "Sell";

        oscillators.push({
            name: "Stoch",
            params: `${stochK}, ${stochKSmooth}, ${stochD}`,
            value: stochKVal,
            action: stochAction,
            // signal: stochDVal // Add if supported by UI
        });

        // 3. CCI
        const cciLen = settings?.cci?.length || 20;
        const cciSmoothLen = settings?.cci?.smoothingLength || 1;
        const cciSmoothType = settings?.cci?.smoothingType || "sma";
        // Default CCI source is Typical Price (HLC3)
        const cciSource = getSource(settings?.cci?.source || "hlc3");

        let cciResults = JSIndicators.cci(cciSource, cciLen);

        // Apply smoothing if requested
        if (cciSmoothLen > 1) {
            if (cciSmoothType === "ema") {
                cciResults = JSIndicators.ema(cciResults, cciSmoothLen);
            } else {
                cciResults = JSIndicators.sma(cciResults, cciSmoothLen);
            }
        }

        const cciVal = new Decimal(cciResults[cciResults.length - 1]);
        const cciThreshold = settings?.cci?.threshold || 100;

        oscillators.push({
            name: "CCI",
            value: cciVal,
            params:
                cciSmoothLen > 1
                    ? `${cciLen}, ${cciSmoothLen} (${cciSmoothType.toUpperCase()})`
                    : cciLen.toString(),
            action: cciVal.gt(cciThreshold) ? "Sell" : cciVal.lt(-cciThreshold) ? "Buy" : "Neutral",
        });

        // 4. ADX
        const adxLen = settings?.adx?.adxSmoothing || 14;
        const adxResults = JSIndicators.adx(
            Array.from(highsNum),
            Array.from(lowsNum),
            Array.from(closesNum),
            adxLen,
        );
        const adxVal = new Decimal(adxResults[adxResults.length - 1]);
        const adxThreshold = settings?.adx?.threshold || 25;

        // ADX logic: If ADX > threshold, look at price trend
        let adxAction: "Buy" | "Sell" | "Neutral" = "Neutral";
        if (adxVal.gt(adxThreshold)) {
            // Check trend direction using simple Close vs Prev Close
            const prevClose = klines[klines.length - 2].close;
            adxAction = currentPrice.gt(prevClose) ? "Buy" : "Sell";
        }

        oscillators.push({
            name: "ADX",
            value: adxVal,
            params: adxLen.toString(),
            action: adxAction,
        });

        // 5. Awesome Oscillator
        const aoFast = settings?.ao?.fastLength || 5;
        const aoSlow = settings?.ao?.slowLength || 34;
        const aoVal = new Decimal(calculateAwesomeOscillator(
            highsNum,
            lowsNum,
            aoFast,
            aoSlow,
        ));

        let aoAction: "Buy" | "Sell" | "Neutral" = "Neutral";
        if (aoVal.gt(0)) aoAction = "Buy";
        else if (aoVal.lt(0)) aoAction = "Sell";

        oscillators.push({
            name: "Awesome Osc.",
            params: `${aoFast}, ${aoSlow}`,
            value: aoVal,
            action: aoAction,
        });

        // 6. Momentum
        const momLen = settings?.momentum?.length || 10;
        const momSource = getSource(settings?.momentum?.source || "close");
        const momResults = JSIndicators.mom(momSource, momLen);
        const momVal = new Decimal(momResults[momResults.length - 1]);

        let momAction: "Buy" | "Sell" | "Neutral" = "Neutral";
        if (momVal.gt(0)) momAction = "Buy";
        else if (momVal.lt(0)) momAction = "Sell";

        oscillators.push({
            name: "Momentum",
            params: `${momLen}`,
            value: momVal,
            action: momAction,
        });

        // 7. MACD
        const macdFast = settings?.macd?.fastLength || 12;
        const macdSlow = settings?.macd?.slowLength || 26;
        const macdSig = settings?.macd?.signalLength || 9;
        const macdSource = getSource(settings?.macd?.source || "close");

        const macdResults = JSIndicators.macd(
            macdSource,
            macdFast,
            macdSlow,
            macdSig,
        );
        const macdVal = new Decimal(
            macdResults.macd[macdResults.macd.length - 1],
        );
        const macdSignalVal = new Decimal(
            macdResults.signal[macdResults.signal.length - 1],
        );

        let macdAction: "Buy" | "Sell" | "Neutral" = "Neutral";
        if (!macdVal.isZero() || !macdSignalVal.isZero()) {
            if (macdVal.gt(macdSignalVal)) macdAction = "Buy";
            else if (macdVal.lt(macdSignalVal)) macdAction = "Sell";
        }

        oscillators.push({
            name: "MACD",
            params: `${macdFast}, ${macdSlow}, ${macdSig}`,
            value: macdVal,
            signal: macdSignalVal,
            action: macdAction,
        });

    } catch (error) {
        console.error("Error calculating oscillators:", error);
    }

    // --- Moving Averages ---
    const movingAverages: IndicatorResult[] = [];
    try {
        const ema1 = settings?.ema?.ema1?.length || 20;
        const ema2 = settings?.ema?.ema2?.length || 50;
        const ema3 = settings?.ema?.ema3?.length || 200;
        const emaSource = getSource(settings?.ema?.source || "close");

        const emaPeriods = [ema1, ema2, ema3];

        for (const period of emaPeriods) {
            const emaResults = JSIndicators.ema(emaSource, period);
            const emaVal = new Decimal(emaResults[emaResults.length - 1]);

            movingAverages.push({
                name: "EMA",
                params: `${period}`,
                value: emaVal,
                action: currentPrice.gt(emaVal) ? "Buy" : "Sell",
            });
        }
    } catch (error) {
        console.error("Error calculating moving averages:", error);
    }

    // --- Pivots ---
    const pivotType = settings?.pivots?.type || "classic";
    const pivotData = calculatePivots(klines, pivotType);

    // --- Summary ---
    let buy = 0;
    let sell = 0;
    let neutral = 0;

    [...oscillators, ...movingAverages].forEach((ind) => {
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
        pivots: pivotData.pivots,
        pivotBasis: pivotData.basis,
        summary: { buy, sell, neutral, action: summaryAction },
    };
}

export function getEmptyData(): TechnicalsData {
    return {
        oscillators: [],
        movingAverages: [],
        pivots: {
            classic: {
                p: new Decimal(0),
                r1: new Decimal(0),
                r2: new Decimal(0),
                r3: new Decimal(0),
                s1: new Decimal(0),
                s2: new Decimal(0),
                s3: new Decimal(0),
            },
        },
        pivotBasis: {
            high: new Decimal(0),
            low: new Decimal(0),
            close: new Decimal(0),
            open: new Decimal(0)
        },
        summary: { buy: 0, sell: 0, neutral: 0, action: "Neutral" },
    };
}
