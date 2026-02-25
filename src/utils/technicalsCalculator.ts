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
 * Shared Calculation Logic for Technical Indicators.
 * Used by running both in Main Thread (Fallback) and Worker (Performance).
 */

import { Decimal } from "decimal.js";
import {
  JSIndicators,
  calculateAwesomeOscillator,
  calculateMFI,
  calculateCCISeries,
  calculateADXSeries,
  calculatePivotsFromValues,
  getRsiAction,
  type Kline,
} from "./indicators";
import { DivergenceScanner, type DivergenceResult } from "./divergenceScanner";
import { ConfluenceAnalyzer } from "./confluenceAnalyzer";
import type { IndicatorSettings } from "../types/indicators";
import { BufferPool } from "./bufferPool";
import type {
  TechnicalsData,
  IndicatorResult,
  DivergenceItem,
} from "../services/technicalsTypes";

// Global buffer pool to reuse Float64Arrays and avoid GC pressure
const bufferPool = new BufferPool();

export function calculateAllIndicators(
  klines: Kline[],
  settings?: IndicatorSettings,
  allowedList?: string[] | Partial<Record<string, boolean>> // Support both legacy array and new map
): TechnicalsData {
  if (!klines || klines.length === 0) return getEmptyData();

  const len = klines.length;
  const pool = settings?.performanceMode === "speed" ? bufferPool : null;
  const cleanupBuffers: Float64Array[] = [];

  let highsNum: Float64Array;
  let lowsNum: Float64Array;
  let closesNum: Float64Array;
  let opensNum: Float64Array;
  let volumesNum: Float64Array;
  let timesNum: number[] = [];

  if (pool) {
      highsNum = pool.acquire(len);
      lowsNum = pool.acquire(len);
      closesNum = pool.acquire(len);
      opensNum = pool.acquire(len);
      volumesNum = pool.acquire(len);
      cleanupBuffers.push(highsNum, lowsNum, closesNum, opensNum, volumesNum);

      for (let i = 0; i < len; i++) {
          const k = klines[i];
          highsNum[i] = typeof k.high === 'number' ? k.high : k.high.toNumber();
          lowsNum[i] = typeof k.low === 'number' ? k.low : k.low.toNumber();
          closesNum[i] = typeof k.close === 'number' ? k.close : k.close.toNumber();
          opensNum[i] = typeof k.open === 'number' ? k.open : k.open.toNumber();
          volumesNum[i] = typeof k.volume === 'number' ? k.volume : k.volume.toNumber();
          timesNum.push(k.time);
      }
  } else {
      highsNum = new Float64Array(len);
      lowsNum = new Float64Array(len);
      closesNum = new Float64Array(len);
      opensNum = new Float64Array(len);
      volumesNum = new Float64Array(len);

      for (let i = 0; i < len; i++) {
          const k = klines[i];
          highsNum[i] = typeof k.high === 'number' ? k.high : k.high.toNumber();
          lowsNum[i] = typeof k.low === 'number' ? k.low : k.low.toNumber();
          closesNum[i] = typeof k.close === 'number' ? k.close : k.close.toNumber();
          opensNum[i] = typeof k.open === 'number' ? k.open : k.open.toNumber();
          volumesNum[i] = typeof k.volume === 'number' ? k.volume : k.volume.toNumber();
          timesNum.push(k.time);
      }
  }

  const result = calculateIndicatorsFromArrays(
      highsNum, lowsNum, closesNum, opensNum, volumesNum, timesNum, settings, allowedList
  );

  if (pool) {
      for (const buf of cleanupBuffers) {
          pool.release(buf);
      }
  }

  return result;
}

export function calculateIndicatorsFromArrays(
    highsNum: Float64Array,
    lowsNum: Float64Array,
    closesNum: Float64Array,
    opensNum: Float64Array,
    volumesNum: Float64Array,
    timesNum: number[] | Float64Array, // Support both
    settings?: IndicatorSettings,
    allowedList?: string[] | Partial<Record<string, boolean>>
): TechnicalsData {

  if (!closesNum || closesNum.length === 0) return getEmptyData();

  const currentPrice = closesNum[closesNum.length - 1];
  const oscillators: IndicatorResult[] = [];
  const divergences: DivergenceItem[] = [];
  const advancedInfo: any = { marketStructure: { highs: [], lows: [] } };

  const shouldCalculate = (key: keyof IndicatorSettings): boolean => {
    // If allowedList is provided (worker context usually), check it first
    if (allowedList) {
        if (Array.isArray(allowedList)) {
            // Legacy array support
            if (allowedList.length > 0 && !allowedList.includes(key)) return false;
        } else {
            // Map support
            if (allowedList[key] === false) return false;
            // If explicit true, continue. If undefined, check settings.
        }
    }

    if (!settings) return true;
    const config = settings[key];
    if (config && typeof config === 'object' && 'enabled' in config) {
        return (config as any).enabled;
    }
    return true;
  };

  // --- Oscillators ---
  try {
    // RSI
    if (shouldCalculate('rsi')) {
        const rsiLen = settings?.rsi?.length || 14;
        const rsiSource = getSourceArray(settings?.rsi?.source || "close", opensNum, highsNum, lowsNum, closesNum);
        const rsiRes = JSIndicators.rsi(rsiSource, rsiLen);
        const rsiVal = rsiRes[rsiRes.length - 1];

        oscillators.push({
            name: "RSI",
            value: rsiVal,
            action: getRsiAction(rsiVal, settings?.rsi?.overbought || 70, settings?.rsi?.oversold || 30),
        });

        // Divergence Scan
        const rsiDivs = DivergenceScanner.scan(
            highsNum, lowsNum, rsiRes, "RSI"
        );
        divergences.push(...rsiDivs);
    }

    // Stoch RSI
    if (shouldCalculate('stochRsi')) {
        const srsiLen = settings?.stochRsi?.length || 14;
        const srsiRsiLen = settings?.stochRsi?.rsiLength || 14;
        const srsiK = settings?.stochRsi?.kPeriod || 3;
        const srsiD = settings?.stochRsi?.dPeriod || 3;

        // Settings Map: length -> Stoch Length, kPeriod -> K Smoothing
        // Correct order: data, period (RSI), kPeriod (Stoch Length), dPeriod (D Smooth), smoothK (K Smooth)
        const stochRsiRes = JSIndicators.stochRsi(closesNum, srsiRsiLen, srsiLen, srsiD, srsiK) as unknown as { k: Float64Array, d: Float64Array };
        const kVal = stochRsiRes.k[stochRsiRes.k.length - 1];
        const dVal = stochRsiRes.d[stochRsiRes.d.length - 1];

        oscillators.push({
            name: "Stoch.RSI",
            value: kVal,
            action: kVal > 80 ? "Sell" : kVal < 20 ? "Buy" : "Neutral",
            extra: `D: ${dVal.toFixed(2)}`
        });
    }

    // Stochastic
    if (shouldCalculate('stochastic')) {
        const stochK = settings?.stochastic?.kPeriod || 14;
        const stochD = settings?.stochastic?.dPeriod || 3;
        const stochSmooth = settings?.stochastic?.kSmoothing || 3;

        // Calculate Raw K
        const kRaw = JSIndicators.stoch(highsNum, lowsNum, closesNum, stochK) as unknown as Float64Array;

        // Smooth K
        let kLine = kRaw;
        if (stochSmooth > 1) {
            kLine = JSIndicators.sma(kRaw, stochSmooth);
        }

        // Calculate D (SMA of K)
        // D-Line is optional in some contexts but usually standard Stoch has K and D.

        const kVal = kLine[kLine.length - 1];

        oscillators.push({
            name: "Stoch.K",
            value: kVal,
            action: kVal > 80 ? "Sell" : kVal < 20 ? "Buy" : "Neutral",
        });
    }

    // Williams %R
    if (shouldCalculate('williamsR')) {
        const wLen = settings?.williamsR?.length || 14;
        const wRes = JSIndicators.williamsR(highsNum, lowsNum, closesNum, wLen);
        const wVal = wRes[wRes.length - 1];

        oscillators.push({
            name: "Williams %R",
            value: wVal,
            action: wVal > -20 ? "Sell" : wVal < -80 ? "Buy" : "Neutral",
        });
    }

    // CCI
    if (shouldCalculate('cci')) {
        const cciLen = settings?.cci?.length || 20;
        const cciSourceType = settings?.cci?.source || "close";

        let cciVal: number;

        if (cciSourceType === "hlc3") {
            // Optimized Standard CCI (TP based)
            const cciRes = calculateCCISeries(highsNum, lowsNum, closesNum, cciLen);
            cciVal = cciRes[cciRes.length - 1];
        } else {
            // Generic CCI (Source based)
            const cciSource = getSourceArray(cciSourceType, opensNum, highsNum, lowsNum, closesNum);
            const cciRes = JSIndicators.cci(cciSource, cciLen);
            cciVal = cciRes[cciRes.length - 1];
        }

        oscillators.push({
            name: "CCI",
            value: cciVal,
            action: cciVal > 100 ? "Sell" : cciVal < -100 ? "Buy" : "Neutral",
        });
    }

    // Momentum (MOM)
    if (shouldCalculate('momentum')) {
        const momLen = settings?.momentum?.length || 10;
        const momSource = getSourceArray(settings?.momentum?.source || "close", opensNum, highsNum, lowsNum, closesNum);
        const momRes = JSIndicators.mom(momSource, momLen);
        const momVal = momRes[momRes.length - 1];

        oscillators.push({
            name: "Momentum",
            value: momVal,
            action: momVal > 0 ? "Buy" : "Sell",
        });
    }

    // Awesome Oscillator (AO)
    if (shouldCalculate('ao')) {
        const fast = settings?.ao?.fastLength || 5;
        const slow = settings?.ao?.slowLength || 34;
        const aoRes = calculateAwesomeOscillator(highsNum, lowsNum, fast, slow);
        const aoVal = aoRes[aoRes.length - 1];

        oscillators.push({
            name: "AO",
            value: aoVal,
            action: aoVal > 0 ? "Buy" : "Sell",
        });
    }

  } catch (e) {
    if (import.meta.env.DEV) console.error("Oscillators calculation error:", e);
  }

  // --- Moving Averages ---
  const movingAverages: IndicatorResult[] = [];
  try {
      if (shouldCalculate('ema')) {
          const emaConfig = settings?.ema;
          const emaSource = getSourceArray(emaConfig?.source || "close", opensNum, highsNum, lowsNum, closesNum);

          if (emaConfig?.ema1?.length) calculateMA("EMA", emaConfig.ema1.length, emaSource, movingAverages);
          if (emaConfig?.ema2?.length) calculateMA("EMA", emaConfig.ema2.length, emaSource, movingAverages);
          if (emaConfig?.ema3?.length) calculateMA("EMA", emaConfig.ema3.length, emaSource, movingAverages);
      }

      if (shouldCalculate('sma')) {
          const smaConfig = settings?.sma;
          const smaSource = closesNum;
          if (smaConfig?.sma1?.length) calculateMA("SMA", smaConfig.sma1.length, smaSource, movingAverages);
          if (smaConfig?.sma2?.length) calculateMA("SMA", smaConfig.sma2.length, smaSource, movingAverages);
          if (smaConfig?.sma3?.length) calculateMA("SMA", smaConfig.sma3.length, smaSource, movingAverages);
      }

      if (shouldCalculate('wma')) {
          const len = settings?.wma?.length || 14;
          calculateMA("WMA", len, closesNum, movingAverages);
      }

      if (shouldCalculate('vwma')) {
          const len = settings?.vwma?.length || 20;
          const vwmaRes = JSIndicators.vwma(closesNum, volumesNum, len);
          const val = vwmaRes[vwmaRes.length - 1];
          if (!isNaN(val)) {
             movingAverages.push({
                 name: "VWMA",
                 params: `${len}`,
                 value: val,
                 action: currentPrice > val ? "Buy" : "Sell"
             });
          }
      }

      if (shouldCalculate('hma')) {
          const len = settings?.hma?.length || 9;
          calculateMA("HMA", len, closesNum, movingAverages);
      }

  } catch (e) {
      if (import.meta.env.DEV) console.error("MA calculation error:", e);
  }

  // --- Advanced / Trend ---
  try {
      if (shouldCalculate('macd')) {
          const fast = settings?.macd?.fastLength || 12;
          const slow = settings?.macd?.slowLength || 26;
          const sig = settings?.macd?.signalLength || 9;
          const src = getSourceArray(settings?.macd?.source || "close", opensNum, highsNum, lowsNum, closesNum);

          const macdRes = JSIndicators.macd(src, fast, slow, sig) as unknown as { macd: Float64Array, signal: Float64Array, histogram?: Float64Array };
          const idx = macdRes.macd.length - 1;

          const macdVal = macdRes.macd[idx];
          const sigVal = macdRes.signal[idx];
          const histVal = macdRes.histogram ? macdRes.histogram[idx] : (macdVal - sigVal);
          const action = histVal > 0 ? "Buy" : "Sell";

          oscillators.push({
              name: "MACD",
              value: macdVal,
              action: action,
              extra: `Sig: ${sigVal.toFixed(2)}`
          });
      }

      if (shouldCalculate('adx')) {
          const per = settings?.adx?.diLength || 14;
          const smooth = settings?.adx?.adxSmoothing || 14;
          const res = calculateADXSeries(highsNum, lowsNum, closesNum, per, smooth);

          const idx = res.adx.length - 1;
          const val = res.adx[idx];
          const pdi = res.pdi[idx];
          const mdi = res.mdi[idx];

          const trend = val > 25 ? "Strong Trend" : "Weak Trend";
          const dir = pdi > mdi ? "Bullish" : "Bearish";

          advancedInfo.adx = { value: val, pdi, mdi, trend, dir };
      }

      if (shouldCalculate('superTrend')) {
          const per = settings?.superTrend?.period || 10;
          const fac = settings?.superTrend?.factor || 3;
          const res = JSIndicators.superTrend(highsNum, lowsNum, closesNum, per, fac);
          const idx = res.value.length - 1;

          advancedInfo.superTrend = {
              value: res.value[idx],
              trend: res.trend[idx] === 1 ? "bull" : "bear"
          };
      }

      if (shouldCalculate('ichimoku')) {
          const conv = settings?.ichimoku?.conversionPeriod || 9;
          const base = settings?.ichimoku?.basePeriod || 26;
          const spanB = settings?.ichimoku?.spanBPeriod || 52;
          const disp = settings?.ichimoku?.displacement || 26;

          const res = JSIndicators.ichimoku(highsNum, lowsNum, conv, base, spanB, disp);
          const idx = res.conversion.length - 1;

          const cVal = res.conversion[idx];
          const bVal = res.base[idx];
          const saVal = res.spanA[idx];
          const sbVal = res.spanB[idx];

          let action = "Neutral";
          const cloudTop = Math.max(saVal, sbVal);
          const cloudBottom = Math.min(saVal, sbVal);

          if (currentPrice > cloudTop && cVal > bVal) action = "Buy";
          else if (currentPrice < cloudBottom && cVal < bVal) action = "Sell";

          advancedInfo.ichimoku = {
              conversion: cVal,
              base: bVal,
              spanA: saVal,
              spanB: sbVal,
              action: action
          };
      }

      if (shouldCalculate('atrTrailingStop')) {
          const per = settings?.atrTrailingStop?.period || 14;
          const mult = settings?.atrTrailingStop?.multiplier || 3.5;
          const res = JSIndicators.atrTrailingStop(highsNum, lowsNum, closesNum, per, mult);
          const idx = res.buyStop.length - 1;

          advancedInfo.atrTrailingStop = {
              buy: res.buyStop[idx],
              sell: res.sellStop[idx]
          };
      }

      if (shouldCalculate('parabolicSar')) {
          const start = settings?.parabolicSar?.start || 0.02;
          const increment = settings?.parabolicSar?.increment || 0.02;
          const max = settings?.parabolicSar?.max || 0.2;
          const res = JSIndicators.psar(highsNum, lowsNum, start, increment, max);
          advancedInfo.parabolicSar = res[res.length - 1];
      }

  } catch (e) {
      if (import.meta.env.DEV) console.error("Trend/Advanced calculation error:", e);
  }

  // --- Volatility ---
  let volatility: any = undefined;
  try {
      if (shouldCalculate('atr') || shouldCalculate('bollingerBands') || shouldCalculate('choppiness')) {
          volatility = {};

          if (shouldCalculate('atr')) {
              const len = settings?.atr?.length || 14;
              const res = JSIndicators.atr(highsNum, lowsNum, closesNum, len);
              volatility.atr = res[res.length - 1];
          }

          if (shouldCalculate('bollingerBands')) {
             const len = settings?.bollingerBands?.length || 20;
             const std = settings?.bollingerBands?.stdDev || 2;
             const res = JSIndicators.bb(closesNum, len, std);
             const idx = res.middle.length - 1;
             const upper = res.upper[idx];
             const lower = res.lower[idx];
             const range = upper - lower;
             const percentP = range === 0 ? 0.5 : (currentPrice - lower) / range;

             volatility.bb = {
                 upper,
                 middle: res.middle[idx],
                 lower,
                 percentP
             };
          }

          if (shouldCalculate('choppiness')) {
              const len = settings?.choppiness?.length || 14;
              const res = JSIndicators.choppiness(highsNum, lowsNum, closesNum, len);
              const val = res[res.length - 1];
              advancedInfo.choppiness = {
                  value: val,
                  state: val > 61.8 ? "Range" : val < 38.2 ? "Trend" : "Neutral"
              };
          }
      }
  } catch (e) {
      if (import.meta.env.DEV) console.error("Volatility calculation error:", e);
  }

  // --- Volume ---
  try {
      if (shouldCalculate('mfi')) {
          const len = settings?.mfi?.length || 14;
          const val = calculateMFI(highsNum, lowsNum, closesNum, volumesNum, len);
          let action = "Neutral";
          if (val > 80) action = "Sell";
          else if (val < 20) action = "Buy";
          advancedInfo.mfi = { value: val, action };
      }

      if (shouldCalculate('obv')) {
          const res = JSIndicators.obv(closesNum, volumesNum);
          advancedInfo.obv = res[res.length - 1];
      }

      if (shouldCalculate('vwap')) {
          const config = settings?.vwap;
          const res = JSIndicators.vwap(highsNum, lowsNum, closesNum, volumesNum, Array.isArray(timesNum) ? timesNum : Array.from(timesNum), {
             mode: config?.anchor || "session",
             anchorPoint: config?.anchorPoint
          });
          advancedInfo.vwap = res[res.length - 1];
      }

      if (shouldCalculate('volumeProfile')) {
          const rows = settings?.volumeProfile?.rows || 24;
          const res = JSIndicators.volumeProfile(highsNum, lowsNum, closesNum, volumesNum, rows);
          if (res) {
              advancedInfo.volumeProfile = {
                  poc: res.poc,
                  vaHigh: res.vaHigh,
                  vaLow: res.vaLow,
                  rows: res.rows
              };
          }
      }

      if (shouldCalculate('volumeMa')) {
          const len = settings?.volumeMa?.length || 20;
          const type = settings?.volumeMa?.maType || "sma";
          let res: Float64Array;

          if (type === "ema") res = JSIndicators.ema(volumesNum, len);
          else if (type === "wma") res = JSIndicators.wma(volumesNum, len);
          else res = JSIndicators.sma(volumesNum, len);

          advancedInfo.volumeMa = res[res.length - 1];
          // Stub Market Structure
      }

  } catch (e) {
      if (import.meta.env.DEV) console.error("Volume calculation error:", e);
  }

  const pivotType = settings?.pivots?.type || "classic";
  let pivotData;
  const prevIdx = closesNum.length - 2;

  if (prevIdx >= 0 && shouldCalculate('pivots')) {
    pivotData = calculatePivotsFromValues(
      highsNum[prevIdx],
      lowsNum[prevIdx],
      closesNum[prevIdx],
      opensNum[prevIdx],
      pivotType
    );
  } else {
    pivotData = { pivots: getEmptyData().pivots, basis: getEmptyData().pivotBasis! };
  }

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

// Helper to calculate generic MA
function calculateMA(type: string, period: number, source: Float64Array, target: IndicatorResult[]) {
    let res: Float64Array;
    switch(type) {
        case "EMA": res = JSIndicators.ema(source, period); break;
        case "SMA": res = JSIndicators.sma(source, period); break;
        case "WMA": res = JSIndicators.wma(source, period); break;
        case "HMA": res = JSIndicators.hma(source, period); break;
        default: return;
    }
    const val = res[res.length - 1];
    if (!isNaN(val)) {
        target.push({
            name: type,
            params: `${period}`,
            value: val,
            action: source[source.length - 1] > val ? "Buy" : "Sell"
        });
    }
}

// Helper to get source array
function getSourceArray(
    source: string,
    open: Float64Array,
    high: Float64Array,
    low: Float64Array,
    close: Float64Array
): Float64Array {
    switch (source) {
        case "open": return open;
        case "high": return high;
        case "low": return low;
        case "hl2":
            const hl2 = new Float64Array(close.length);
            for(let i=0; i<close.length; i++) hl2[i] = (high[i] + low[i]) / 2;
            return hl2;
        case "hlc3":
            const hlc3 = new Float64Array(close.length);
            for(let i=0; i<close.length; i++) hlc3[i] = (high[i] + low[i] + close[i]) / 3;
            return hlc3;
        case "close":
        default: return close;
    }
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
