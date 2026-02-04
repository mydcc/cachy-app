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
 * Shared Technical Indicators Logic.
 * Can be used by both Main Thread and WebWorkers.
 *
 * Contains:
 * 1. JSIndicators: Fast, array-based pure math implementations (number[] -> Float64Array).
 * 2. indicators: Decimal-based wrappers for UI/Chart precision.
 * 3. Helpers: Pivots, AO, etc.
 */

import { Decimal } from "decimal.js";
import { slidingWindowMax, slidingWindowMin } from "./slidingWindow";
import { toNumFast } from "./fastConversion";
import type { BufferPool } from "./bufferPool";

// --- Types ---

export interface Kline {
  time: number;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: Decimal;
}

export type NumberArray = number[] | Float64Array;

// --- JSIndicators (Fast, Array-based, used by Worker/Service) ---
export const JSIndicators = {
  sma(
    data: NumberArray,
    period: number,
    out?: Float64Array,
  ): Float64Array {
    const len = data.length;
    const result = (out && out.length === len) ? out : new Float64Array(len);
    result.fill(NaN);

    let startIdx = 0;
    while (startIdx < len && isNaN(data[startIdx])) startIdx++;

    if (len - startIdx < period) return result;

    let sum = 0;
    for (let i = startIdx; i < startIdx + period; i++) sum += data[i];
    result[startIdx + period - 1] = sum / period;

    for (let i = startIdx + period; i < len; i++) {
      sum = sum - data[i - period] + data[i];
      result[i] = sum / period;
    }
    return result;
  },

  wma(
    data: NumberArray,
    period: number,
    out?: Float64Array,
  ): Float64Array {
    const len = data.length;
    const result = (out && out.length === len) ? out : new Float64Array(len);
    result.fill(NaN);

    let startIdx = 0;
    while (startIdx < len && isNaN(data[startIdx])) startIdx++;

    if (len - startIdx < period) return result;

    const denominator = (period * (period + 1)) / 2;

    // 1. Initial Window Calculation
    let sum = 0;
    let wmaSum = 0;
    for (let i = startIdx; i < startIdx + period; i++) {
        sum += data[i];
        wmaSum += data[i] * (i - startIdx + 1);
    }

    result[startIdx + period - 1] = wmaSum / denominator;

    // 2. Sliding Window
    for (let i = startIdx + period; i < len; i++) {
      const dropVal = data[i - period];
      const addVal = data[i];

      // WMA_t = WMA_{t-1} + n*P_t - Sum_{t-1}
      wmaSum = wmaSum + period * addVal - sum;

      result[i] = wmaSum / denominator;

      // Update sum for next iteration
      sum = sum - dropVal + addVal;
    }
    return result;
  },

  ema(
    data: NumberArray,
    period: number,
    out?: Float64Array,
  ): Float64Array {
    const len = data.length;
    const result = (out && out.length === len) ? out : new Float64Array(len);
    result.fill(NaN);

    let startIdx = 0;
    while (startIdx < len && isNaN(data[startIdx])) startIdx++;

    if (len - startIdx < period) return result;
    const k = 2 / (period + 1);

    let sum = 0;
    for (let i = startIdx; i < startIdx + period; i++) sum += data[i];
    let currentEma = sum / period;
    result[startIdx + period - 1] = currentEma;

    for (let i = startIdx + period; i < len; i++) {
      currentEma = (data[i] - currentEma) * k + currentEma;
      result[i] = currentEma;
    }
    return result;
  },

  smma(
    data: NumberArray,
    period: number,
    out?: Float64Array,
  ): Float64Array {
    // Wilder's Smoothing (RMA)
    const len = data.length;
    const result = (out && out.length === len) ? out : new Float64Array(len);
    result.fill(NaN);

    let startIdx = 0;
    while (startIdx < len && isNaN(data[startIdx])) startIdx++;

    if (len - startIdx < period) return result;

    let sum = 0;
    for (let i = startIdx; i < startIdx + period; i++) sum += data[i];
    let currentSmma = sum / period;
    result[startIdx + period - 1] = currentSmma;

    for (let i = startIdx + period; i < len; i++) {
      // RMA formula: (Prior * (n-1) + Current) / n
      currentSmma = (currentSmma * (period - 1) + data[i]) / period;
      result[i] = currentSmma;
    }
    return result;
  },

  rsi(
    data: NumberArray,
    period: number,
    out?: Float64Array,
  ): Float64Array {
    const len = data.length;
    const result = (out && out.length === len) ? out : new Float64Array(len);
    result.fill(NaN);

    let startIdx = 0;
    while (startIdx < len && isNaN(data[startIdx])) startIdx++;

    // Need period + 1 valid points to calculate first RSI
    if (len - startIdx <= period) return result;

    let sumGain = 0;
    let sumLoss = 0;
    // Calculation starts from startIdx
    // First diff is at startIdx + 1

    for (let i = startIdx + 1; i <= startIdx + period; i++) {
      const diff = data[i] - data[i - 1];
      if (diff >= 0) sumGain += diff;
      else sumLoss -= diff;
    }
    let avgGain = sumGain / period;
    let avgLoss = sumLoss / period;
    result[startIdx + period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

    for (let i = startIdx + period + 1; i < len; i++) {
      const diff = data[i] - data[i - 1];
      const gain = diff >= 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
    return result;
  },

  stoch(
    high: NumberArray,
    low: NumberArray,
    close: NumberArray,
    kPeriod: number,
    out?: Float64Array,
    pool?: BufferPool,
  ): Float64Array {
    const len = close.length;
    const result = (out && out.length === len) ? out : new Float64Array(len);
    result.fill(NaN);

    if (len < kPeriod) return result;

    let highestHighs: Float64Array;
    let lowestLows: Float64Array;
    let pooled = false;

    if (pool) {
      highestHighs = pool.acquire(len);
      lowestLows = pool.acquire(len);
      pooled = true;
    } else {
      highestHighs = new Float64Array(len);
      lowestLows = new Float64Array(len);
    }

    slidingWindowMax(high, kPeriod, highestHighs);
    slidingWindowMin(low, kPeriod, lowestLows);

    for (let i = kPeriod - 1; i < len; i++) {
      const lookbackHigh = highestHighs[i];
      const lookbackLow = lowestLows[i];
      const range = lookbackHigh - lookbackLow;

      // If close[i] is NaN, result is NaN.
      // If lookbackHigh/Low are NaN (because inputs were NaN), result is NaN.
      // This is implicit, no special handling needed if inputs are clean.
      // But if inputs have leading NaNs, slidingWindowMax/Min might return NaN initially.

      result[i] = range === 0 ? 50 : ((close[i] - lookbackLow) / range) * 100;
    }

    if (pooled && pool) {
      pool.release(highestHighs);
      pool.release(lowestLows);
    }

    return result;
  },

  macd(
    data: NumberArray,
    fast: number,
    slow: number,
    signal: number,
    outMacd?: Float64Array,
    outSignal?: Float64Array,
    pool?: BufferPool,
  ) {
    const len = data.length;
    let emaFast: Float64Array;
    let emaSlow: Float64Array;
    let pooled = false;

    if (pool) {
      emaFast = pool.acquire(len);
      emaSlow = pool.acquire(len);
      pooled = true;
    } else {
      emaFast = new Float64Array(len);
      emaSlow = new Float64Array(len);
    }

    this.ema(data, fast, emaFast);
    this.ema(data, slow, emaSlow);

    const macdLine = (outMacd && outMacd.length === len) ? outMacd : new Float64Array(len);
    macdLine.fill(NaN);

    for (let i = 0; i < len; i++) {
      macdLine[i] = emaFast[i] - emaSlow[i];
    }

    if (pooled && pool) {
      pool.release(emaFast);
      pool.release(emaSlow);
    }

    // macdLine is a new Float64Array (or reused)
    // We use subarray for efficiency (no copy)
    const macdLineSub = macdLine.subarray(slow - 1);

    // Calculate signal on the sliced part
    // Note: ema now skips leading NaNs.
    // macdLine has NaNs up to slow-1.
    // So we don't strictly need to subarray if we pass full array?
    // But passing full array preserves indices.
    // If we pass subarray, we get a short array back starting with NaNs.
    // The original logic was:
    // const macdSignalPart = this.ema(macdLineSub, signal);
    // paddedSignal.set(macdSignalPart, slow - 1);

    // If macdLine has leading NaNs, we can just pass macdLine to ema!
    // And it will return a signal line aligned with macdLine (with more NaNs).

    // Optimization: Avoid subarray and copy back.
    const signalLine = (outSignal && outSignal.length === len) ? outSignal : new Float64Array(len);
    this.ema(macdLine, signal, signalLine);

    return { macd: macdLine, signal: signalLine };
  },

  mom(data: NumberArray, period: number): Float64Array {
    const result = new Float64Array(data.length).fill(NaN);
    for (let i = period; i < data.length; i++) {
      result[i] = data[i] - data[i - period];
    }
    return result;
  },

  cci(
    data: NumberArray,
    period: number,
    out?: Float64Array,
  ): Float64Array {
    const result = (out && out.length === data.length) ? out : new Float64Array(data.length);
    result.fill(NaN);

    if (data.length < period) return result;

    for (let i = period - 1; i < data.length; i++) {
      // Optimization: Manual loop instead of slice
      const start = i - period + 1;
      const end = i + 1;

      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += data[j];
      }
      const sma = sum / period;

      let sumAbsDiff = 0;
      for (let j = start; j < end; j++) {
        sumAbsDiff += Math.abs(data[j] - sma);
      }
      const meanDev = sumAbsDiff / period;

      if (meanDev === 0) {
        result[i] = 0;
      } else {
        const diff = data[i] - sma;
        result[i] = diff / (0.015 * meanDev);
      }
    }
    return result;
  },

  adx(
    high: NumberArray,
    low: NumberArray,
    close: NumberArray,
    period: number,
    out?: Float64Array,
    pool?: BufferPool,
  ): Float64Array {
    const len = close.length;
    const result = (out && out.length === len) ? out : new Float64Array(len);
    result.fill(NaN);

    if (len < period * 2) return result;

    let upMove: Float64Array;
    let downMove: Float64Array;
    let tr: Float64Array;
    let plusDI_S: Float64Array;
    let minusDI_S: Float64Array;
    let tr_S: Float64Array;
    let dx: Float64Array;
    let pooled = false;

    if (pool) {
      upMove = pool.acquire(len);
      downMove = pool.acquire(len);
      tr = pool.acquire(len);
      // We can reuse buffers sequentially if we are careful, but adx needs parallel vectors
      // plusDI_S, minusDI_S, tr_S needed simultaneously for DX calc.
      // So we need separate buffers.
      plusDI_S = pool.acquire(len);
      minusDI_S = pool.acquire(len);
      tr_S = pool.acquire(len);
      dx = pool.acquire(len);
      pooled = true;
    } else {
      upMove = new Float64Array(len);
      downMove = new Float64Array(len);
      tr = new Float64Array(len);
      plusDI_S = new Float64Array(len); // Allocated by smma if not passed? No, we pass logic.
      minusDI_S = new Float64Array(len);
      tr_S = new Float64Array(len);
      dx = new Float64Array(len);
    }

    // Fill with 0 (since acquire might be dirty)
    upMove.fill(0);
    downMove.fill(0);
    tr.fill(0);
    // Others are filled by their producers (smma) or calc loops

    for (let i = 1; i < len; i++) {
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

    this.smma(upMove, period, plusDI_S);
    this.smma(downMove, period, minusDI_S);
    this.smma(tr, period, tr_S);

    // dx
    for (let i = 0; i < len; i++) {
      const pDI = (plusDI_S[i] / (tr_S[i] || 1)) * 100;
      const mDI = (minusDI_S[i] / (tr_S[i] || 1)) * 100;
      const sum = pDI + mDI;
      dx[i] = sum === 0 ? 0 : (Math.abs(pDI - mDI) / sum) * 100;
    }

    const res = this.smma(dx, period, result);

    if (pooled && pool) {
        pool.release(upMove);
        pool.release(downMove);
        pool.release(tr);
        pool.release(plusDI_S);
        pool.release(minusDI_S);
        pool.release(tr_S);
        pool.release(dx);
    }

    return res;
  },

  atr(
    high: NumberArray,
    low: NumberArray,
    close: NumberArray,
    period: number,
    out?: Float64Array,
    pool?: BufferPool,
  ): Float64Array {
    const len = close.length;
    // We can assume out is passed for result, but we need TR buffer
    const result = (out && out.length === len) ? out : new Float64Array(len);

    if (len < period) {
        result.fill(NaN);
        return result;
    }

    let tr: Float64Array;
    let pooled = false;

    if (pool) {
        tr = pool.acquire(len);
        pooled = true;
    } else {
        tr = new Float64Array(len);
    }
    tr.fill(0);

    for (let i = 1; i < len; i++) {
      tr[i] = Math.max(
        high[i] - low[i],
        Math.abs(high[i] - close[i - 1]),
        Math.abs(low[i] - close[i - 1]),
      );
    }
    // ATR is usually a smoothed moving average of TR
    // Write directly to result
    this.smma(tr, period, result);

    if (pooled && pool) {
        pool.release(tr);
    }
    return result;
  },

  bb(
    data: NumberArray,
    period: number,
    stdDev: number = 2,
    outMiddle?: Float64Array,
    outUpper?: Float64Array,
    outLower?: Float64Array,
  ) {
    const len = data.length;
    const sma = this.sma(data, period, outMiddle);
    const upper = (outUpper && outUpper.length === len) ? outUpper : new Float64Array(len);
    upper.fill(NaN);
    const lower = (outLower && outLower.length === len) ? outLower : new Float64Array(len);
    lower.fill(NaN);

    if (len < period) return { middle: sma, upper, lower };

    let sumSq = 0;
    // Initial window
    for (let i = 0; i < period; i++) {
      sumSq += data[i] * data[i];
    }

    // Calculation
    for (let i = period - 1; i < len; i++) {
      // Update sliding window SumSq
      if (i >= period) {
        const valOut = data[i - period];
        const valIn = data[i];
        sumSq = sumSq - valOut * valOut + valIn * valIn;
      }

      // Avoid negative sumSq due to float precision
      if (sumSq < 0) sumSq = 0;

      const avg = sma[i];
      // Variance = E[X^2] - (E[X])^2
      // But we need sumSqDiff = Sum((x-avg)^2) = Sum(x^2) - N*avg^2
      let sumSqDiff = sumSq - period * avg * avg;

      // Precision safety
      if (sumSqDiff < 0) sumSqDiff = 0;

      const standardDev = Math.sqrt(sumSqDiff / period);
      upper[i] = avg + standardDev * stdDev;
      lower[i] = avg - standardDev * stdDev;
    }
    return { middle: sma, upper, lower };
  },

  // --- Advanced Indicators ---

  vwap(
    high: NumberArray,
    low: NumberArray,
    close: NumberArray,
    volume: NumberArray,
    time?: NumberArray,
    anchor?: { mode: "session" | "fixed"; anchorPoint?: number },
  ): Float64Array {
    const result = new Float64Array(close.length).fill(NaN);
    let cumVol = 0;
    let cumVolPrice = 0;
    let lastDay = -1;

    for (let i = 0; i < close.length; i++) {
      // Reset Logic
      if (anchor?.mode === "session" && time && time[i]) {
        const date = new Date(time[i]);
        const currentDay = date.getUTCDate();

        // If initialized and day changed, reset
        if (lastDay !== -1 && currentDay !== lastDay) {
          cumVol = 0;
          cumVolPrice = 0;
        }
        lastDay = currentDay;
      }

      const typicalPrice = (high[i] + low[i] + close[i]) / 3;
      const vol = volume[i];
      cumVol += vol;
      cumVolPrice += typicalPrice * vol;
      result[i] = cumVol === 0 ? NaN : cumVolPrice / cumVol;
    }
    return result;
  },

  mfi(
    high: NumberArray,
    low: NumberArray,
    close: NumberArray,
    volume: NumberArray,
    period: number,
    typicalPrices?: NumberArray,
  ): Float64Array {
    const result = new Float64Array(close.length).fill(NaN);
    if (close.length < period + 1) return result;

    // Use map to create typical prices - map returns Float64Array if inputs are Float64Array
    // But map on NumberArray (if Union) isn't guaranteed to return Float64Array unless cast
    // Safe way:
    let tp: NumberArray;
    if (typicalPrices) {
        tp = typicalPrices;
    } else {
        tp = new Float64Array(close.length);
        for(let i=0; i<close.length; i++) {
            tp[i] = (high[i] + low[i] + close[i]) / 3;
        }
    }

    const moneyFlow = new Float64Array(close.length);
    for (let i = 0; i < close.length; i++) moneyFlow[i] = tp[i] * volume[i];

    const posFlow = new Float64Array(close.length).fill(0);
    const negFlow = new Float64Array(close.length).fill(0);

    // 1. Calculate Flows
    for (let i = 1; i < close.length; i++) {
      if (tp[i] > tp[i - 1]) {
        posFlow[i] = moneyFlow[i];
      } else if (tp[i] < tp[i - 1]) {
        negFlow[i] = moneyFlow[i];
      }
    }

    // 2. Sum over period (Sliding Window Optimization)
    // Initialize first window sums (indices 1 to period)
    let sumPos = 0;
    let sumNeg = 0;
    for (let i = 1; i <= period; i++) {
        sumPos += posFlow[i];
        sumNeg += negFlow[i];
    }

    // Set first point
    if (close.length > period) {
        if (sumPos + sumNeg === 0) {
            result[period] = 50;
        } else if (sumNeg === 0) {
            result[period] = 100;
        } else {
            const mfr = sumPos / sumNeg;
            result[period] = 100 - 100 / (1 + mfr);
        }
    }

    // Sliding window
    for (let i = period + 1; i < close.length; i++) {
        // Add new, remove old
        sumPos = sumPos + posFlow[i] - posFlow[i - period];
        sumNeg = sumNeg + negFlow[i] - negFlow[i - period];

        if (sumPos + sumNeg === 0) {
            result[i] = 50;
        } else if (sumNeg === 0) {
            result[i] = 100;
        } else {
            const mfr = sumPos / sumNeg;
            result[i] = 100 - 100 / (1 + mfr);
        }
    }

    return result;
  },

  stochRsi(
    data: NumberArray,
    period: number,
    kPeriod: number,
    dPeriod: number,
    smoothK: number,
    outK?: Float64Array,
    outD?: Float64Array,
    pool?: BufferPool,
  ) {
    const len = data.length;
    let rsiRaw: Float64Array;
    let pooledRsi = false;
    let minArr: Float64Array;
    let maxArr: Float64Array;
    let pooledMinMax = false;

    // Acquire RSI buffer
    if (pool) {
      rsiRaw = pool.acquire(len);
      pooledRsi = true;
    } else {
      rsiRaw = new Float64Array(len);
    }

    // Acquire Min/Max buffers
    if (pool) {
        minArr = pool.acquire(len);
        maxArr = pool.acquire(len);
        pooledMinMax = true;
    } else {
        minArr = new Float64Array(len);
        maxArr = new Float64Array(len);
    }

    // Calculate RSI
    this.rsi(data, period, rsiRaw);

    // Calculate Stoch of RSI (Raw K)
    // We need a destination for Raw K.
    // If smoothK > 1, we can't write directly to outK if we plan to smooth it into outK later (in-place SMA unsafe).
    // So we need a temporary buffer if smoothK > 1.
    // If smoothK == 1, we can write directly to outK.

    let rawK: Float64Array;
    let pooledRawK = false;

    if (smoothK > 1) {
        if (pool) {
            rawK = pool.acquire(len);
            pooledRawK = true;
        } else {
            rawK = new Float64Array(len);
        }
    } else {
        // Direct write
        rawK = (outK && outK.length === len) ? outK : (pool ? pool.acquire(len) : new Float64Array(len));
        // If we acquired it (and didn't use outK), it's conceptually "pooled" but we will return it/assign it.
        // If we created new, we return it.
    }
    rawK.fill(NaN); // Safety

    // Inline Stoch logic for performance and pool usage
    slidingWindowMin(rsiRaw, kPeriod, minArr);
    slidingWindowMax(rsiRaw, kPeriod, maxArr);

    for (let i = kPeriod - 1; i < len; i++) {
        const min = minArr[i];
        const max = maxArr[i];
        const range = max - min;
        rawK[i] = range === 0 ? 50 : ((rsiRaw[i] - min) / range) * 100;
    }

    // Release Min/Max/RSI
    if (pooledMinMax && pool) {
        pool.release(minArr);
        pool.release(maxArr);
    }
    if (pooledRsi && pool) {
        pool.release(rsiRaw);
    }

    // Smoothing K
    let kPoints: Float64Array;
    if (smoothK > 1) {
        // Smooth rawK into kPoints (destination)
        kPoints = (outK && outK.length === len) ? outK : (pool ? pool.acquire(len) : new Float64Array(len));
        this.sma(rawK, smoothK, kPoints);

        // Release rawK if it was temporary
        if (pooledRawK && pool) {
            pool.release(rawK);
        }
    } else {
        kPoints = rawK;
    }

    // Calculate D (SMA of K)
    const dPoints = (outD && outD.length === len) ? outD : (pool ? pool.acquire(len) : new Float64Array(len));
    this.sma(kPoints, dPeriod, dPoints);

    return { k: kPoints, d: dPoints };
  },

  williamsR(
    high: NumberArray,
    low: NumberArray,
    close: NumberArray,
    period: number,
  ): Float64Array {
    const result = new Float64Array(close.length).fill(NaN);
    if (close.length < period) return result;

    const highestHighs = slidingWindowMax(high, period);
    const lowestLows = slidingWindowMin(low, period);

    for (let i = period - 1; i < close.length; i++) {
      const highestHigh = highestHighs[i];
      const lowestLow = lowestLows[i];
      const range = highestHigh - lowestLow;
      result[i] = range === 0 ? 0 : ((highestHigh - close[i]) / range) * -100;
    }
    return result;
  },

  choppiness(
    high: NumberArray,
    low: NumberArray,
    close: NumberArray,
    period: number,
  ): Float64Array {
    const result = new Float64Array(close.length).fill(NaN);
    if (close.length < period) return result;
    // CI = 100 * LOG10( SUM(ATR(1), n) / ( MaxHi(n) - MinLo(n) ) ) / LOG10(n)

    // First calculate TR for each candle
    const tr = new Float64Array(close.length).fill(0);
    for (let i = 1; i < close.length; i++) {
      tr[i] = Math.max(
        high[i] - low[i],
        Math.abs(high[i] - close[i - 1]),
        Math.abs(low[i] - close[i - 1]),
      );
    }

    const log10n = Math.log10(period);

    const maxHighs = slidingWindowMax(high, period);
    const minLows = slidingWindowMin(low, period);

    let sumTr = 0;
    for (let i = 0; i < period; i++) sumTr += tr[i];

    for (let i = period; i < close.length; i++) {
      sumTr = sumTr - tr[i - period] + tr[i];
      const maxHigh = maxHighs[i];
      const minLow = minLows[i];
      const range = maxHigh - minLow;

      if (range === 0) result[i] = 0;
      else {
        result[i] = (100 * Math.log10(sumTr / range)) / log10n;
      }
    }
    return result;
  },

  ichimoku(
    high: NumberArray,
    low: NumberArray,
    conversionPeriod: number,
    basePeriod: number,
    spanBPeriod: number,
    laggingSpan2: number,
  ) {
    const len = high.length;

    const convHigh = slidingWindowMax(high, conversionPeriod);
    const convLow = slidingWindowMin(low, conversionPeriod);

    const baseHigh = slidingWindowMax(high, basePeriod);
    const baseLow = slidingWindowMin(low, basePeriod);

    const spanBHigh = slidingWindowMax(high, spanBPeriod);
    const spanBLow = slidingWindowMin(low, spanBPeriod);

    const conversion = new Float64Array(len).fill(NaN);
    const base = new Float64Array(len).fill(NaN);
    const spanA = new Float64Array(len).fill(NaN);
    const spanB = new Float64Array(len).fill(NaN);

    for (let i = 0; i < len; i++) {
      if (i >= conversionPeriod - 1) {
        conversion[i] = (convHigh[i] + convLow[i]) / 2;
      } else {
        conversion[i] = 0;
      }

      if (i >= basePeriod - 1) {
        base[i] = (baseHigh[i] + baseLow[i]) / 2;
      } else {
        base[i] = 0;
      }

      spanA[i] = (conversion[i] + base[i]) / 2;

      if (i >= spanBPeriod - 1) {
        spanB[i] = (spanBHigh[i] + spanBLow[i]) / 2;
      } else {
        spanB[i] = 0;
      }
    }

    const displacement = basePeriod;

    const currentSpanA = new Float64Array(len).fill(NaN);
    const currentSpanB = new Float64Array(len).fill(NaN);

    for (let i = displacement; i < len; i++) {
      currentSpanA[i] = spanA[i - displacement];
      currentSpanB[i] = spanB[i - displacement];
    }

    return {
      conversion,
      base,
      spanA: currentSpanA,
      spanB: currentSpanB,
      lagging: new Float64Array(0),
    };
  },

  // --- Pro Indicators ---

  superTrend(
    high: NumberArray,
    low: NumberArray,
    close: NumberArray,
    period: number = 10,
    multiplier: number = 3,
  ) {
    // 1. ATR
    const atr = this.atr(high, low, close, period);
    const len = close.length;
    const basicUpper = new Float64Array(len).fill(NaN);
    const basicLower = new Float64Array(len).fill(NaN);
    const finalUpper = new Float64Array(len).fill(NaN);
    const finalLower = new Float64Array(len).fill(NaN);
    const trend = new Int8Array(len).fill(0); // 1 = Bull, -1 = Bear
    // Initialize trend
    trend[0] = 1;

    // Calculation loop
    for (let i = 1; i < len; i++) {
      const hl2 = (high[i] + low[i]) / 2;
      basicUpper[i] = hl2 + multiplier * atr[i];
      basicLower[i] = hl2 - multiplier * atr[i];

      if (
        basicUpper[i] < finalUpper[i - 1] ||
        close[i - 1] > finalUpper[i - 1]
      ) {
        finalUpper[i] = basicUpper[i];
      } else {
        finalUpper[i] = finalUpper[i - 1];
      }

      if (
        basicLower[i] > finalLower[i - 1] ||
        close[i - 1] < finalLower[i - 1]
      ) {
        finalLower[i] = basicLower[i];
      } else {
        finalLower[i] = finalLower[i - 1];
      }

      // Trend Rule
      let currentTrend = trend[i - 1];
      if (currentTrend === 1) {
        if (close[i] < finalLower[i - 1]) currentTrend = -1;
      } else {
        if (close[i] > finalUpper[i - 1]) currentTrend = 1;
      }
      trend[i] = currentTrend;
    }

    // Convert trend back to float for consistent API, or just map active line
    // Map trend to active line value
    const value = new Float64Array(len);
    for(let i=0; i<len; i++) {
        value[i] = trend[i] === 1 ? finalLower[i] : finalUpper[i];
    }

    return {
      trend,
      value
    };
  },

  atrTrailingStop(
    high: NumberArray,
    low: NumberArray,
    close: NumberArray,
    period: number = 22,
    multiplier: number = 3,
  ) {
    const atr = this.atr(high, low, close, period);
    const len = close.length;
    const buyStop = new Float64Array(len).fill(NaN);
    const sellStop = new Float64Array(len).fill(NaN);

    const highestHighs = slidingWindowMax(high, period);
    const lowestLows = slidingWindowMin(low, period);

    for (let i = period; i < len; i++) {
      const highestHigh = highestHighs[i];
      const lowestLow = lowestLows[i];

      buyStop[i] = highestHigh - atr[i] * multiplier;
      sellStop[i] = lowestLow + atr[i] * multiplier;
    }
    return { buyStop, sellStop };
  },

  obv(close: NumberArray, volume: NumberArray): Float64Array {
    const result = new Float64Array(close.length).fill(0);
    let cumVol = 0;
    result[0] = cumVol;

    for (let i = 1; i < close.length; i++) {
      if (close[i] > close[i - 1]) {
        cumVol += volume[i];
      } else if (close[i] < close[i - 1]) {
        cumVol -= volume[i];
      }
      result[i] = cumVol;
    }
    return result;
  },

  volumeProfile(
    high: NumberArray,
    low: NumberArray,
    close: NumberArray,
    volume: NumberArray,
    rowCount: number = 24,
  ) {
    if (close.length === 0) return null;

    // 1. Find Range
    // Math.min(...low) can stack overflow for very large arrays.
    // Optimization: Manual loop
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    for(let i=0; i<high.length; i++) {
        if(low[i] < minPrice) minPrice = low[i];
        if(high[i] > maxPrice) maxPrice = high[i];
    }

    if (minPrice === maxPrice) return null;

    const range = maxPrice - minPrice;
    const rowSize = range / rowCount;

    // Initialize Buckets
    const rows = new Array(rowCount).fill(0).map((_, i) => ({
      priceStart: minPrice + i * rowSize,
      priceEnd: minPrice + (i + 1) * rowSize,
      volume: 0,
    }));

    // 2. Distribute Volume
    for (let i = 0; i < close.length; i++) {
      const cHigh = high[i];
      const cLow = low[i];
      const cVol = volume[i];

      if (cHigh === cLow) {
        // Single point, easier
        const rowIdx = Math.min(
          Math.floor((cHigh - minPrice) / rowSize),
          rowCount - 1,
        );
        if (rowIdx >= 0) rows[rowIdx].volume += cVol;
      } else {
        // Distribute across overlapped rows
        const startRowIdx = Math.max(
          0,
          Math.floor((cLow - minPrice) / rowSize),
        );
        const endRowIdx = Math.min(
          rowCount - 1,
          Math.floor((cHigh - minPrice) / rowSize),
        );

        const candleRange = cHigh - cLow;

        for (let r = startRowIdx; r <= endRowIdx; r++) {
          const rStart = rows[r].priceStart;
          const rEnd = rows[r].priceEnd;
          const overlapStart = Math.max(cLow, rStart);
          const overlapEnd = Math.min(cHigh, rEnd);
          const overlap = Math.max(0, overlapEnd - overlapStart);

          const share = overlap / candleRange;
          rows[r].volume += cVol * share;
        }
      }
    }

    // 3. Find POC
    let maxVol = -1;
    let pocRowIdx = -1;
    let totalVol = 0;

    rows.forEach((r, i) => {
      totalVol += r.volume;
      if (r.volume > maxVol) {
        maxVol = r.volume;
        pocRowIdx = i;
      }
    });

    // 4. Value Area (70%)
    const targetVaVol = totalVol * 0.7;
    let currentVaVol = maxVol;
    let upIdx = pocRowIdx;
    let downIdx = pocRowIdx;
    const vaRows = new Set<number>();
    vaRows.add(pocRowIdx);

    while (currentVaVol < targetVaVol) {
      const upVol = upIdx < rowCount - 1 ? rows[upIdx + 1].volume : 0;
      const downVol = downIdx > 0 ? rows[downIdx - 1].volume : 0;

      if (upVol === 0 && downVol === 0) break;

      if (upVol >= downVol) {
        currentVaVol += upVol;
        upIdx++;
        vaRows.add(upIdx);
      } else {
        currentVaVol += downVol;
        downIdx--;
        vaRows.add(downIdx);
      }
    }

    return {
      rows,
      poc: (rows[pocRowIdx].priceStart + rows[pocRowIdx].priceEnd) / 2,
      vaHigh: rows[Math.max(...vaRows)].priceEnd,
      vaLow: rows[Math.min(...vaRows)].priceStart,
    };
  },

  psar(high: NumberArray, low: NumberArray, accel: number = 0.02, max: number = 0.2): Float64Array {
    const result = new Float64Array(high.length).fill(NaN);
    if (high.length < 2) return result;

    let isLong = true;
    let af = accel;
    let ep = high[0]; // Extreme Point
    let sar = low[0];

    // Initial guess setup
    result[0] = sar;

    for (let i = 1; i < high.length; i++) {
      // Apply SAR Logic
      // Next SAR = Prior SAR + Prior AF * (Prior EP - Prior SAR)
      let nextSar = sar + af * (ep - sar);

      // Constraint: SAR cannot be within previous day's range
      if (isLong) {
        if (i > 0 && nextSar > low[i - 1]) nextSar = low[i - 1];
        if (i > 1 && nextSar > low[i - 2]) nextSar = low[i - 2];
      } else {
        if (i > 0 && nextSar < high[i - 1]) nextSar = high[i - 1];
        if (i > 1 && nextSar < high[i - 2]) nextSar = high[i - 2];
      }

      // Check for Reversal
      let reversed = false;
      if (isLong) {
        if (low[i] < nextSar) {
          isLong = false;
          reversed = true;
          nextSar = ep;
          ep = low[i];
          af = accel;
        }
      } else {
        if (high[i] > nextSar) {
          isLong = true;
          reversed = true;
          nextSar = ep;
          ep = high[i];
          af = accel;
        }
      }

      if (!reversed) {
        // Update AF and EP
        if (isLong) {
          if (high[i] > ep) {
            ep = high[i];
            af = Math.min(af + accel, max);
          }
        } else {
          if (low[i] < ep) {
            ep = low[i];
            af = Math.min(af + accel, max);
          }
        }
      }
      sar = nextSar;
      result[i] = sar;
    }

    return result;
  },

  // --- Incremental Helpers (O(1) Updates) ---

  updateEma(prev: number, val: number, period: number): number {
    const k = 2 / (period + 1);
    return (val - prev) * k + prev;
  },

  updateSma(prevSma: number, newVal: number, oldVal: number, period: number): number {
    return prevSma + (newVal - oldVal) / period;
  },

  updateSmma(prev: number, val: number, period: number): number {
    // (Prior * (n-1) + Current) / n
    return (prev * (period - 1) + val) / period;
  },

  updateRsi(
    prevAvgGain: number,
    prevAvgLoss: number,
    currentPrice: number,
    prevPrice: number,
    period: number,
  ) {
    const diff = currentPrice - prevPrice;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    const avgGain = (prevAvgGain * (period - 1) + gain) / period;
    const avgLoss = (prevAvgLoss * (period - 1) + loss) / period;

    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    return { rsi, avgGain, avgLoss };
  },
};

// --- Helpers (Decimals, used by Service/Worker logic requiring precision) ---

export function calculateAwesomeOscillator(
  high: NumberArray,
  low: NumberArray,
  fastPeriod: number,
  slowPeriod: number,
): number {
  const len = high.length;

  const getSMAOfHL2 = (period: number): number => {
    if (len < period) return 0;
    let sum = 0;
    const start = len - period;
    for (let i = start; i < len; i++) {
      sum += (high[i] + low[i]) / 2;
    }
    return sum / period;
  };

  const fastSMA = getSMAOfHL2(fastPeriod);
  const slowSMA = getSMAOfHL2(slowPeriod);

  return fastSMA - slowSMA;
}

export function calculatePivots(klines: Kline[], type: string) {
  if (klines.length < 2) return getEmptyPivots();
  const prev = klines[klines.length - 2];
  return calculatePivotsFromValues(
    prev.high.toNumber(),
    prev.low.toNumber(),
    prev.close.toNumber(),
    prev.open.toNumber(),
    type
  );
}

export function calculatePivotsFromValues(
  h: number,
  l: number,
  c: number,
  o: number,
  type: string
) {
  // Use numbers for performance in pivots as well
  const high = h;
  const low = l;
  const close = c;
  const open = o;

  let p = 0;
  let r1 = 0,
    r2 = 0,
    r3 = 0;
  let s1 = 0,
    s2 = 0,
    s3 = 0;

  if (type === "woodie") {
    p = (high + low + close * 2) / 4;
    r1 = p * 2 - low;
    r2 = p + high - low;
    s1 = p * 2 - high;
    s2 = p - high + low;
    r3 = high + (p - low) * 2;
    s3 = low - (high - p) * 2;
  } else if (type === "camarilla") {
    const range = high - low;
    r3 = close + (range * 1.1) / 4;
    r2 = close + (range * 1.1) / 6;
    r1 = close + (range * 1.1) / 12;
    p = close;
    s1 = close - (range * 1.1) / 12;
    s2 = close - (range * 1.1) / 6;
    s3 = close - (range * 1.1) / 4;
  } else if (type === "fibonacci") {
    p = (high + low + close) / 3;
    const range = high - low;
    r1 = p + range * 0.382;
    r2 = p + range * 0.618;
    r3 = p + range * 1.0;
    s1 = p - range * 0.382;
    s2 = p - range * 0.618;
    s3 = p - range * 1.0;
  } else {
    p = (high + low + close) / 3;
    r1 = p * 2 - low;
    s1 = p * 2 - high;
    r2 = p + (high - low);
    s2 = p - (high - low);
    r3 = high + (p - low) * 2;
    s3 = low - (high - p) * 2;
  }

  return {
    pivots: {
      classic: {
        p,
        r1,
        r2,
        r3,
        s1,
        s2,
        s3,
      },
    },
    basis: {
      high,
      low,
      close,
      open,
    },
  };
}

function getEmptyPivots() {
  return {
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
    basis: {
      high: 0,
      low: 0,
      close: 0,
      open: 0,
    },
  };
}

export function getRsiAction(
  val: number | Decimal | null,
  overbought: number,
  oversold: number,
) {
  if (!val) return "Neutral";
  const v = val instanceof Decimal ? val.toNumber() : val;
  if (v >= overbought) return "Sell";
  if (v <= oversold) return "Buy";
  return "Neutral";
}

// --- Specific Indicators Object (Legacy / UI Support) ---
export const indicators = {
  calculateRSI(
    prices: (number | string | Decimal)[],
    period: number = 14,
  ): Decimal | null {
    if (prices.length < period + 1) return null;
    const nums = prices.map((p) => toNumFast(p));
    // RSI returns Float64Array now, but accessing by index still works
    const rsiArr = JSIndicators.rsi(nums, period);
    const last = rsiArr[rsiArr.length - 1];
    return new Decimal(last);
  },

  calculateSMA(
    data: (number | string | Decimal)[],
    period: number,
  ): Decimal | null {
    if (data.length < period) return null;
    const nums = data.map((p) => toNumFast(p));
    const res = JSIndicators.sma(nums, period);
    return new Decimal(res[res.length - 1]);
  },

  calculateEMA(
    data: (number | string | Decimal)[],
    period: number,
  ): Decimal | null {
    if (data.length < period) return null;
    const nums = data.map((p) => toNumFast(p));
    const res = JSIndicators.ema(nums, period);
    return new Decimal(res[res.length - 1]);
  },
};
