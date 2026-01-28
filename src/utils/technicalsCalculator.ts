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
  calculatePivotsFromValues,
  type Kline,
} from "./indicators";
import { DivergenceScanner, type DivergenceResult } from "./divergenceScanner";
import { ConfluenceAnalyzer } from "./confluenceAnalyzer";
import type { IndicatorSettings } from "../stores/indicator.svelte";
import type {
  TechnicalsData,
  IndicatorResult,
  DivergenceItem,
} from "../services/technicalsTypes";

export function calculateAllIndicators(
  klines: Kline[],
  settings?: IndicatorSettings,
  enabledIndicators?: Partial<Record<string, boolean>>,
): TechnicalsData {
  if (klines.length < 2) return getEmptyData();

  // Prepare data arrays (number[] for speed)
  const highsNum = klines.map((k) => new Decimal(k.high).toNumber());
  const lowsNum = klines.map((k) => new Decimal(k.low).toNumber());
  const closesNum = klines.map((k) => new Decimal(k.close).toNumber());
  const opensNum = klines.map((k) => new Decimal(k.open).toNumber());
  const volumesNum = klines.map((k) => new Decimal(k.volume).toNumber());
  const timesNum = klines.map((k) => k.time);

  return calculateIndicatorsFromArrays(
    timesNum,
    opensNum,
    highsNum,
    lowsNum,
    closesNum,
    volumesNum,
    settings,
    enabledIndicators
  );
}

export function calculateIndicatorsFromArrays(
  timesNum: number[] | Float64Array,
  opensNum: number[] | Float64Array,
  highsNum: number[] | Float64Array,
  lowsNum: number[] | Float64Array,
  closesNum: number[] | Float64Array,
  volumesNum: number[] | Float64Array,
  settings?: IndicatorSettings,
  enabledIndicators?: Partial<Record<string, boolean>>,
): TechnicalsData {
  const currentPrice = new Decimal(closesNum[closesNum.length - 1]);

  // Helper to check if indicator should be calculated
  const shouldCalculate = (name: string) =>
    !enabledIndicators || enabledIndicators[name] !== false;

  // Helper to get source array based on config
  const getSource = (sourceType: string): number[] | Float64Array => {
    switch (sourceType) {
      case "open":
        return opensNum;
      case "high":
        return highsNum;
      case "low":
        return lowsNum;
      case "hl2":
        return highsNum.map((h, i) => (h + lowsNum[i]) / 2);
      case "hlc3":
        return highsNum.map((h, i) => (h + lowsNum[i] + closesNum[i]) / 3);
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
    if (shouldCalculate('rsi')) {
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
    }

    // 2. Stochastic
    if (shouldCalculate('stochastic')) {
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
        signal: stochDVal,
      });
    }

    // 3. CCI
    if (shouldCalculate('cci')) {
      const cciLen = settings?.cci?.length || 20;
      const cciSmoothLen = settings?.cci?.smoothingLength || 1;
      const cciSource = getSource(settings?.cci?.source || "hlc3");
      let cciResults = JSIndicators.cci(cciSource, cciLen);
      if (cciSmoothLen > 1)
        cciResults = JSIndicators.sma(cciResults, cciSmoothLen); // Default SMA smoothing
      const cciVal = new Decimal(cciResults[cciResults.length - 1]);
      const cciThreshold = settings?.cci?.threshold || 100;
      indSeries["CCI"] = cciResults;

      oscillators.push({
        name: "CCI",
        value: cciVal,
        params:
          cciSmoothLen > 1 ? `${cciLen}, ${cciSmoothLen}` : cciLen.toString(),
        action: cciVal.gt(cciThreshold)
          ? "Sell"
          : cciVal.lt(-cciThreshold)
            ? "Buy"
            : "Neutral",
      });
    }

    // 4. ADX (Trend Strength)
    if (shouldCalculate('adx')) {
      const adxLen = settings?.adx?.adxSmoothing || 14;
      const adxDiLen = settings?.adx?.diLength || 14; // Default to 14 if not set
      const adxResults = JSIndicators.adx(highsNum, lowsNum, closesNum, adxLen);
      // Note: JSIndicators.adx implementation might use a single length for both currently.
      // If we want separate DI length, we'd need to update JSIndicators.adx signature.
      // For now, we assume the underlying impl uses the passed length for both or as main smoothing.
      const adxVal = new Decimal(adxResults[adxResults.length - 1]);
      const adxThreshold = settings?.adx?.threshold || 25;
      indSeries["ADX"] = adxResults;

      let adxAction: "Buy" | "Sell" | "Neutral" = "Neutral";
      // ADX itself just means trend strength, direction comes from price or DMI (omitted for brevity here but could add)
      // If strong trend, we assume continuation of current short term trend
      if (adxVal.gt(adxThreshold)) {
        const prevClose = closesNum[closesNum.length - 2];
        adxAction = currentPrice.gt(prevClose) ? "Buy" : "Sell";
      }

      oscillators.push({
        name: "ADX",
        value: adxVal,
        params: adxLen.toString(),
        action: adxAction,
      });
    }

    // 5. Awesome Oscillator
    if (shouldCalculate('ao')) {
      const aoFast = settings?.ao?.fastLength || 5;
      const aoSlow = settings?.ao?.slowLength || 34;
      const aoVal = new Decimal(
        calculateAwesomeOscillator(highsNum, lowsNum, aoFast, aoSlow),
      );
      // We'd need the full series for divergence, but AO helper returns single value.
      // We'll skip AO divergence for now unless we refactor helper.

      oscillators.push({
        name: "Awesome Osc.",
        params: `${aoFast}, ${aoSlow}`,
        value: aoVal,
        action: aoVal.gt(0) ? "Buy" : "Sell",
      });
    }

    // 6. MACD
    if (shouldCalculate('macd')) {
      const macdFast = settings?.macd?.fastLength || 12;
      const macdSlow = settings?.macd?.slowLength || 26;
      const macdSig = settings?.macd?.signalLength || 9;
      const macdSource = getSource(settings?.macd?.source || "close");
      const macdRes = JSIndicators.macd(macdSource, macdFast, macdSlow, macdSig);
      const macdVal = new Decimal(macdRes.macd[macdRes.macd.length - 1]);
      const macdSignalVal = new Decimal(
        macdRes.signal[macdRes.signal.length - 1],
      );
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
        action: macdAction,
      });
    }

    // 7. StochRSI (NEW)
    const stochRsiK = settings?.stochRsi?.kPeriod || 3;
    const stochRsiD = settings?.stochRsi?.dPeriod || 3;
    const stochRsiLen = settings?.stochRsi?.length || 14;
    const stochRsiRsiLen = settings?.stochRsi?.rsiLength || 14;
    const stochRsiSmooth = 1; // Not yet in settings, assume 1

    const srRes = JSIndicators.stochRsi(
      closesNum,
      stochRsiRsiLen,
      stochRsiK,
      stochRsiD,
      stochRsiSmooth,
    );
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
      params: `${stochRsiRsiLen}, ${stochRsiK}, ${stochRsiD}`,
      action: srAction,
    });

    // 8. Williams %R (NEW)
    const wRLen = settings?.williamsR?.length || 14;
    const wR = JSIndicators.williamsR(highsNum, lowsNum, closesNum, wRLen);
    const wRVal = new Decimal(wR[wR.length - 1]);
    // Williams %R range is 0 to -100. Overbought > -20, Oversold < -80
    let wRAction: "Buy" | "Sell" | "Neutral" = "Neutral";
    if (wRVal.lt(-80)) wRAction = "Buy";
    else if (wRVal.gt(-20)) wRAction = "Sell";

    oscillators.push({
      name: "Will %R",
      value: wRVal,
      params: wRLen.toString(),
      action: wRAction,
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Error calculating oscillators:", error);
    }
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

    scanList.forEach((item) => {
      if (!item.data) return;
      const results = DivergenceScanner.scan(
        highsNum,
        lowsNum,
        item.data,
        item.name,
      );
      results.forEach((res) => {
        divergences.push({
          indicator: res.indicator,
          type: res.type,
          side: res.side,
          startIdx: res.startIdx,
          endIdx: res.endIdx,
          priceStart: res.priceStart,
          priceEnd: res.priceEnd,
          indStart: res.indStart,
          indEnd: res.indEnd,
        });
      });
    });
  } catch (e) {
    if (import.meta.env.DEV) {
      console.error("Divergence Scan Error:", e);
    }
  }

  // --- Advanced / New Indicators ---
  let advancedInfo: TechnicalsData["advanced"] = {};
  try {
    // Phase 5: Pro Indicators Calculations
    const stResult = JSIndicators.superTrend(
      highsNum,
      lowsNum,
      closesNum,
      settings?.superTrend?.period || 10,
      settings?.superTrend?.factor || 3,
    );
    const atrTsResult = JSIndicators.atrTrailingStop(
      highsNum,
      lowsNum,
      closesNum,
      settings?.atrTrailingStop?.period || 14,
      settings?.atrTrailingStop?.multiplier || 3.5,
    );
    const obvResult = JSIndicators.obv(closesNum, volumesNum);

    const vpResult = JSIndicators.volumeProfile(
      highsNum,
      lowsNum,
      closesNum,
      volumesNum,
      settings?.volumeProfile?.rows || 24,
    );

    // VWAP
    const vwapSeries = JSIndicators.vwap(
      highsNum,
      lowsNum,
      closesNum,
      volumesNum,
      timesNum,
      {
        mode: (settings?.vwap as any)?.anchor || "session",
        anchorPoint: (settings?.vwap as any)?.anchorPoint
      }
    );
    advancedInfo.vwap = new Decimal(vwapSeries[vwapSeries.length - 1]);

    // Parabolic SAR
    const psarStart = (settings?.parabolicSar as any)?.start || 0.02;
    const psarMax = (settings?.parabolicSar as any)?.max || 0.2;
    const psarSeries = JSIndicators.psar(highsNum, lowsNum, psarStart, psarMax);
    advancedInfo.parabolicSar = new Decimal(psarSeries[psarSeries.length - 1]);

    // MFI
    const mfiLen = settings?.mfi?.length || 14;
    const mfiSeries = JSIndicators.mfi(
      highsNum,
      lowsNum,
      closesNum,
      volumesNum,
      mfiLen,
    );
    const mfiVal = new Decimal(mfiSeries[mfiSeries.length - 1]);
    let mfiAction = "Neutral";
    if (mfiVal.gt(80))
      mfiAction = "Sell"; // Overbought
    else if (mfiVal.lt(20)) mfiAction = "Buy"; // Oversold
    advancedInfo.mfi = { value: mfiVal, action: mfiAction };

    // Choppiness
    const chopLen = settings?.choppiness?.length || 14;
    const chopSeries = JSIndicators.choppiness(
      highsNum,
      lowsNum,
      closesNum,
      chopLen,
    );
    const chopVal = new Decimal(chopSeries[chopSeries.length - 1]);
    // > 61.8 = Consolidation/Chop, < 38.2 = Trending
    advancedInfo.choppiness = {
      value: chopVal,
      state: chopVal.gt(61.8) ? "Range" : chopVal.lt(38.2) ? "Trend" : "Range",
    };

    // Ichimoku
    const ichiConv = settings?.ichimoku?.conversionPeriod || 9;
    const ichiBase = settings?.ichimoku?.basePeriod || 26;
    const ichiSpanB = settings?.ichimoku?.spanBPeriod || 52;
    const ichiDisp = settings?.ichimoku?.displacement || 26;

    const ichi = JSIndicators.ichimoku(
      highsNum,
      lowsNum,
      ichiConv,
      ichiBase,
      ichiSpanB,
      ichiDisp,
    );
    const idx = ichi.conversion.length - 1;
    const conv = new Decimal(ichi.conversion[idx] || 0); // Guard against empty
    const base = new Decimal(ichi.base[idx] || 0);
    const spanA = new Decimal(ichi.spanA[idx] || 0);
    const spanB = new Decimal(ichi.spanB[idx] || 0);

    // Simple Ichi Signal: Price > Cloud && Conv > Base = Buy
    // Price < Cloud && Conv < Base = Sell
    let ichiAction = "Neutral";
    const cloudTop = spanA.gt(spanB) ? spanA : spanB;
    const cloudBottom = spanA.lt(spanB) ? spanA : spanB;

    if (currentPrice.gt(cloudTop) && conv.gt(base)) ichiAction = "Buy";
    else if (
      currentPrice.gt(cloudTop) &&
      conv.gt(base) &&
      currentPrice.gt(base)
    )
      ichiAction = "Strong Buy";
    else if (currentPrice.lt(cloudBottom) && conv.lt(base)) ichiAction = "Sell";

    advancedInfo.ichimoku = {
      conversion: conv,
      base: base,
      spanA: spanA,
      spanB: spanB,
      action: ichiAction,
    };

    // Phase 5 Assignments
    advancedInfo.superTrend = {
      value: new Decimal(stResult.value[stResult.value.length - 1]),
      trend: stResult.trend[stResult.trend.length - 1] === 1 ? "bull" : "bear",
    };
    advancedInfo.atrTrailingStop = {
      buy: new Decimal(atrTsResult.buyStop[atrTsResult.buyStop.length - 1]),
      sell: new Decimal(atrTsResult.sellStop[atrTsResult.sellStop.length - 1]),
    };
    advancedInfo.obv = new Decimal(obvResult[obvResult.length - 1]);

    if (vpResult) {
      advancedInfo.volumeProfile = {
        poc: new Decimal(vpResult.poc),
        vaHigh: new Decimal(vpResult.vaHigh),
        vaLow: new Decimal(vpResult.vaLow),
        rows: vpResult.rows.map((r) => ({
          priceStart: new Decimal(r.priceStart),
          priceEnd: new Decimal(r.priceEnd),
          volume: new Decimal(r.volume),
        })),
      };
    }
  } catch (e) {
    if (import.meta.env.DEV) {
      console.error("Advanced Indicators Error:", e);
    }
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
    if (import.meta.env.DEV) {
      console.error("Error calculating moving averages:", error);
    }
  }

  // --- Pivots ---
  const pivotType = settings?.pivots?.type || "classic";
  // Pro-Level: Use array optimized pivot calc
  // Need previous completed candle (index length - 2)
  const prevIdx = closesNum.length - 2;
  let pivotData;
  if (prevIdx >= 0) {
    pivotData = calculatePivotsFromValues(
      highsNum[prevIdx],
      lowsNum[prevIdx],
      closesNum[prevIdx],
      opensNum[prevIdx],
      pivotType
    );
  } else {
    // Check if we can get empty data easily or just use calculator logic helper
    // Reuse logic from getEmptyData basically
    pivotData = { pivots: getEmptyData().pivots, basis: getEmptyData().pivotBasis! };
  }

  // --- Volatility ---
  let volatility = undefined;
  try {
    const atrLen = settings?.atr?.length || 14;
    const bbLen = settings?.bb?.length || 20;
    const bbStdDev = settings?.bb?.stdDev || 2;

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
        percentP: percentP,
      },
    };
  } catch (e) {
    if (import.meta.env.DEV) {
      console.error("Volatility calculation error:", e);
    }
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
    pivotBasis: pivotData.basis,
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
    advanced: advancedInfo,
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
      open: new Decimal(0),
    },
    summary: { buy: 0, sell: 0, neutral: 0, action: "Neutral" },
  };
}
