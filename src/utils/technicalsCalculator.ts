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
import { DivergenceScanner, type DivergenceResult } from "./divergenceScanner";
import { ConfluenceAnalyzer } from "./confluenceAnalyzer";
import type { IndicatorSettings } from "../stores/indicator.svelte";
import type { TechnicalsData, IndicatorResult, DivergenceItem } from "../services/technicalsTypes";

export function calculateAllIndicators(
    klines: Kline[],
    settings?: IndicatorSettings
): TechnicalsData {
    if (klines.length < 2) return getEmptyData();

    // Prepare data arrays (number[] for speed)
    const highsNum = klines.map((k) => k.high.toNumber());
    const lowsNum = klines.map((k) => k.low.toNumber());
    const closesNum = klines.map((k) => k.close.toNumber());
    const opensNum = klines.map((k) => k.open.toNumber());
    const volumesNum = klines.map((k) => k.volume.toNumber());
    const currentPrice = klines[klines.length - 1].close;

    // Helper to get source array based on config
    const getSource = (sourceType: string): number[] => {
        switch (sourceType) {
            case "open":
                return opensNum;
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
    const divergences: DivergenceItem[] = [];

    // Temporary storage for signals to valid divergences against
    const indSeries: Record<string, number[]> = {};

    try {
        // 1. RSI
        const rsiLen = settings?.rsi?.length || 14;
        const rsiSource = getSource(settings?.rsi?.source || "close");
        const rsiResults = JSIndicators.rsi(rsiSource, rsiLen);
        indSeries["RSI"] = rsiResults;
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

        let kLine = JSIndicators.stoch(highsNum, lowsNum, closesNum, stochK);
        if (stochKSmooth > 1) kLine = JSIndicators.sma(kLine, stochKSmooth);
        const dLine = JSIndicators.sma(kLine, stochD);
        indSeries["StochK"] = kLine;

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
            signal: stochDVal
        });

        // 3. CCI
        const cciLen = settings?.cci?.length || 20;
        const cciSmoothLen = settings?.cci?.smoothingLength || 1;
        const cciSource = getSource(settings?.cci?.source || "hlc3");
        let cciResults = JSIndicators.cci(cciSource, cciLen);
        if (cciSmoothLen > 1) cciResults = JSIndicators.sma(cciResults, cciSmoothLen); // Default SMA smoothing
        const cciVal = new Decimal(cciResults[cciResults.length - 1]);
        const cciThreshold = settings?.cci?.threshold || 100;
        indSeries["CCI"] = cciResults;

        oscillators.push({
            name: "CCI",
            value: cciVal,
            params: cciSmoothLen > 1 ? `${cciLen}, ${cciSmoothLen}` : cciLen.toString(),
            action: cciVal.gt(cciThreshold) ? "Sell" : cciVal.lt(-cciThreshold) ? "Buy" : "Neutral",
        });

        // 4. ADX (Trend Strength)
        const adxLen = settings?.adx?.adxSmoothing || 14;
        const adxResults = JSIndicators.adx(highsNum, lowsNum, closesNum, adxLen);
        const adxVal = new Decimal(adxResults[adxResults.length - 1]);
        const adxThreshold = settings?.adx?.threshold || 25;
        indSeries["ADX"] = adxResults;

        let adxAction: "Buy" | "Sell" | "Neutral" = "Neutral";
        // ADX itself just means trend strength, direction comes from price or DMI (omitted for brevity here but could add)
        // If strong trend, we assume continuation of current short term trend
        if (adxVal.gt(adxThreshold)) {
            const prevClose = closesNum[closesNum.length - 2];
            adxAction = currentPrice.toNumber() > prevClose ? "Buy" : "Sell";
        }

        oscillators.push({
            name: "ADX",
            value: adxVal,
            params: adxLen.toString(),
            action: adxAction,
        });

        // 5. Awesome Oscillator
        const aoFast = 5;
        const aoSlow = 34;
        const aoVal = new Decimal(calculateAwesomeOscillator(highsNum, lowsNum, aoFast, aoSlow));
        // We'd need the full series for divergence, but AO helper returns single value. 
        // We'll skip AO divergence for now unless we refactor helper.

        oscillators.push({
            name: "Awesome Osc.",
            params: `${aoFast}, ${aoSlow}`,
            value: aoVal,
            action: aoVal.gt(0) ? "Buy" : "Sell",
        });

        // 6. MACD
        const macdFast = 12;
        const macdSlow = 26;
        const macdSig = 9;
        const macdRes = JSIndicators.macd(closesNum, macdFast, macdSlow, macdSig);
        const macdVal = new Decimal(macdRes.macd[macdRes.macd.length - 1]);
        const macdSignalVal = new Decimal(macdRes.signal[macdRes.signal.length - 1]);
        const macdHist = macdVal.minus(macdSignalVal);
        indSeries["MACD"] = macdRes.macd; // Scan divergences on MACD line

        let macdAction: "Buy" | "Sell" | "Neutral" = "Neutral";
        if (macdVal.gt(macdSignalVal)) macdAction = "Buy";
        else if (macdVal.lt(macdSignalVal)) macdAction = "Sell";

        oscillators.push({
            name: "MACD",
            params: `${macdFast}, ${macdSlow}, ${macdSig}`,
            value: macdVal,
            signal: macdSignalVal,
            histogram: macdHist,
            action: macdAction
        });

        // 7. StochRSI (NEW)
        const stochRsiK = 14, stochRsiD = 3, stochRsiLen = 14, stochRsiSmooth = 1;
        const srRes = JSIndicators.stochRsi(closesNum, stochRsiLen, stochRsiK, stochRsiD, stochRsiSmooth);
        const srK = new Decimal(srRes.k[srRes.k.length - 1]);
        const srD = new Decimal(srRes.d[srRes.d.length - 1]);

        let srAction: "Buy" | "Sell" | "Neutral" = "Neutral";
        // StochRSI logic similar to Stoch but more sensitive
        if (srK.lt(20) && srD.lt(20) && srK.gt(srD)) srAction = "Buy";
        else if (srK.gt(80) && srD.gt(80) && srK.lt(srD)) srAction = "Sell";

        oscillators.push({
            name: "StochRSI",
            value: srK,
            signal: srD,
            params: `${stochRsiLen}, ${stochRsiK}, ${stochRsiD}`,
            action: srAction
        });

        // 8. Williams %R (NEW)
        const wR = JSIndicators.williamsR(highsNum, lowsNum, closesNum, 14);
        const wRVal = new Decimal(wR[wR.length - 1]);
        // Williams %R range is 0 to -100. Overbought > -20, Oversold < -80
        let wRAction: "Buy" | "Sell" | "Neutral" = "Neutral";
        if (wRVal.lt(-80)) wRAction = "Buy";
        else if (wRVal.gt(-20)) wRAction = "Sell";

        oscillators.push({
            name: "Will %R",
            value: wRVal,
            params: "14",
            action: wRAction
        });

    } catch (error) {
        console.error("Error calculating oscillators:", error);
    }

    // --- Divergences Scan ---
    try {
        // Scanners: RSI, MACD, CCI, StochK
        const scanList = [
            { name: "RSI", data: indSeries["RSI"] },
            { name: "MACD", data: indSeries["MACD"] },
            { name: "CCI", data: indSeries["CCI"] },
            { name: "Stoch", data: indSeries["StochK"] },
        ];

        scanList.forEach(item => {
            if (!item.data) return;
            const results = DivergenceScanner.scan(highsNum, lowsNum, item.data, item.name);
            results.forEach(res => {
                divergences.push({
                    indicator: res.indicator,
                    type: res.type,
                    side: res.side,
                    startIdx: res.startIdx,
                    endIdx: res.endIdx,
                    priceStart: res.priceStart,
                    priceEnd: res.priceEnd,
                    indStart: res.indStart,
                    indEnd: res.indEnd
                });
            });
        });
    } catch (e) {
        console.error("Divergence Scan Error:", e);
    }


    // --- Advanced / New Indicators ---
    let advancedInfo: TechnicalsData["advanced"] = {};
    try {
        // Phase 5: Pro Indicators Calculations
        const stResult = JSIndicators.superTrend(highsNum, lowsNum, closesNum, 10, 3);
        const atrTsResult = JSIndicators.atrTrailingStop(highsNum, lowsNum, closesNum, 22, 3);
        const obvResult = JSIndicators.obv(closesNum, volumesNum);
        const vpResult = JSIndicators.volumeProfile(highsNum, lowsNum, closesNum, volumesNum, 24);

        // VWAP
        const vwapSeries = JSIndicators.vwap(highsNum, lowsNum, closesNum, volumesNum);
        advancedInfo.vwap = new Decimal(vwapSeries[vwapSeries.length - 1]);

        // MFI
        const mfiSeries = JSIndicators.mfi(highsNum, lowsNum, closesNum, volumesNum, 14);
        const mfiVal = new Decimal(mfiSeries[mfiSeries.length - 1]);
        let mfiAction = "Neutral";
        if (mfiVal.gt(80)) mfiAction = "Sell"; // Overbought
        else if (mfiVal.lt(20)) mfiAction = "Buy"; // Oversold
        advancedInfo.mfi = { value: mfiVal, action: mfiAction };

        // Choppiness
        const chopSeries = JSIndicators.choppiness(highsNum, lowsNum, closesNum, 14);
        const chopVal = new Decimal(chopSeries[chopSeries.length - 1]);
        // > 61.8 = Consolidation/Chop, < 38.2 = Trending
        advancedInfo.choppiness = {
            value: chopVal,
            state: chopVal.gt(61.8) ? "Range" : chopVal.lt(38.2) ? "Trend" : "Range"
        };

        // Ichimoku
        const ichi = JSIndicators.ichimoku(highsNum, lowsNum, 9, 26, 52, 26);
        const idx = ichi.conversion.length - 1;
        const conv = new Decimal(ichi.conversion[idx]);
        const base = new Decimal(ichi.base[idx]);
        const spanA = new Decimal(ichi.spanA[idx]);
        const spanB = new Decimal(ichi.spanB[idx]);

        // Simple Ichi Signal: Price > Cloud && Conv > Base = Buy
        // Price < Cloud && Conv < Base = Sell
        let ichiAction = "Neutral";
        const cloudTop = spanA.gt(spanB) ? spanA : spanB;
        const cloudBottom = spanA.lt(spanB) ? spanA : spanB;

        if (currentPrice.gt(cloudTop) && conv.gt(base)) ichiAction = "Buy";
        else if (currentPrice.gt(cloudTop) && conv.gt(base) && currentPrice.gt(base)) ichiAction = "Strong Buy";
        else if (currentPrice.lt(cloudBottom) && conv.lt(base)) ichiAction = "Sell";

        advancedInfo.ichimoku = {
            conversion: conv,
            base: base,
            spanA: spanA,
            spanB: spanB,
            action: ichiAction
        };

        // Phase 5 Assignments
        advancedInfo.superTrend = {
            value: new Decimal(stResult.value[stResult.value.length - 1]),
            trend: stResult.trend[stResult.trend.length - 1] === 1 ? "bull" : "bear"
        };
        advancedInfo.atrTrailingStop = {
            buy: new Decimal(atrTsResult.buyStop[atrTsResult.buyStop.length - 1]),
            sell: new Decimal(atrTsResult.sellStop[atrTsResult.sellStop.length - 1])
        };
        advancedInfo.obv = new Decimal(obvResult[obvResult.length - 1]);

        if (vpResult) {
            advancedInfo.volumeProfile = {
                poc: new Decimal(vpResult.poc),
                vaHigh: new Decimal(vpResult.vaHigh),
                vaLow: new Decimal(vpResult.vaLow),
                rows: vpResult.rows.map(r => ({
                    priceStart: new Decimal(r.priceStart),
                    priceEnd: new Decimal(r.priceEnd),
                    volume: new Decimal(r.volume)
                }))
            };
        }

    } catch (e) {
        console.error("Advanced Indicators Error:", e);
    }

    // --- Moving Averages ---
    const movingAverages: IndicatorResult[] = [];
    try {
        const ema1 = 20, ema2 = 50, ema3 = 200;
        const emaPeriods = [ema1, ema2, ema3];
        for (const period of emaPeriods) {
            const emaResults = JSIndicators.ema(closesNum, period);
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

    // --- Volatility ---
    let volatility = undefined;
    try {
        const atrLen = 14;
        const bbLen = 20;
        const bbStdDev = 2;

        const atrResults = JSIndicators.atr(highsNum, lowsNum, closesNum, atrLen);
        const bbResults = JSIndicators.bb(closesNum, bbLen, bbStdDev);

        const currentAtr = new Decimal(atrResults[atrResults.length - 1]);
        const bbUpper = new Decimal(bbResults.upper[bbResults.upper.length - 1]);
        const bbLower = new Decimal(bbResults.lower[bbResults.lower.length - 1]);
        const bbMiddle = new Decimal(bbResults.middle[bbResults.middle.length - 1]);

        const range = bbUpper.minus(bbLower);
        const percentP = range.isZero()
            ? new Decimal(0.5)
            : currentPrice.minus(bbLower).div(range);

        volatility = {
            atr: currentAtr,
            bb: {
                upper: bbUpper,
                middle: bbMiddle,
                lower: bbLower,
                percentP: percentP
            }
        };
    } catch (e) {
        console.error("Volatility calculation error:", e);
    }

    // --- Summary & Confluence ---
    let buy = 0;
    let sell = 0;
    let neutral = 0;

    [...oscillators, ...movingAverages].forEach((ind) => {
        if (ind.action.includes("Buy")) buy++;
        else if (ind.action.includes("Sell")) sell++;
        else neutral++;
    });

    let summaryAction: "Buy" | "Sell" | "Neutral" = "Neutral";
    if (buy > sell && buy > neutral) summaryAction = "Buy";
    else if (sell > buy && sell > neutral) summaryAction = "Sell";

    // Construct Partial result for Confluence Analysis
    const partialData: Partial<TechnicalsData> = {
        oscillators,
        movingAverages,
        divergences,
        advanced: advancedInfo,
        pivotBasis: pivotData.basis
    };

    const confluence = ConfluenceAnalyzer.analyze(partialData);

    return {
        oscillators,
        movingAverages,
        pivots: pivotData.pivots,
        pivotBasis: pivotData.basis,
        summary: { buy, sell, neutral, action: summaryAction },
        volatility,
        divergences,
        confluence,
        advanced: advancedInfo
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
