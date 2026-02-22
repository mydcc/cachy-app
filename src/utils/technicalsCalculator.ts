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
  calculateMFI,
  calculateCCISeries,
  calculatePivots,
  getRsiAction,
  calculatePivotsFromValues,
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
  enabledIndicators?: Partial<Record<string, boolean>>,
): TechnicalsData {
  if (klines.length < 2) return getEmptyData();

  const len = klines.length;

  // Acquire buffers from the pool
  const highsNum = bufferPool.acquire(len);
  const lowsNum = bufferPool.acquire(len);
  const closesNum = bufferPool.acquire(len);
  const opensNum = bufferPool.acquire(len);
  const volumesNum = bufferPool.acquire(len);
  const timesNum = bufferPool.acquire(len);

  try {
    // Optimization: Single loop extraction into pre-allocated Float64Arrays
    for (let i = 0; i < len; i++) {
      const k = klines[i];
      highsNum[i] = parseFloat(k.high.toString());
      lowsNum[i] = parseFloat(k.low.toString());
      closesNum[i] = parseFloat(k.close.toString());
      opensNum[i] = parseFloat(k.open.toString());
      volumesNum[i] = parseFloat(k.volume.toString());
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
      enabledIndicators,
      bufferPool
    );
  } finally {
    // Release buffers back to the pool
    bufferPool.release(highsNum);
    bufferPool.release(lowsNum);
    bufferPool.release(closesNum);
    bufferPool.release(opensNum);
    bufferPool.release(volumesNum);
    bufferPool.release(timesNum);
  }
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
  pool?: BufferPool,
): TechnicalsData {
  const len = closesNum.length;
  const currentPrice = closesNum[len - 1];

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
  // Track buffers acquired from pool for cleanup
  const cleanupBuffers: Float64Array[] = [];

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
          if (pool) {
            const buf = pool.acquire(len);
            for (let i = 0; i < len; i++) buf[i] = (highsNum[i] + lowsNum[i]) / 2;
            sourceCache["hl2"] = buf;
            cleanupBuffers.push(buf);
          } else {
            sourceCache["hl2"] = (highsNum as number[]).map(
              (h, i) => (h + lowsNum[i]) / 2,
            );
          }
        }
        return sourceCache["hl2"];
      case "hlc3":
        if (!sourceCache["hlc3"]) {
          if (pool) {
            const buf = pool.acquire(len);
            for (let i = 0; i < len; i++) buf[i] = (highsNum[i] + lowsNum[i] + closesNum[i]) / 3;
            sourceCache["hlc3"] = buf;
            cleanupBuffers.push(buf);
          } else {
            sourceCache["hlc3"] = (highsNum as number[]).map(
              (h, i) => (h + lowsNum[i] + closesNum[i]) / 3,
            );
          }
        }
        return sourceCache["hlc3"];
      case "ohlc4":
        if (!sourceCache["ohlc4"]) {
          if (pool) {
            const buf = pool.acquire(len);
            for (let i = 0; i < len; i++) buf[i] = (opensNum[i] + highsNum[i] + lowsNum[i] + closesNum[i]) / 4;
            sourceCache["ohlc4"] = buf;
            cleanupBuffers.push(buf);
          } else {
            sourceCache["ohlc4"] = (opensNum as number[]).map(
              (o, i) => (o + highsNum[i] + lowsNum[i] + closesNum[i]) / 4,
            );
          }
        }
        return sourceCache["ohlc4"];
      case "hlcc4":
        if (!sourceCache["hlcc4"]) {
          if (pool) {
            const buf = pool.acquire(len);
            for (let i = 0; i < len; i++) buf[i] = (highsNum[i] + lowsNum[i] + closesNum[i] + closesNum[i]) / 4;
            sourceCache["hlcc4"] = buf;
            cleanupBuffers.push(buf);
          } else {
            sourceCache["hlcc4"] = (highsNum as number[]).map(
              (h, i) => (h + lowsNum[i] + closesNum[i] + closesNum[i]) / 4,
            );
          }
        }
        return sourceCache["hlcc4"];
      default:
        return closesNum;
    }
  };

  // --- Oscillators ---
  const oscillators: IndicatorResult[] = [];
  const divergences: DivergenceItem[] = [];

  // Temporary storage for signals to valid divergences against
  const indSeries: Record<string, number[] | Float64Array> = {};

  try {
    // 1. RSI
    if (shouldCalculate('rsi')) {
      const rsiLen = settings?.rsi?.length || 14;
      const rsiSource = getSource(settings?.rsi?.source || "close");

      let rsiResults: Float64Array | undefined;
      if (pool) {
          rsiResults = pool.acquire(len);
          cleanupBuffers.push(rsiResults);
      }

      rsiResults = JSIndicators.rsi(rsiSource, rsiLen, rsiResults);
      indSeries["RSI"] = rsiResults;
      const rsiVal = rsiResults[rsiResults.length - 1];

      let rsiSignalVal: number | undefined;
      let rsiUpperBand: number | undefined;
      let rsiLowerBand: number | undefined;

      const smoothingType = settings?.rsi?.smoothingType || "sma";
      const smoothingLen = settings?.rsi?.smoothingLength || 14;

      if (smoothingType !== "none" && smoothingLen > 0) {
        let smoothedSeries: Float64Array | undefined;
        if (pool) {
          smoothedSeries = pool.acquire(len);
          cleanupBuffers.push(smoothedSeries);
        }

        if (smoothingType === "sma" || smoothingType === "sma_bb") {
          if (smoothingType === "sma_bb") {
            const bbStdDev = settings?.rsi?.bbStdDev || 2;
            let upperBuf: Float64Array | undefined;
            let lowerBuf: Float64Array | undefined;
            if (pool) {
                upperBuf = pool.acquire(len);
                lowerBuf = pool.acquire(len);
                cleanupBuffers.push(upperBuf, lowerBuf);
            }
            const bb = JSIndicators.bb(rsiResults, smoothingLen, bbStdDev, smoothedSeries, upperBuf, lowerBuf);
            rsiSignalVal = bb.middle[bb.middle.length - 1];
            rsiUpperBand = bb.upper[bb.upper.length - 1];
            rsiLowerBand = bb.lower[bb.lower.length - 1];
          } else {
            smoothedSeries = JSIndicators.sma(rsiResults, smoothingLen, smoothedSeries);
            rsiSignalVal = smoothedSeries[smoothedSeries.length - 1];
          }
        } else if (smoothingType === "ema") {
          smoothedSeries = JSIndicators.ema(rsiResults, smoothingLen, smoothedSeries);
          rsiSignalVal = smoothedSeries[smoothedSeries.length - 1];
        } else if (smoothingType === "smma") {
          smoothedSeries = JSIndicators.smma(rsiResults, smoothingLen, smoothedSeries);
          rsiSignalVal = smoothedSeries[smoothedSeries.length - 1];
        } else if (smoothingType === "wma") {
          smoothedSeries = JSIndicators.wma(rsiResults, smoothingLen, smoothedSeries);
          rsiSignalVal = smoothedSeries[smoothedSeries.length - 1];
        } else if (smoothingType === "vwma") {
          smoothedSeries = JSIndicators.vwma(rsiResults, volumesNum, smoothingLen, smoothedSeries);
          rsiSignalVal = smoothedSeries[smoothedSeries.length - 1];
        }
      }

      oscillators.push({
        name: "RSI",
        value: rsiVal,
        signal: rsiSignalVal,
        upperBand: rsiUpperBand,
        lowerBand: rsiLowerBand,
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

      let kLine: Float64Array | undefined;
      if (pool) {
          kLine = pool.acquire(len);
          cleanupBuffers.push(kLine);
      }

      kLine = JSIndicators.stoch(highsNum, lowsNum, closesNum, stochK, kLine, pool);

      if (stochKSmooth > 1) {
          // If smoothing, we might need another buffer or overwrite?
          // JSIndicators.sma returns new/out.
          // We can overwrite kLine if we don't need raw anymore.
          // But sma needs input and output.
          // If we pass kLine as input and output, SMA implementation needs to be safe for in-place.
          // SMA is safe for in-place?
          // sum = sum - data[i-period] + data[i]. If data is result, data[i] is overwritten before read?
          // No, result[i] is written. data[i] is read. If result === data, then data[i] is effectively new value.
          // Next iteration reads data[i].
          // So SMA is NOT safe for in-place if period > 1.

          let smoothed: Float64Array | undefined;
          if (pool) {
              smoothed = pool.acquire(len);
              cleanupBuffers.push(smoothed);
          }
          kLine = JSIndicators.sma(kLine!, stochKSmooth, smoothed);
          // Note: kLine now points to smoothed. The original kLine buffer is still in cleanupBuffers.
      }

      let dLine: Float64Array | undefined;
      if (pool) {
          dLine = pool.acquire(len);
          cleanupBuffers.push(dLine);
      }
      dLine = JSIndicators.sma(kLine!, stochD, dLine);

      indSeries["StochK"] = kLine!;

      const stochKVal = kLine![kLine!.length - 1];
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
      const cciSourceType = settings?.cci?.source || "hlc3";

      let cciResults: Float64Array | undefined;
      if (pool) {
          cciResults = pool.acquire(len);
          cleanupBuffers.push(cciResults);
      }

      if (cciSourceType === "hlc3") {
          cciResults = calculateCCISeries(highsNum, lowsNum, closesNum, cciLen, cciResults);
      } else {
          const cciSource = getSource(cciSourceType);
          cciResults = JSIndicators.cci(cciSource, cciLen, cciResults);
      }

      const cciSmoothType = settings?.cci?.smoothingType || "none";
      if (cciSmoothType !== "none" && cciSmoothLen > 1) {
          let smoothed: Float64Array | undefined;
          let upper: Float64Array | undefined;
          let lower: Float64Array | undefined;
          if (pool) {
              smoothed = pool.acquire(len);
              cleanupBuffers.push(smoothed);
          }
          if (cciSmoothType === "sma_bb") {
              const bbStdDev = 2;
              if (pool) {
                  upper = pool.acquire(len);
                  lower = pool.acquire(len);
                  cleanupBuffers.push(upper!, lower!);
              }
              const bb = JSIndicators.bb(cciResults, cciSmoothLen, bbStdDev, smoothed, upper, lower);
              cciResults = bb.middle as Float64Array;
          } else if (cciSmoothType === "sma") {
              cciResults = JSIndicators.sma(cciResults, cciSmoothLen, smoothed);
          } else if (cciSmoothType === "ema") {
              cciResults = JSIndicators.ema(cciResults, cciSmoothLen, smoothed);
          } else if (cciSmoothType === "smma") {
              cciResults = JSIndicators.smma(cciResults, cciSmoothLen, smoothed);
          } else if (cciSmoothType === "wma") {
              cciResults = JSIndicators.wma(cciResults, cciSmoothLen, smoothed);
          } else if (cciSmoothType === "vwma") {
              cciResults = JSIndicators.vwma(cciResults, volumesNum, cciSmoothLen, smoothed);
          }
      }

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

      let adxResults: Float64Array | undefined;
      if (pool) {
          adxResults = pool.acquire(len);
          cleanupBuffers.push(adxResults);
      }

      adxResults = JSIndicators.adx(highsNum, lowsNum, closesNum, adxLen, adxResults, pool, adxDiLen);
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

      let aoSeries: Float64Array | undefined;
      if (pool) {
          aoSeries = pool.acquire(len);
          cleanupBuffers.push(aoSeries);
      }

      aoSeries = calculateAwesomeOscillator(
        highsNum,
        lowsNum,
        aoFast,
        aoSlow,
        aoSeries,
      );

      const aoVal = aoSeries[aoSeries.length - 1];
      indSeries["AO"] = aoSeries;

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
      // PineScript allows EMA or SMA for the fast/slow oscillator and for the signal line
      const macdOscType = settings?.macd?.oscillatorMaType || "ema";
      const macdSigType = settings?.macd?.signalMaType || "ema";

      let outMacd: Float64Array | undefined;
      let outSignal: Float64Array | undefined;
      let emaFastBuf: Float64Array | undefined;
      let emaSlowBuf: Float64Array | undefined;
      if (pool) {
          outMacd = pool.acquire(len);
          outSignal = pool.acquire(len);
          emaFastBuf = pool.acquire(len);
          emaSlowBuf = pool.acquire(len);
          cleanupBuffers.push(outMacd, outSignal, emaFastBuf, emaSlowBuf);
      } else {
          emaFastBuf = new Float64Array(len);
          emaSlowBuf = new Float64Array(len);
      }

      // Calculate fast and slow MAs (EMA or SMA)
      const maFn = (src: typeof macdSource, period: number, out?: Float64Array) =>
          macdOscType === "sma" ? JSIndicators.sma(src, period, out) : JSIndicators.ema(src, period, out);

      maFn(macdSource, macdFast, emaFastBuf);
      maFn(macdSource, macdSlow, emaSlowBuf);

      const macdLine = (outMacd && outMacd.length === len) ? outMacd : new Float64Array(len);
      macdLine.fill(NaN);
      for (let i = 0; i < len; i++) {
          macdLine[i] = emaFastBuf[i] - emaSlowBuf[i];
      }

      if (pool) {
          pool.release(emaFastBuf!);
          pool.release(emaSlowBuf!);
      }

      // Signal line (EMA or SMA of MACD)
      const signalLine = (outSignal && outSignal.length === len) ? outSignal : new Float64Array(len);
      if (macdSigType === "sma") {
          JSIndicators.sma(macdLine, macdSig, signalLine);
      } else {
          JSIndicators.ema(macdLine, macdSig, signalLine);
      }

      const macdRes = { macd: macdLine, signal: signalLine };
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

    // 7. StochRSI
    if (shouldCalculate('stochrsi')) {
        const stochRsiSmoothK = settings?.stochRsi?.kPeriod || 3;
        const stochRsiD = settings?.stochRsi?.dPeriod || 3;
        const stochRsiLen = settings?.stochRsi?.length || 14;
        const stochRsiRsiLen = settings?.stochRsi?.rsiLength || 14;
        const stochRsiSource = getSource(settings?.stochRsi?.source || "close");

        let outK: Float64Array | undefined;
        let outD: Float64Array | undefined;
        if (pool) {
            outK = pool.acquire(len);
            outD = pool.acquire(len);
            cleanupBuffers.push(outK);
            cleanupBuffers.push(outD);
        }

        const srRes = JSIndicators.stochRsi(
          stochRsiSource,
          stochRsiRsiLen,
          stochRsiLen,     // Stoch Length (e.g. 14)
          stochRsiD,       // D Smoothing (e.g. 3)
          stochRsiSmoothK, // K Smoothing (e.g. 3)
          outK,
          outD,
          pool
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
        params: `${stochRsiRsiLen}, ${stochRsiLen}, ${stochRsiSmoothK}, ${stochRsiD}`,
        action: srAction,
        });
    }

    // 8. Williams %R (NEW)
    if (shouldCalculate('williamsr')) {
        const wRLen = settings?.williamsR?.length || 14;
        const wrSource = getSource(settings?.williamsR?.source || "close");
        const wR = JSIndicators.williamsR(highsNum, lowsNum, wrSource, wRLen);
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
    if (shouldCalculate('divergences')) {
      // Scanners: RSI, MACD, CCI, StochK
      // We only scan for what we calculated
      const scanList = [
        { name: "RSI", data: indSeries["RSI"] },
        { name: "MACD", data: indSeries["MACD"] },
        { name: "CCI", data: indSeries["CCI"] },
        { name: "Stoch", data: indSeries["StochK"] },
        { name: "AO", data: indSeries["AO"] },
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
    }
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
    if (shouldCalculate('parabolicSar')) {
        const psarStart = (settings?.parabolicSar as any)?.start || 0.02;
        const psarMax = (settings?.parabolicSar as any)?.max || 0.2;
        const psarSeries = JSIndicators.psar(highsNum, lowsNum, psarStart, psarMax);
        advancedInfo.parabolicSar = psarSeries[psarSeries.length - 1];
    }

    // MFI
    if (shouldCalculate('mfi')) {
        const mfiLen = settings?.mfi?.length || 14;

        // MFI is volume-dependent. The "forming" candle (current live candle) has
        // incomplete or zero volume that corrupts the calculation.
        // TradingView computes MFI only on completed bars.
        // Detect the forming candle: either volume is 0 (phantom) or we can
        // infer the timeframe interval from timestamps to identify it.
        let excludeLastCandle = false;
        const lastVol = volumesNum[volumesNum.length - 1];

        if (lastVol === 0) {
            // Phantom candle with no volume at all
            excludeLastCandle = true;
        } else if (len >= 3) {
            // Detect forming candle by checking if its timestamp is ahead of the
            // regular cadence. If interval between candles is consistent and the last
            // candle was injected with `injectRealtimePrice`, its volume is incomplete.
            const interval = timesNum[len - 2] - timesNum[len - 3];
            if (interval > 0) {
                const now = Date.now();
                const currentPeriodStart = Math.floor(now / interval) * interval;
                if (timesNum[len - 1] === currentPeriodStart) {
                    excludeLastCandle = true;
                }
            }
        }

        const mfiHighs = excludeLastCandle ? highsNum.slice(0, -1) : highsNum;
        const mfiLows  = excludeLastCandle ? lowsNum.slice(0, -1)  : lowsNum;
        const mfiClose = excludeLastCandle ? closesNum.slice(0, -1) : closesNum;
        const mfiVols  = excludeLastCandle ? volumesNum.slice(0, -1) : volumesNum;

        const mfiSeries = JSIndicators.mfi(mfiHighs, mfiLows, mfiClose, mfiVols, mfiLen);

        // Find last non-NaN value
        let mfiVal = NaN;
        for (let i = mfiSeries.length - 1; i >= 0; i--) {
            if (!isNaN(mfiSeries[i])) { mfiVal = mfiSeries[i]; break; }
        }
        if (!isNaN(mfiVal)) {
            let mfiAction = "Neutral";
            if (mfiVal > 80) mfiAction = "Sell"; // Overbought
            else if (mfiVal < 20) mfiAction = "Buy"; // Oversold
            advancedInfo.mfi = { value: mfiVal, action: mfiAction };
        }
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

    // Market Structure (HH/HL/LH/LL)
    if (shouldCalculate('marketStructure')) {
        const LOOKBACK = 5;
        const swingHighs: {idx: number, val: number}[] = [];
        const swingLows: {idx: number, val: number}[] = [];

        for (let i = len - LOOKBACK - 1; i >= LOOKBACK && (swingHighs.length < 2 || swingLows.length < 2); i--) {
            let isSwingHigh = true;
            let isSwingLow = true;
            for (let j = 1; j <= LOOKBACK; j++) {
                if (highsNum[i - j] >= highsNum[i] || highsNum[i + j] >= highsNum[i]) isSwingHigh = false;
                if (lowsNum[i - j] <= lowsNum[i] || lowsNum[i + j] <= lowsNum[i]) isSwingLow = false;
            }
            if (isSwingHigh && swingHighs.length < 2) swingHighs.push({idx: i, val: highsNum[i]});
            if (isSwingLow && swingLows.length < 2) swingLows.push({idx: i, val: lowsNum[i]});
        }

        /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
        let pattern: "HH" | "HL" | "LH" | "LL" | "None" = "None";
        let msTrend: "Bullish" | "Bearish" | "Neutral" = "Neutral";
        let msPrice: number = typeof currentPrice === "number" ? currentPrice : 0;
        
        // Ensure currentPrice is valid, fall back to last close otherwise
        if (msPrice === 0 && closesNum.length > 0) {
           msPrice = closesNum[closesNum.length - 1];
        }

        if (swingHighs.length === 2 && swingLows.length === 2) {
            const lastHigh = swingHighs[0];
            const prevHigh = swingHighs[1];
            const lastLow = swingLows[0];
            const prevLow = swingLows[1];

            if (lastHigh.idx > lastLow.idx) {
               pattern = lastHigh.val > prevHigh.val ? "HH" : "LH";
               msPrice = lastHigh.val;
            } else {
               pattern = lastLow.val > prevLow.val ? "HL" : "LL";
               msPrice = lastLow.val;
            }

            if (lastHigh.val > prevHigh.val && lastLow.val > prevLow.val) msTrend = "Bullish";
            else if (lastHigh.val < prevHigh.val && lastLow.val < prevLow.val) msTrend = "Bearish";
        }

        advancedInfo.marketStructure = {
            trend: msTrend,
            pattern: pattern,
            price: msPrice
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
        const emaSource = getSource(settings?.ema?.source || "close");
        const emaConfigs = [
            settings?.ema?.ema1 || { length: 21, offset: 0, smoothingType: "sma" as const, smoothingLength: 14, bbStdDev: 2 },
            settings?.ema?.ema2 || { length: 50, offset: 0, smoothingType: "sma" as const, smoothingLength: 14, bbStdDev: 2 },
            settings?.ema?.ema3 || { length: 200, offset: 0, smoothingType: "sma" as const, smoothingLength: 14, bbStdDev: 2 }
        ];

        for (const config of emaConfigs) {
            const period = config.length;
            const emaResults = JSIndicators.ema(emaSource, period);
            const rawVal = emaResults[emaResults.length - 1];
            
            // Handle insufficient data (NaN) by skipping
            if (typeof rawVal === 'number' && !isNaN(rawVal)) {
                let signalVal: number | undefined;
                let upperBand: number | undefined;
                let lowerBand: number | undefined;
                
                const smoothingType = settings?.ema?.smoothingType || "sma";
                const smoothingLen = settings?.ema?.smoothingLength || 14;

                if (smoothingType !== "none" && smoothingLen > 0) {
                  if (smoothingType === "sma" || smoothingType === "sma_bb") {
                    if (smoothingType === "sma_bb") {
                      const bbStdDev = settings?.ema?.bbStdDev || 2;
                      const bb = JSIndicators.bb(emaResults, smoothingLen, bbStdDev);
                      signalVal = bb.middle[bb.middle.length - 1];
                      upperBand = bb.upper[bb.upper.length - 1];
                      lowerBand = bb.lower[bb.lower.length - 1];
                    } else {
                      const smoothed = JSIndicators.sma(emaResults, smoothingLen);
                      signalVal = smoothed[smoothed.length - 1];
                    }
                  } else if (smoothingType === "ema") {
                    const smoothed = JSIndicators.ema(emaResults, smoothingLen);
                    signalVal = smoothed[smoothed.length - 1];
                  } else if (smoothingType === "smma") {
                    const smoothed = JSIndicators.smma(emaResults, smoothingLen);
                    signalVal = smoothed[smoothed.length - 1];
                  } else if (smoothingType === "wma") {
                    const smoothed = JSIndicators.wma(emaResults, smoothingLen);
                    signalVal = smoothed[smoothed.length - 1];
                  } else if (smoothingType === "vwma") {
                    const smoothed = JSIndicators.vwma(emaResults, volumesNum, smoothingLen);
                    signalVal = smoothed[smoothed.length - 1];
                  }
                }

                movingAverages.push({
                    name: "EMA",
                    params: `${period}`,
                    value: rawVal,
                    signal: signalVal,
                    upperBand: upperBand,
                    lowerBand: lowerBand,
                    action: currentPrice > rawVal ? "Buy" : "Sell",
                });
            }
        }
    }

    // SMA (3 configurable periods)
    if (shouldCalculate('sma')) {
        const sma1 = settings?.sma?.sma1?.length || 9;
        const sma2 = settings?.sma?.sma2?.length || 21;
        const sma3 = settings?.sma?.sma3?.length || 50;
        const smaPeriods = [sma1, sma2, sma3];
        for (const period of smaPeriods) {
            const smaResults = JSIndicators.sma(closesNum, period);
            const rawVal = smaResults[smaResults.length - 1];
            if (typeof rawVal === 'number' && !isNaN(rawVal)) {
                movingAverages.push({
                    name: "SMA",
                    params: `${period}`,
                    value: rawVal,
                    action: currentPrice > rawVal ? "Buy" : "Sell",
                });
            }
        }
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Error calculating moving averages:", error);
    }
  }

  // Momentum (shown as oscillator) — close[n] - close[n-period]
  try {
    if (shouldCalculate('momentum')) {
        const momLen = settings?.momentum?.length || 10;
        const momSource = getSource(settings?.momentum?.source || "close");
        const momIdx = momSource.length - 1;
        const momPrevIdx = momIdx - momLen;
        if (momPrevIdx >= 0) {
            const momVal = momSource[momIdx] - momSource[momPrevIdx];
            oscillators.push({
                name: "Momentum",
                params: momLen.toString(),
                value: momVal,
                action: momVal > 0 ? "Buy" : "Sell",
            });
        }
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Error calculating momentum:", error);
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
    if (shouldCalculate('atr') || shouldCalculate('bollingerBands')) {
        const atrLen = settings?.atr?.length || 14;
        const bbLen = settings?.bollingerBands?.length || 20;
        const bbStdDev = settings?.bollingerBands?.stdDev || 2;

        let currentAtr = 0;
        if (shouldCalculate('atr')) {
            const atrResults = JSIndicators.atr(highsNum, lowsNum, closesNum, atrLen);
            currentAtr = atrResults[atrResults.length - 1];
        }

        let bbUpper = 0, bbLower = 0, bbMiddle = 0, percentP = 0;

        if (shouldCalculate('bollingerBands')) {
            let outMiddle: Float64Array | undefined;
            let outUpper: Float64Array | undefined;
            let outLower: Float64Array | undefined;

            if (pool) {
              outMiddle = pool.acquire(len);
              outUpper = pool.acquire(len);
              outLower = pool.acquire(len);
              cleanupBuffers.push(outMiddle);
              cleanupBuffers.push(outUpper);
              cleanupBuffers.push(outLower);
            }

            const bbResults = JSIndicators.bb(closesNum, bbLen, bbStdDev, outMiddle, outUpper, outLower);
            bbUpper = bbResults.upper[bbResults.upper.length - 1];
            bbLower = bbResults.lower[bbResults.lower.length - 1];
            bbMiddle = bbResults.middle[bbResults.middle.length - 1];

            const range = bbUpper - bbLower;
            percentP = range === 0
            ? 0.5
            : (currentPrice - bbLower) / range;
        }

        volatility = {
            atr: shouldCalculate('atr') ? currentAtr : undefined,
            bb: shouldCalculate('bollingerBands') ? {
                upper: bbUpper,
                middle: bbMiddle,
                lower: bbLower,
                percentP: percentP,
            } : undefined,
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

  // Cleanup buffers if pool was used
  if (pool) {
      for (const buf of cleanupBuffers) {
          pool.release(buf);
      }
  }

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
