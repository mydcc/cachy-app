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
  // Optimization: Single loop extraction with pre-allocated arrays
  const len = klines.length;
  const highsNum = new Array(len);
  const lowsNum = new Array(len);
  const closesNum = new Array(len);
  const opensNum = new Array(len);
  const volumesNum = new Array(len);
  const timesNum = new Array(len);

  for (let i = 0; i < len; i++) {
    const k = klines[i];
    highsNum[i] = k.high.toNumber();
    lowsNum[i] = k.low.toNumber();
    closesNum[i] = k.close.toNumber();
    opensNum[i] = k.open.toNumber();
    volumesNum[i] = k.volume.toNumber();
    timesNum[i] = k.time;
  }

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
  const currentPrice = closesNum[closesNum.length - 1];

  // Normalize enabledIndicators keys to lowercase
  const normalizedEnabled: Record<string, boolean> = {};
  if (enabledIndicators) {
    Object.entries(enabledIndicators).forEach(([k, v]) => {
      if (v !== undefined) {
        normalizedEnabled[k.toLowerCase()] = v;
      }
    });
  }

  // Determine filtering mode:
  // If ANY key is explicitly true -> Allowlist mode (only calc enabled)
  // Else -> Blocklist mode (calc all except disabled)
  const hasAllowList = Object.values(normalizedEnabled).some((v) => v === true);

  // Helper to check if indicator should be calculated
  const shouldCalculate = (name: string) => {
    if (!enabledIndicators) return true;
    const key = name.toLowerCase();
    if (hasAllowList) {
      return normalizedEnabled[key] === true;
    }
    return normalizedEnabled[key] !== false;
  };

  // Cache for derived sources
  const sourceCache: Record<string, number[] | Float64Array> = {};

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
        if (!sourceCache["hl2"]) {
          sourceCache["hl2"] = (highsNum as number[]).map(
            (h, i) => (h + lowsNum[i]) / 2,
          );
        }
        return sourceCache["hl2"];
      case "hlc3":
        if (!sourceCache["hlc3"]) {
          sourceCache["hlc3"] = (highsNum as number[]).map(
            (h, i) => (h + lowsNum[i] + closesNum[i]) / 3,
          );
        }
        return sourceCache["hlc3"];
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
      const rsiVal = rsiResults[rsiResults.length - 1];

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

      const stochKVal = kLine[kLine.length - 1];
      const stochDVal = dLine[dLine.length - 1];

      let stochAction: "Buy" | "Sell" | "Neutral" = "Neutral";
      // Classic Stoch Strategy
      if (stochKVal < 20 && stochDVal < 20 && stochKVal > stochDVal)
        stochAction = "Buy";
      else if (stochKVal > 80 && stochDVal > 80 && stochKVal < stochDVal)
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
      const cciVal = cciResults[cciResults.length - 1];
      const cciThreshold = settings?.cci?.threshold || 100;
      indSeries["CCI"] = cciResults;

      oscillators.push({
        name: "CCI",
        value: cciVal,
        params:
          cciSmoothLen > 1 ? `${cciLen}, ${cciSmoothLen}` : cciLen.toString(),
        action: cciVal > cciThreshold
          ? "Sell"
          : cciVal < -cciThreshold
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
      const adxVal = adxResults[adxResults.length - 1];
      const adxThreshold = settings?.adx?.threshold || 25;
      indSeries["ADX"] = adxResults;

      let adxAction: "Buy" | "Sell" | "Neutral" = "Neutral";
      // ADX itself just means trend strength, direction comes from price or DMI (omitted for brevity here but could add)
      // If strong trend, we assume continuation of current short term trend
      if (adxVal > adxThreshold) {
        const prevClose = closesNum[closesNum.length - 2];
        adxAction = currentPrice > prevClose ? "Buy" : "Sell";
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
      const aoVal = calculateAwesomeOscillator(
        highsNum,
        lowsNum,
        aoFast,
        aoSlow,
        getSource("hl2"),
      );
      // We'd need the full series for divergence, but AO helper returns single value.
      // We'll skip AO divergence for now unless we refactor helper.

      oscillators.push({
        name: "Awesome Osc.",
        params: `${aoFast}, ${aoSlow}`,
        value: aoVal,
        action: aoVal > 0 ? "Buy" : "Sell",
      });
    }

    // 6. MACD
    if (shouldCalculate('macd')) {
      const macdFast = settings?.macd?.fastLength || 12;
      const macdSlow = settings?.macd?.slowLength || 26;
      const macdSig = settings?.macd?.signalLength || 9;
      const macdSource = getSource(settings?.macd?.source || "close");
      const macdRes = JSIndicators.macd(macdSource, macdFast, macdSlow, macdSig);
      const macdVal = macdRes.macd[macdRes.macd.length - 1];
      const macdSignalVal = macdRes.signal[macdRes.signal.length - 1];
      const macdHist = macdVal - macdSignalVal;
      indSeries["MACD"] = macdRes.macd; // Scan divergences on MACD line

      let macdAction: "Buy" | "Sell" | "Neutral" = "Neutral";
      if (macdVal > macdSignalVal) macdAction = "Buy";
      else if (macdVal < macdSignalVal) macdAction = "Sell";

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
    if (shouldCalculate('stochrsi')) {
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
        const srK = srRes.k[srRes.k.length - 1];
        const srD = srRes.d[srRes.d.length - 1];

        let srAction: "Buy" | "Sell" | "Neutral" = "Neutral";
        // StochRSI logic similar to Stoch but more sensitive
        if (srK < 20 && srD < 20 && srK > srD) srAction = "Buy";
        else if (srK > 80 && srD > 80 && srK < srD) srAction = "Sell";

        oscillators.push({
        name: "StochRSI",
        value: srK,
        signal: srD,
        params: `${stochRsiRsiLen}, ${stochRsiK}, ${stochRsiD}`,
        action: srAction,
        });
    }

    // 8. Williams %R (NEW)
    if (shouldCalculate('williamsr')) {
        const wRLen = settings?.williamsR?.length || 14;
        const wR = JSIndicators.williamsR(highsNum, lowsNum, closesNum, wRLen);
        const wRVal = wR[wR.length - 1];
        // Williams %R range is 0 to -100. Overbought > -20, Oversold < -80
        let wRAction: "Buy" | "Sell" | "Neutral" = "Neutral";
        if (wRVal < -80) wRAction = "Buy";
        else if (wRVal > -20) wRAction = "Sell";

        oscillators.push({
        name: "Will %R",
        value: wRVal,
        params: wRLen.toString(),
        action: wRAction,
        });
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Error calculating oscillators:", error);
    }
  }

  // --- Divergences Scan ---
  try {
    // Scanners: RSI, MACD, CCI, StochK
    // We only scan for what we calculated
    const scanList = [
      { name: "RSI", data: indSeries["RSI"] },
      { name: "MACD", data: indSeries["MACD"] },
      { name: "CCI", data: indSeries["CCI"] },
      { name: "Stoch", data: indSeries["StochK"] },
    ].filter(i => !!i.data);

    // Only scan if scanner itself is allowed (implied by indicator presence usually, but we could add separate control)
    scanList.forEach((item) => {
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
    if (shouldCalculate('supertrend')) {
        const stResult = JSIndicators.superTrend(
        highsNum,
        lowsNum,
        closesNum,
        settings?.superTrend?.period || 10,
        settings?.superTrend?.factor || 3,
        );
        advancedInfo.superTrend = {
            value: stResult.value[stResult.value.length - 1],
            trend: stResult.trend[stResult.trend.length - 1] === 1 ? "bull" : "bear",
        };
    }

    if (shouldCalculate('atrtrailingstop')) {
        const atrTsResult = JSIndicators.atrTrailingStop(
        highsNum,
        lowsNum,
        closesNum,
        settings?.atrTrailingStop?.period || 14,
        settings?.atrTrailingStop?.multiplier || 3.5,
        );
        advancedInfo.atrTrailingStop = {
            buy: atrTsResult.buyStop[atrTsResult.buyStop.length - 1],
            sell: atrTsResult.sellStop[atrTsResult.sellStop.length - 1],
        };
    }

    if (shouldCalculate('obv')) {
        const obvResult = JSIndicators.obv(closesNum, volumesNum);
        advancedInfo.obv = obvResult[obvResult.length - 1];
    }

    if (shouldCalculate('volumeprofile')) {
        const vpResult = JSIndicators.volumeProfile(
        highsNum,
        lowsNum,
        closesNum,
        volumesNum,
        settings?.volumeProfile?.rows || 24,
        );
        if (vpResult) {
            advancedInfo.volumeProfile = {
                poc: vpResult.poc,
                vaHigh: vpResult.vaHigh,
                vaLow: vpResult.vaLow,
                rows: vpResult.rows.map((r) => ({
                priceStart: r.priceStart,
                priceEnd: r.priceEnd,
                volume: r.volume,
                })),
            };
        }
    }

    // VWAP
    if (shouldCalculate('vwap')) {
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
        advancedInfo.vwap = vwapSeries[vwapSeries.length - 1];
    }

    // Parabolic SAR
    if (shouldCalculate('parabolicsar')) {
        const psarStart = (settings?.parabolicSar as any)?.start || 0.02;
        const psarMax = (settings?.parabolicSar as any)?.max || 0.2;
        const psarSeries = JSIndicators.psar(highsNum, lowsNum, psarStart, psarMax);
        advancedInfo.parabolicSar = psarSeries[psarSeries.length - 1];
    }

    // MFI
    if (shouldCalculate('mfi')) {
        const mfiLen = settings?.mfi?.length || 14;
        const mfiSeries = JSIndicators.mfi(
        highsNum,
        lowsNum,
        closesNum,
        volumesNum,
        mfiLen,
        getSource("hlc3"),
        );
        const mfiVal = mfiSeries[mfiSeries.length - 1];
        let mfiAction = "Neutral";
        if (mfiVal > 80)
        mfiAction = "Sell"; // Overbought
        else if (mfiVal < 20) mfiAction = "Buy"; // Oversold
        advancedInfo.mfi = { value: mfiVal, action: mfiAction };
    }

    // Choppiness
    if (shouldCalculate('choppiness')) {
        const chopLen = settings?.choppiness?.length || 14;
        const chopSeries = JSIndicators.choppiness(
        highsNum,
        lowsNum,
        closesNum,
        chopLen,
        );
        const chopVal = chopSeries[chopSeries.length - 1];
        // > 61.8 = Consolidation/Chop, < 38.2 = Trending
        advancedInfo.choppiness = {
        value: chopVal,
        state: chopVal > 61.8 ? "Range" : chopVal < 38.2 ? "Trend" : "Range",
        };
    }

    // Ichimoku
    if (shouldCalculate('ichimoku')) {
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
        const conv = ichi.conversion[idx] || 0;
        const base = ichi.base[idx] || 0;
        const spanA = ichi.spanA[idx] || 0;
        const spanB = ichi.spanB[idx] || 0;

        // Simple Ichi Signal: Price > Cloud && Conv > Base = Buy
        // Price < Cloud && Conv < Base = Sell
        let ichiAction = "Neutral";
        const cloudTop = spanA > spanB ? spanA : spanB;
        const cloudBottom = spanA < spanB ? spanA : spanB;

        if (currentPrice > cloudTop && conv > base) ichiAction = "Buy";
        else if (
        currentPrice > cloudTop &&
        conv > base &&
        currentPrice > base
        )
        ichiAction = "Strong Buy";
        else if (currentPrice < cloudBottom && conv < base) ichiAction = "Sell";

        advancedInfo.ichimoku = {
        conversion: conv,
        base: base,
        spanA: spanA,
        spanB: spanB,
        action: ichiAction,
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
    if (shouldCalculate('ema')) {
        const ema1 = settings?.ema?.ema1?.length || 20;
        const ema2 = settings?.ema?.ema2?.length || 50;
        const ema3 = settings?.ema?.ema3?.length || 200;
        const emaSource = getSource(settings?.ema?.source || "close");

        const emaPeriods = [ema1, ema2, ema3];
        for (const period of emaPeriods) {
        const emaResults = JSIndicators.ema(emaSource, period);
        const rawVal = emaResults[emaResults.length - 1];
        // Handle insufficient data (NaN) by defaulting to 0
        const emaVal = (typeof rawVal === 'number' && !isNaN(rawVal)) ? rawVal : 0;
        movingAverages.push({
            name: "EMA",
            params: `${period}`,
            value: emaVal,
            action: currentPrice > emaVal ? "Buy" : "Sell",
        });
        }
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Error calculating moving averages:", error);
    }
  }

  // --- Pivots ---
  const pivotType = settings?.pivots?.type || "classic";
  const prevIdx = closesNum.length - 2;
  let pivotData;

  // Note: getEmptyData returns dummy pivots.
  if (prevIdx >= 0 && shouldCalculate('pivots')) {
    pivotData = calculatePivotsFromValues(
      highsNum[prevIdx],
      lowsNum[prevIdx],
      closesNum[prevIdx],
      opensNum[prevIdx],
      pivotType
    );
  } else {
    // Return empty/placeholder if disabled or not enough data
    pivotData = { pivots: getEmptyData().pivots, basis: getEmptyData().pivotBasis! };
  }

  // --- Volatility ---
  let volatility = undefined;
  try {
    if (shouldCalculate('atr') || shouldCalculate('bb')) {
        const atrLen = settings?.atr?.length || 14;
        const bbLen = settings?.bb?.length || 20;
        const bbStdDev = settings?.bb?.stdDev || 2;

        let currentAtr = 0;
        if (shouldCalculate('atr')) {
            const atrResults = JSIndicators.atr(highsNum, lowsNum, closesNum, atrLen);
            currentAtr = atrResults[atrResults.length - 1];
        }

        let bbUpper = 0, bbLower = 0, bbMiddle = 0, percentP = 0;

        if (shouldCalculate('bb')) {
            const bbResults = JSIndicators.bb(closesNum, bbLen, bbStdDev);
            bbUpper = bbResults.upper[bbResults.upper.length - 1];
            bbLower = bbResults.lower[bbResults.lower.length - 1];
            bbMiddle = bbResults.middle[bbResults.middle.length - 1];

            const range = bbUpper - bbLower;
            percentP = range === 0
            ? 0.5
            : (currentPrice - bbLower) / range;
        }

        volatility = {
            atr: currentAtr,
            bb: {
                upper: bbUpper,
                middle: bbMiddle,
                lower: bbLower,
                percentP: percentP,
            },
        };
    }
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
        p: 0,
        r1: 0,
        r2: 0,
        r3: 0,
        s1: 0,
        s2: 0,
        s3: 0,
      },
    },
    pivotBasis: {
      high: 0,
      low: 0,
      close: 0,
      open: 0,
    },
    summary: { buy: 0, sell: 0, neutral: 0, action: "Neutral" },
  };
}
