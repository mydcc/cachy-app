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
import type { NumberArray } from "./indicatorTypes";

// --- Types ---

export interface Kline {
  time: number;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: Decimal;
}

export type { NumberArray };

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

      if ((i - startIdx) % period === 0) {
        // Resynchronise both sums from the window itself once per period.
        // The O(1) update below feeds `sum`'s rounding error into `wmaSum` on
        // every step, so without this the drift grew with series length —
        // 2.9e-8 at BTC scale over 5000 candles, amplified again by HMA
        // (BUG-0450). One resync per period keeps the whole loop O(n) and the
        // error at one window's worth, wherever in the series it is.
        sum = 0;
        wmaSum = 0;
        for (let k = 0; k < period; k++) {
          const v = data[i - period + 1 + k];
          sum += v;
          wmaSum += v * (k + 1);
        }
      } else {
        // WMA_t = WMA_{t-1} + n*P_t - Sum_{t-1}
        wmaSum = wmaSum + period * addVal - sum;
        sum = sum - dropVal + addVal;
      }

      result[i] = wmaSum / denominator;
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

  vwma(
    price: NumberArray,
    volume: NumberArray,
    period: number,
    out?: Float64Array
  ): Float64Array {
    const len = price.length;
    const result = (out && out.length === len) ? out : new Float64Array(len);
    result.fill(NaN);

    if (len < period) return result;

    let sumPv = 0;
    let sumV = 0;

    for (let i = 0; i < period; i++) {
        sumPv += price[i] * volume[i];
        sumV += volume[i];
    }

    result[period - 1] = sumV === 0 ? 0 : sumPv / sumV;

    for (let i = period; i < len; i++) {
        const dropPv = price[i - period] * volume[i - period];
        const dropV = volume[i - period];
        const addPv = price[i] * volume[i];
        const addV = volume[i];

        sumPv = sumPv - dropPv + addPv;
        sumV = sumV - dropV + addV;

        result[i] = sumV === 0 ? 0 : sumPv / sumV;
    }

    return result;
  },

  hma(
    data: NumberArray,
    period: number,
    out?: Float64Array,
  ): Float64Array {
    const len = data.length;
    const result = (out && out.length === len) ? out : new Float64Array(len);
    result.fill(NaN);

    if (len < period) return result;

    // HMA = WMA(2 * WMA(n/2) - WMA(n), sqrt(n))
    const halfPeriod = Math.floor(period / 2);
    const sqrtPeriod = Math.floor(Math.sqrt(period));

    const wmaHalf = this.wma(data, halfPeriod);
    const wmaFull = this.wma(data, period);
    const combined = new Float64Array(len);

    for(let i=0; i<len; i++) {
        combined[i] = 2 * wmaHalf[i] - wmaFull[i];
    }

    return this.wma(combined, sqrtPeriod, result);
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

  /**
   * Wilder's ADX line. One implementation with `calculateADXSeries`, which also
   * returns the two directional indicators: the two were separate copies before
   * and both seeded from a first candle that has no movement (BUG-0459).
   */
  adx(
    high: NumberArray,
    low: NumberArray,
    close: NumberArray,
    period: number,
    out?: Float64Array,
  ): Float64Array {
    const { adx } = calculateADXSeries(high, low, close, period, period);
    if (!out || out.length !== adx.length) return adx;
    out.set(adx);
    return out;
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
    // The first candle has no previous close, so it has no true range. NaN,
    // not 0: `smma` starts after leading NaNs, so the first ATR is the mean of
    // the first `period` real true ranges — the WASM core's seed. A 0 here
    // dragged that mean and every Wilder step after it down (BUG-0456).
    tr[0] = NaN;

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

    // Standard Deviation Calculation
    // We use a 2-pass approach (calculate SMA, then calculate variance loop)
    // to avoid catastrophic cancellation errors with high-value assets (e.g. BTC > 100k).
    // The naive method (E[x^2] - (E[x])^2) is O(N) but imprecise.
    // This loop method is O(N*P) which is fine for small P (typically 20).

    for (let i = period - 1; i < len; i++) {
      const avg = sma[i];
      let sumSqDiff = 0;

      // Iterate over the window
      for (let j = 0; j < period; j++) {
        const val = data[i - j];
        const diff = val - avg;
        sumSqDiff += diff * diff;
      }

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
    close: NumberArray,
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

    const displacement = laggingSpan2;

    const currentSpanA = new Float64Array(len).fill(NaN);
    const currentSpanB = new Float64Array(len).fill(NaN);

    for (let i = displacement; i < len; i++) {
      currentSpanA[i] = spanA[i - displacement];
      currentSpanB[i] = spanB[i - displacement];
    }

    // Chikou (lagging) span: the close of t+displacement plotted at t.
    const lagging = new Float64Array(len).fill(NaN);
    for (let i = 0; i < len - displacement; i++) {
      lagging[i] = close[i + displacement];
    }

    return {
      conversion,
      base,
      spanA: currentSpanA,
      spanB: currentSpanB,
      lagging,
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
    const atr = this.atr(high, low, close, period);
    const len = close.length;
    const upper = new Float64Array(len).fill(NaN);
    const lower = new Float64Array(len).fill(NaN);
    const value = new Float64Array(len).fill(NaN);
    const trend = new Int8Array(len).fill(0); // 1 = up, -1 = down, 0 = no value yet

    // The first candle with an ATR starts from its basic bands, in an uptrend —
    // the WASM core's seed. The bands used to start as NaN, and every later
    // candle compared against them, so none ever had a value (BUG-0458).
    const seed = atr.findIndex((v) => Number.isFinite(v));
    if (seed === -1) return { trend, value, upper, lower };

    for (let i = seed; i < len; i++) {
      const hl2 = (high[i] + low[i]) / 2;
      const basicUpper = hl2 + multiplier * atr[i];
      const basicLower = hl2 - multiplier * atr[i];

      if (i === seed) {
        upper[i] = basicUpper;
        lower[i] = basicLower;
        trend[i] = 1;
      } else {
        // A band only tightens while the close stays inside it, and resets to
        // the basic band once the previous close broke through it.
        upper[i] = basicUpper < upper[i - 1] || close[i - 1] > upper[i - 1] ? basicUpper : upper[i - 1];
        lower[i] = basicLower > lower[i - 1] || close[i - 1] < lower[i - 1] ? basicLower : lower[i - 1];
        // The trend flips on a close through this candle's band, as the WASM
        // core and TradingView's `ta.supertrend` decide it.
        const previous = trend[i - 1];
        trend[i] = previous === 1 ? (close[i] < lower[i] ? -1 : 1) : close[i] > upper[i] ? 1 : -1;
      }
      value[i] = trend[i] === 1 ? lower[i] : upper[i];
    }

    return { trend, value, upper, lower };
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

  psar(high: NumberArray, low: NumberArray, start: number = 0.02, increment: number = 0.02, max: number = 0.2): Float64Array {
    const result = new Float64Array(high.length).fill(NaN);
    if (high.length < 2) return result;

    let isLong = true;
    let af = start;
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
          af = start;
        }
      } else {
        if (high[i] > nextSar) {
          isLong = true;
          reversed = true;
          nextSar = ep;
          ep = high[i];
          af = start;
        }
      }

      if (!reversed) {
        // Update AF and EP
        if (isLong) {
          if (high[i] > ep) {
            ep = high[i];
            af = Math.min(af + increment, max);
          }
        } else {
          if (low[i] < ep) {
            ep = low[i];
            af = Math.min(af + increment, max);
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

  ao(
    high: NumberArray,
    low: NumberArray,
    fastPeriod: number,
    slowPeriod: number,
    out?: Float64Array,
  ): Float64Array {
    return calculateAwesomeOscillator(high, low, fastPeriod, slowPeriod, out);
  },
};

// --- Helpers (Decimals, used by Service/Worker logic requiring precision) ---

export function calculateAwesomeOscillator(
  high: NumberArray,
  low: NumberArray,
  fastPeriod: number,
  slowPeriod: number,
  out?: Float64Array,
): Float64Array {
  const len = high.length;
  const result = out && out.length === len ? out : new Float64Array(len);

  // We need running sums for SMAs
  let fastSum = 0;
  let slowSum = 0;

  for (let i = 0; i < len; i++) {
    const hl2 = (high[i] + low[i]) / 2;

    fastSum += hl2;
    slowSum += hl2;

    if (i >= fastPeriod) {
      const oldFast = (high[i - fastPeriod] + low[i - fastPeriod]) / 2;
      fastSum -= oldFast;
    }

    if (i >= slowPeriod) {
      const oldSlow = (high[i - slowPeriod] + low[i - slowPeriod]) / 2;
      slowSum -= oldSlow;
    }

    let fastSMA = 0;
    let slowSMA = 0;

    if (i >= fastPeriod - 1) {
      fastSMA = fastSum / fastPeriod;
    }

    if (i >= slowPeriod - 1) {
      slowSMA = slowSum / slowPeriod;
    }

    // Usually we only care if the slow SMA is valid
    if (i >= slowPeriod - 1) {
      result[i] = fastSMA - slowSMA;
    } else {
      result[i] = 0;
    }
  }

  return result;
}

export function calculateMFI(
  high: NumberArray,
  low: NumberArray,
  close: NumberArray,
  vol: NumberArray,
  period: number
): number {
  const len = close.length;
  if (len < period + 1) return 0;

  // We need to look at the last 'period' changes.
  // Changes are defined between i-1 and i.
  // So we need indices from len - period to len - 1.
  // And for each i, we compare with i-1.
  // So we need data starting from len - period - 1.

  let posFlow = 0;
  let negFlow = 0;

  const start = len - period;

  // Calculate TP for previous day (start - 1)
  let prevTP = (high[start - 1] + low[start - 1] + close[start - 1]) / 3;

  for (let i = start; i < len; i++) {
    const tp = (high[i] + low[i] + close[i]) / 3;
    const rawFlow = tp * vol[i];

    if (tp > prevTP) {
      posFlow += rawFlow;
    } else if (tp < prevTP) {
      negFlow += rawFlow;
    }
    // if tp == prevTP, flow is discarded (typical MFI behavior)

    prevTP = tp;
  }

  if (negFlow === 0) return 100; // Avoid div by zero, max value

  const mfr = posFlow / negFlow;
  return 100 - (100 / (1 + mfr));
}

export function calculateCCI(
  high: NumberArray,
  low: NumberArray,
  close: NumberArray,
  period: number
): number {
  const len = close.length;
  if (len < period) return 0;

  // 1. Compute TPs for the window
  // We need to store them to calculate MeanDev later
  // Avoiding generic array alloc? We can use a small stack buffer if period is small,
  // but standard JS array is fine for small period (20).
  const tps = new Float64Array(period);
  let sum = 0;

  const start = len - period;
  for (let i = 0; i < period; i++) {
    const idx = start + i;
    const tp = (high[idx] + low[idx] + close[idx]) / 3;
    tps[i] = tp;
    sum += tp;
  }

  const sma = sum / period;

  let sumAbsDiff = 0;
  for (let i = 0; i < period; i++) {
    sumAbsDiff += Math.abs(tps[i] - sma);
  }

  const meanDev = sumAbsDiff / period;

  if (meanDev === 0) return 0;
  return (tps[period - 1] - sma) / (0.015 * meanDev);
}

export function calculateCCISeries(
  high: NumberArray,
  low: NumberArray,
  close: NumberArray,
  period: number,
  out?: Float64Array
): Float64Array {
  const len = close.length;
  const result = (out && out.length === len) ? out : new Float64Array(len);
  result.fill(NaN);

  if (len < period) return result;

  const tpBuf = new Float64Array(period);
  let sum = 0;
  let ptr = 0;

  // Initialize first window
  for (let i = 0; i < period; i++) {
      const tp = (high[i] + low[i] + close[i]) / 3;
      tpBuf[i] = tp;
      sum += tp;
  }

  // Calculate first point (at index period-1)
  let sma = sum / period;
  let sumAbsDiff = 0;
  for (let j = 0; j < period; j++) {
      sumAbsDiff += Math.abs(tpBuf[j] - sma);
  }
  let meanDev = sumAbsDiff / period;
  // Last added TP was at index period-1
  result[period - 1] = meanDev === 0 ? 0 : (tpBuf[period - 1] - sma) / (0.015 * meanDev);

  // Iterate the rest
  for (let i = period; i < len; i++) {
      const tp = (high[i] + low[i] + close[i]) / 3;

      const oldTP = tpBuf[ptr];
      sum = sum - oldTP + tp;

      tpBuf[ptr] = tp;

      // Calculate results
      sma = sum / period;

      sumAbsDiff = 0;
      for (let j = 0; j < period; j++) {
          sumAbsDiff += Math.abs(tpBuf[j] - sma);
      }
      meanDev = sumAbsDiff / period;

      result[i] = meanDev === 0 ? 0 : (tp - sma) / (0.015 * meanDev);

      ptr = (ptr + 1) % period;
  }

  return result;
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

  // Deliberately uninitialised: every `type` branch below, including the final
  // `else`, assigns all seven. With `strict: true` TypeScript now fails the
  // build if a future branch forgets one, instead of silently emitting a pivot
  // of 0 — which would look like a real price level.
  let p: number;
  let r1: number, r2: number, r3: number;
  let s1: number, s2: number, s3: number;

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

  calculateWMA(
    data: (number | string | Decimal)[],
    period: number,
  ): Decimal | null {
    if (data.length < period) return null;
    const nums = data.map((p) => toNumFast(p));
    const res = JSIndicators.wma(nums, period);
    return new Decimal(res[res.length - 1]);
  },

  calculateVWMA(
    prices: (number | string | Decimal)[],
    volumes: (number | string | Decimal)[],
    period: number,
  ): Decimal | null {
    if (prices.length < period) return null;
    const p = prices.map((v) => toNumFast(v));
    const v = volumes.map((v) => toNumFast(v));
    const res = JSIndicators.vwma(p, v, period);
    return new Decimal(res[res.length - 1]);
  },

  calculateHMA(
    data: (number | string | Decimal)[],
    period: number,
  ): Decimal | null {
    if (data.length < period) return null;
    const nums = data.map((p) => toNumFast(p));
    const res = JSIndicators.hma(nums, period);
    return new Decimal(res[res.length - 1]);
  },

  calculateMACD(
    data: (number | string | Decimal)[],
    fast: number = 12,
    slow: number = 26,
    signal: number = 9,
  ) {
    if (data.length < slow) return null;
    const nums = data.map((p) => toNumFast(p));
    const res = JSIndicators.macd(nums, fast, slow, signal);
    const idx = res.macd.length - 1;
    return {
      macd: new Decimal(res.macd[idx]),
      signal: new Decimal(res.signal[idx]),
      histogram: new Decimal(res.macd[idx] - res.signal[idx]),
    };
  },

  calculateStochastic(
    high: (number | string | Decimal)[],
    low: (number | string | Decimal)[],
    close: (number | string | Decimal)[],
    kPeriod: number = 14,
    dPeriod: number = 3,
    kSmoothing: number = 3,
  ) {
    if (close.length < kPeriod) return null;
    const h = high.map((v) => toNumFast(v));
    const l = low.map((v) => toNumFast(v));
    const c = close.map((v) => toNumFast(v));

    let kLine = JSIndicators.stoch(h, l, c, kPeriod);

    // Smoothing K
    let smoothedK = kLine;
    if (kSmoothing > 1) {
      smoothedK = JSIndicators.sma(kLine, kSmoothing);
    }

    // D
    const dLine = JSIndicators.sma(smoothedK, dPeriod);

    const idx = kLine.length - 1;
    return {
      k: new Decimal(smoothedK[idx]),
      d: new Decimal(dLine[idx]),
    };
  },

  calculateWilliamsR(
    high: (number | string | Decimal)[],
    low: (number | string | Decimal)[],
    close: (number | string | Decimal)[],
    period: number = 14,
  ): Decimal | null {
    if (close.length < period) return null;
    const h = high.map(toNumFast);
    const l = low.map(toNumFast);
    const c = close.map(toNumFast);
    const res = JSIndicators.williamsR(h, l, c, period);
    return new Decimal(res[res.length - 1]);
  },

  calculateCCI(
    high: (number | string | Decimal)[],
    low: (number | string | Decimal)[],
    close: (number | string | Decimal)[],
    period: number = 20,
  ): Decimal | null {
    if (close.length < period) return null;
    const h = high.map(toNumFast);
    const l = low.map(toNumFast);
    const c = close.map(toNumFast);
    const res = calculateCCISeries(h, l, c, period);
    return new Decimal(res[res.length - 1]);
  },

  calculateADX(
    high: (number | string | Decimal)[],
    low: (number | string | Decimal)[],
    close: (number | string | Decimal)[],
    period: number, smoothingPeriod: number = 14,
  ): Decimal | null {
    if (close.length < period * 2) return null;
    const h = high.map(toNumFast);
    const l = low.map(toNumFast);
    const c = close.map(toNumFast);
    const res = calculateADXSeries(h, l, c, period, smoothingPeriod);
    return new Decimal(res.adx[res.adx.length - 1]);
  },

  calculateAO(
    high: (number | string | Decimal)[],
    low: (number | string | Decimal)[],
    fast: number = 5,
    slow: number = 34,
  ): Decimal | null {
    if (high.length < slow) return null;
    const h = high.map(toNumFast);
    const l = low.map(toNumFast);
    const res = calculateAwesomeOscillator(h, l, fast, slow);
    return new Decimal(res[res.length - 1]);
  },

  calculateMomentum(
    data: (number | string | Decimal)[],
    period: number = 10,
  ): Decimal | null {
    if (data.length < period) return null;
    const nums = data.map(toNumFast);
    const res = JSIndicators.mom(nums, period);
    return new Decimal(res[res.length - 1]);
  },

  calculateIchimoku(
    high: (number | string | Decimal)[],
    low: (number | string | Decimal)[],
    close: (number | string | Decimal)[],
    conversionPeriod: number = 9,
    basePeriod: number = 26,
    spanBPeriod: number = 52,
    displacement: number = 26,
  ) {
    if (high.length < spanBPeriod) return null;
    const h = high.map(toNumFast);
    const l = low.map(toNumFast);
    const c = close.map(toNumFast);
    const res = JSIndicators.ichimoku(
      h,
      l,
      c,
      conversionPeriod,
      basePeriod,
      spanBPeriod,
      displacement,
    );
    const idx = res.conversion.length - 1;
    return {
      conversion: new Decimal(res.conversion[idx]),
      base: new Decimal(res.base[idx]),
      spanA: new Decimal(res.spanA[idx]),
      spanB: new Decimal(res.spanB[idx]),
      lagging: new Decimal(res.lagging[idx]),
    };
  },

  calculatePivots(
    klines: Kline[],
    type: string = "classic",
  ) {
    return calculatePivots(klines, type);
  },

  calculateATR(
    high: (number | string | Decimal)[],
    low: (number | string | Decimal)[],
    close: (number | string | Decimal)[],
    period: number = 14,
  ): Decimal | null {
    // A full period of true ranges needs one candle more: the first has none.
    if (close.length < period + 1) return null;
    const h = high.map(toNumFast);
    const l = low.map(toNumFast);
    const c = close.map(toNumFast);
    const res = JSIndicators.atr(h, l, c, period);
    return new Decimal(res[res.length - 1]);
  },

  calculateBollingerBands(
    data: (number | string | Decimal)[],
    period: number = 20,
    stdDev: number = 2,
  ) {
    if (data.length < period) return null;
    const nums = data.map(toNumFast);
    const res = JSIndicators.bb(nums, period, stdDev);
    const idx = res.middle.length - 1;
    return {
      middle: new Decimal(res.middle[idx]),
      upper: new Decimal(res.upper[idx]),
      lower: new Decimal(res.lower[idx]),
    };
  },

  calculateChoppiness(
    high: (number | string | Decimal)[],
    low: (number | string | Decimal)[],
    close: (number | string | Decimal)[],
    period: number = 14,
  ): Decimal | null {
    if (close.length < period) return null;
    const h = high.map(toNumFast);
    const l = low.map(toNumFast);
    const c = close.map(toNumFast);
    const res = JSIndicators.choppiness(h, l, c, period);
    return new Decimal(res[res.length - 1]);
  },

  calculateSuperTrend(
    high: (number | string | Decimal)[],
    low: (number | string | Decimal)[],
    close: (number | string | Decimal)[],
    period: number = 10,
    factor: number = 3,
  ) {
    // A full period of true ranges needs one candle more: the first has none.
    if (close.length < period + 1) return null;
    const h = high.map(toNumFast);
    const l = low.map(toNumFast);
    const c = close.map(toNumFast);
    const res = JSIndicators.superTrend(h, l, c, period, factor);
    const idx = res.value.length - 1;
    return {
      value: new Decimal(res.value[idx]),
      trend: res.trend[idx],
    };
  },

  calculateATRTrailingStop(
    high: (number | string | Decimal)[],
    low: (number | string | Decimal)[],
    close: (number | string | Decimal)[],
    period: number = 14,
    multiplier: number = 3.5,
  ) {
    if (close.length < period) return null;
    const h = high.map(toNumFast);
    const l = low.map(toNumFast);
    const c = close.map(toNumFast);
    const res = JSIndicators.atrTrailingStop(h, l, c, period, multiplier);
    const idx = res.buyStop.length - 1;
    return {
      buy: new Decimal(res.buyStop[idx]),
      sell: new Decimal(res.sellStop[idx]),
    };
  },

  calculateOBV(
    close: (number | string | Decimal)[],
    volume: (number | string | Decimal)[],
  ): Decimal | null {
    if (close.length < 2) return null;
    const c = close.map(toNumFast);
    const v = volume.map(toNumFast);
    const res = JSIndicators.obv(c, v);
    return new Decimal(res[res.length - 1]);
  },

  calculateMFI(
    high: (number | string | Decimal)[],
    low: (number | string | Decimal)[],
    close: (number | string | Decimal)[],
    volume: (number | string | Decimal)[],
    period: number = 14,
  ): Decimal | null {
    if (close.length < period + 1) return null;
    const h = high.map(toNumFast);
    const l = low.map(toNumFast);
    const c = close.map(toNumFast);
    const v = volume.map(toNumFast);
    const res = calculateMFI(h, l, c, v, period);
    return new Decimal(res);
  },

  calculateVWAP(
    high: (number | string | Decimal)[],
    low: (number | string | Decimal)[],
    close: (number | string | Decimal)[],
    volume: (number | string | Decimal)[],
    time?: number[],
    anchor: { mode: "session" | "fixed"; anchorPoint?: number } = {
      mode: "session",
    },
  ): Decimal | null {
    if (close.length == 0) return null;
    const h = high.map(toNumFast);
    const l = low.map(toNumFast);
    const c = close.map(toNumFast);
    const v = volume.map(toNumFast);

    const res = JSIndicators.vwap(h, l, c, v, time, anchor);
    return new Decimal(res[res.length - 1]);
  },

  calculateParabolicSAR(
    high: (number | string | Decimal)[],
    low: (number | string | Decimal)[],
    start: number = 0.02,
    increment: number = 0.02,
    max: number = 0.2,
  ): Decimal | null {
    if (high.length < 2) return null;
    const h = high.map(toNumFast);
    const l = low.map(toNumFast);
    const res = JSIndicators.psar(h, l, start, increment, max);
    return new Decimal(res[res.length - 1]);
  },

  calculateVolumeProfile(
    high: (number | string | Decimal)[],
    low: (number | string | Decimal)[],
    close: (number | string | Decimal)[],
    volume: (number | string | Decimal)[],
    rowCount: number = 24,
  ) {
    if (close.length == 0) return null;
    const h = high.map(toNumFast);
    const l = low.map(toNumFast);
    const c = close.map(toNumFast);
    const v = volume.map(toNumFast);

    const res = JSIndicators.volumeProfile(h, l, c, v, rowCount);
    if (!res) return null;

    return {
      poc: new Decimal(res.poc),
      vaHigh: new Decimal(res.vaHigh),
      vaLow: new Decimal(res.vaLow),
      rows: res.rows.map((r) => ({
        priceStart: new Decimal(r.priceStart),
        priceEnd: new Decimal(r.priceEnd),
        volume: new Decimal(r.volume),
      })),
    };
  },
};

/**
 * Wilder's directional movement, as TradingView's `ta.dmi` computes it.
 *
 * The first candle has no previous candle, so it has no true range and no
 * directional movement: NaN, not 0. `smma` starts after leading NaNs, so each
 * smoothing starts from the mean of the first `period` real values, at candle
 * `period`, and the ADX from the mean of the first `smoothingPeriod` DX values,
 * at candle `period + smoothingPeriod - 1`. A 0 there dragged every average
 * after it and gave the ADX one candle too early (BUG-0459).
 *
 * NaN wherever a line has no value yet.
 */
export function calculateADXSeries(
  high: NumberArray,
  low: NumberArray,
  close: NumberArray,
  period: number, smoothingPeriod: number = 14
): { adx: Float64Array; pdi: Float64Array; mdi: Float64Array } {
  const len = close.length;
  const upMove = new Float64Array(len);
  const downMove = new Float64Array(len);
  const tr = new Float64Array(len);
  upMove[0] = downMove[0] = tr[0] = NaN;

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

  const plusDM_S = JSIndicators.smma(upMove, period);
  const minusDM_S = JSIndicators.smma(downMove, period);
  const tr_S = JSIndicators.smma(tr, period);

  const pdi = new Float64Array(len);
  const mdi = new Float64Array(len);
  const dx = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    // No true range over the window means no direction either way, as in WASM.
    const trVal = tr_S[i] === 0 ? 1 : tr_S[i];
    pdi[i] = (plusDM_S[i] / trVal) * 100;
    mdi[i] = (minusDM_S[i] / trVal) * 100;

    const sum = pdi[i] + mdi[i];
    dx[i] = sum === 0 ? 0 : (Math.abs(pdi[i] - mdi[i]) / sum) * 100;
  }

  const adx = JSIndicators.smma(dx, smoothingPeriod || period);
  return { adx, pdi, mdi };
}
