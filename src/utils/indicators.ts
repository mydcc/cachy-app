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

import { Decimal } from "decimal.js";
import { BufferPool } from "./bufferPool";
import type { Kline, PivotLevels } from "../services/technicalsTypes";

export type { Kline };

// Use native Number or Decimal for input
// Internal calc uses number[] or Float64Array for speed.
export type NumberArray = number[] | Float64Array;

function toNumFast(v: number | string | Decimal): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v);
  return v.toNumber();
}

function slidingWindowMax(
  data: NumberArray,
  period: number,
  out: Float64Array,
) {
  const len = data.length;
  // Simple O(N*K) implementation for robustness.
  // Optimization: Monotonic Queue O(N)
  for (let i = period - 1; i < len; i++) {
    let maxVal = -Infinity;
    for (let j = 0; j < period; j++) {
      const val = data[i - j];
      if (val > maxVal) maxVal = val;
    }
    out[i] = maxVal;
  }
}

function slidingWindowMin(
  data: NumberArray,
  period: number,
  out: Float64Array,
) {
  const len = data.length;
  for (let i = period - 1; i < len; i++) {
    let minVal = Infinity;
    for (let j = 0; j < period; j++) {
      const val = data[i - j];
      if (val < minVal) minVal = val;
    }
    out[i] = minVal;
  }
}

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

  updateEma(prevEma: number, price: number, period: number): number {
      const k = 2 / (period + 1);
      return (price - prevEma) * k + prevEma;
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

  updateRsi(prevAvgGain: number, prevAvgLoss: number, price: number, prevPrice: number, period: number) {
      const diff = price - prevPrice;
      const gain = diff >= 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;
      const avgGain = (prevAvgGain * (period - 1) + gain) / period;
      const avgLoss = (prevAvgLoss * (period - 1) + loss) / period;
      const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      return { rsi, avgGain, avgLoss };
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
      const len = data.length;
      const res = new Float64Array(len).fill(NaN);
      for (let i = period; i < len; i++) {
          res[i] = data[i] - data[i - period];
      }
      return res;
  },

  williamsR(high: NumberArray, low: NumberArray, close: NumberArray, period: number): Float64Array {
      const len = close.length;
      const res = new Float64Array(len).fill(NaN);
      for (let i = period - 1; i < len; i++) {
          let maxH = -Infinity;
          let minL = Infinity;
          for (let j = 0; j < period; j++) {
              maxH = Math.max(maxH, high[i - j]);
              minL = Math.min(minL, low[i - j]);
          }
          res[i] = ((maxH - close[i]) / (maxH - minL)) * -100;
      }
      return res;
  },

  adx(high: NumberArray, low: NumberArray, close: NumberArray, period: number, out?: Float64Array, pool?: BufferPool): Float64Array {
      const len = close.length;
      const tr = new Float64Array(len);
      const dmPlus = new Float64Array(len);
      const dmMinus = new Float64Array(len);

      for(let i=1; i<len; i++) {
          const h = high[i];
          const l = low[i];
          const cPrev = close[i-1];

          tr[i] = Math.max(h - l, Math.abs(h - cPrev), Math.abs(l - cPrev));

          const up = high[i] - high[i-1];
          const down = low[i-1] - low[i];

          dmPlus[i] = (up > down && up > 0) ? up : 0;
          dmMinus[i] = (down > up && down > 0) ? down : 0;
      }

      const trSmooth = this.smma(tr, period);
      const plusSmooth = this.smma(dmPlus, period);
      const minusSmooth = this.smma(dmMinus, period);

      const dx = new Float64Array(len).fill(NaN);
      for(let i=period*2; i<len; i++) {
          const diPlus = (plusSmooth[i] / trSmooth[i]) * 100;
          const diMinus = (minusSmooth[i] / trSmooth[i]) * 100;
          const sum = diPlus + diMinus;
          dx[i] = sum === 0 ? 0 : (Math.abs(diPlus - diMinus) / sum) * 100;
      }

      return this.smma(dx, period, out);
  },

  atr(high: NumberArray, low: NumberArray, close: NumberArray, period: number): Float64Array {
      const len = close.length;
      const tr = new Float64Array(len);
      tr[0] = high[0] - low[0];

      for(let i=1; i<len; i++) {
          tr[i] = Math.max(high[i] - low[i], Math.abs(high[i] - close[i-1]), Math.abs(low[i] - close[i-1]));
      }
      return this.smma(tr, period);
  },

  bb(data: NumberArray, period: number, stdDev: number, outMiddle?: Float64Array, outUpper?: Float64Array, outLower?: Float64Array) {
      const middle = this.sma(data, period, outMiddle);
      const len = data.length;
      const upper = (outUpper && outUpper.length === len) ? outUpper : new Float64Array(len);
      const lower = (outLower && outLower.length === len) ? outLower : new Float64Array(len);

      for(let i=period-1; i<len; i++) {
          let sumSq = 0;
          for(let j=0; j<period; j++) {
              const diff = data[i-j] - middle[i];
              sumSq += diff * diff;
          }
          const std = Math.sqrt(sumSq / period);
          upper[i] = middle[i] + std * stdDev;
          lower[i] = middle[i] - std * stdDev;
      }

      return { middle, upper, lower };
  },

  superTrend(high: NumberArray, low: NumberArray, close: NumberArray, period: number, factor: number) {
      const len = close.length;
      const atr = this.atr(high, low, close, period);
      const upperBand = new Float64Array(len);
      const lowerBand = new Float64Array(len);
      const superTrend = new Float64Array(len);
      const trend = new Int8Array(len);
      trend.fill(1); // Default to bull (1)

      for (let i = period; i < len; i++) {
          const hl2 = (high[i] + low[i]) / 2;
          const matr = factor * atr[i];

          let ub = hl2 + matr;
          let lb = hl2 - matr;

          if (i > 0) {
              if (close[i-1] > lowerBand[i-1]) lb = Math.max(lb, lowerBand[i-1]);
              else lb = lb;

              if (close[i-1] < upperBand[i-1]) ub = Math.min(ub, upperBand[i-1]);
              else ub = ub;
          }

          lowerBand[i] = lb;
          upperBand[i] = ub;

          let dir = 1;
          if (i > 0) {
              dir = trend[i-1];
              if (dir === 1 && close[i] < lowerBand[i-1]) dir = -1;
              else if (dir === -1 && close[i] > upperBand[i-1]) dir = 1;
          }

          trend[i] = dir;
          superTrend[i] = dir === 1 ? lowerBand[i] : upperBand[i];
      }

      return { value: superTrend, trend };
  },

  atrTrailingStop(high: NumberArray, low: NumberArray, close: NumberArray, period: number, multiplier: number) {
      const st = this.superTrend(high, low, close, period, multiplier);
      const buyStop = new Float64Array(st.value.length);
      const sellStop = new Float64Array(st.value.length);
      for(let i=0; i<st.value.length; i++) {
          if (st.trend[i] === 1) buyStop[i] = st.value[i];
          else sellStop[i] = st.value[i];
      }
      return { buyStop, sellStop };
  },

  obv(close: NumberArray, volume: NumberArray): Float64Array {
      const len = close.length;
      const res = new Float64Array(len);
      let currentObv = 0;
      res[0] = 0;
      for(let i=1; i<len; i++) {
          if (close[i] > close[i-1]) currentObv += volume[i];
          else if (close[i] < close[i-1]) currentObv -= volume[i];
          res[i] = currentObv;
      }
      return res;
  },

  volumeProfile(high: NumberArray, low: NumberArray, close: NumberArray, volume: NumberArray, rowCount: number) {
      let min = Infinity, max = -Infinity;
      for(let i=0; i<high.length; i++) {
          if (high[i] > max) max = high[i];
          if (low[i] < min) min = low[i];
      }
      if (min === Infinity) return null;

      const range = max - min;
      const rowSize = range / rowCount;
      const rows = new Array(rowCount).fill(0).map((_, i) => ({
          priceStart: min + i * rowSize,
          priceEnd: min + (i + 1) * rowSize,
          volume: 0
      }));

      let totalVol = 0;
      for(let i=0; i<close.length; i++) {
          const avg = (high[i] + low[i] + close[i]) / 3;
          const rowIdx = Math.min(Math.floor((avg - min) / rowSize), rowCount - 1);
          if (rowIdx >= 0) {
              rows[rowIdx].volume += volume[i];
              totalVol += volume[i];
          }
      }

      let maxVol = 0;
      let pocIdx = 0;
      rows.forEach((r, i) => {
          if (r.volume > maxVol) {
              maxVol = r.volume;
              pocIdx = i;
          }
      });

      const poc = (rows[pocIdx].priceStart + rows[pocIdx].priceEnd) / 2;

      const threshold = totalVol * 0.7;
      let currentVol = maxVol;
      let upIdx = pocIdx;
      let downIdx = pocIdx;

      while (currentVol < threshold && (upIdx < rowCount - 1 || downIdx > 0)) {
          const upVol = upIdx < rowCount - 1 ? rows[upIdx + 1].volume : 0;
          const downVol = downIdx > 0 ? rows[downIdx - 1].volume : 0;

          if (upVol === 0 && downVol === 0) break;

          if (upVol > downVol) {
              upIdx++;
              currentVol += upVol;
          } else {
              downIdx--;
              currentVol += downVol;
          }
      }

      return {
          poc,
          vaHigh: rows[upIdx].priceEnd,
          vaLow: rows[downIdx].priceStart,
          rows
      };
  },

  vwap(high: NumberArray, low: NumberArray, close: NumberArray, volume: NumberArray, times: NumberArray | undefined, anchor: { mode: "session" | "fixed" | string; anchorPoint?: number }) {
      const len = close.length;
      const res = new Float64Array(len);
      let sumPv = 0;
      let sumV = 0;
      let currentDay = -1;

      for(let i=0; i<len; i++) {
          if (times && anchor.mode === 'session') {
              const date = new Date(times[i]);
              const day = date.getUTCDate();
              if (day !== currentDay) {
                  sumPv = 0;
                  sumV = 0;
                  currentDay = day;
              }
          }

          const avg = (high[i] + low[i] + close[i]) / 3;
          sumPv += avg * volume[i];
          sumV += volume[i];
          res[i] = sumV === 0 ? avg : sumPv / sumV;
      }
      return res;
  },

  psar(high: NumberArray, low: NumberArray, start: number, increment: number, max: number): Float64Array {
      const len = high.length;
      const res = new Float64Array(len);
      let isRising = true;
      let sar = low[0];
      let ep = high[0];
      let af = start;

      res[0] = sar;

      for(let i=1; i<len; i++) {
          sar = sar + af * (ep - sar);

          if (isRising) {
              if (high[i] > ep) {
                  ep = high[i];
                  af = Math.min(af + increment, max);
              }
              if (low[i] < sar) {
                  isRising = false;
                  sar = ep;
                  ep = low[i];
                  af = start;
              }
          } else {
              if (low[i] < ep) {
                  ep = low[i];
                  af = Math.min(af + increment, max);
              }
              if (high[i] > sar) {
                  isRising = true;
                  sar = ep;
                  ep = high[i];
                  af = start;
              }
          }
          res[i] = sar;
      }
      return res;
  },

  choppiness(high: NumberArray, low: NumberArray, close: NumberArray, period: number): Float64Array {
      const len = close.length;
      const res = new Float64Array(len);
      const tr = this.atr(high, low, close, 1);

      for(let i=period; i<len; i++) {
          let sumTr = 0;
          let maxH = -Infinity;
          let minL = Infinity;
          for(let j=0; j<period; j++) {
              sumTr += tr[i-j];
              maxH = Math.max(maxH, high[i-j]);
              minL = Math.min(minL, low[i-j]);
          }
          const range = maxH - minL;
          if (range === 0) res[i] = 0;
          else {
              res[i] = 100 * Math.log10(sumTr / range) / Math.log10(period);
          }
      }
      return res;
  },

  ichimoku(high: NumberArray, low: NumberArray, conversionPeriod: number, basePeriod: number, spanBPeriod: number, displacement: number) {
      const len = high.length;
      const conversion = new Float64Array(len);
      const base = new Float64Array(len);
      const spanA = new Float64Array(len);
      const spanB = new Float64Array(len);

      const donchian = (p: number, idx: number) => {
          let h = -Infinity;
          let l = Infinity;
          for(let i=0; i<p; i++) {
              if (idx-i >= 0) {
                  h = Math.max(h, high[idx-i]);
                  l = Math.min(l, low[idx-i]);
              }
          }
          return (h+l)/2;
      };

      for(let i=0; i<len; i++) {
          conversion[i] = donchian(conversionPeriod, i);
          base[i] = donchian(basePeriod, i);

          if (i >= displacement) {
              spanA[i] = (conversion[i-displacement] + base[i-displacement]) / 2;
              const spanBVal = donchian(spanBPeriod, i-displacement);
              spanB[i] = spanBVal;
          } else {
              spanA[i] = NaN;
              spanB[i] = NaN;
          }
      }

      return { conversion, base, spanA, spanB };
  },

  marketStructure(high: NumberArray, low: NumberArray, period: number) {
      const len = high.length;
      const highs: { index: number, value: number, type: "HH" | "LH" }[] = [];
      const lows: { index: number, value: number, type: "LL" | "HL" }[] = [];

      for(let i=period; i<len-period; i++) {
          let isHigh = true;
          let isLow = true;
          for(let j=1; j<=period; j++) {
              if (high[i-j] > high[i] || high[i+j] > high[i]) isHigh = false;
              if (low[i-j] < low[i] || low[i+j] < low[i]) isLow = false;
          }

          if (isHigh) {
              const type = (highs.length > 0 && high[i] > highs[highs.length-1].value) ? "HH" : "LH";
              highs.push({ index: i, value: high[i], type });
          }
          if (isLow) {
              const type = (lows.length > 0 && low[i] < lows[lows.length-1].value) ? "LL" : "HL";
              lows.push({ index: i, value: low[i], type });
          }
      }
      return { highs, lows };
  },

  stochRsi(
    data: NumberArray,
    period: number,
    kPeriod: number,
    dPeriod: number,
    smoothK: number,
    outK?: Float64Array,
    outD?: Float64Array,
    pool?: BufferPool
  ) {
      const rsiVal = this.rsi(data, period);
      let kLine = this.stoch(rsiVal, rsiVal, rsiVal, kPeriod, outK, pool);

      if (smoothK > 1) {
          kLine = this.sma(kLine, smoothK, outK);
      }

      const dLine = this.sma(kLine, dPeriod, outD);

      return {
          k: kLine,
          d: dLine
      };
  },

  // CCI with single source input
  cci(data: NumberArray, period: number, out?: Float64Array): Float64Array {
      const len = data.length;
      const result = (out && out.length === len) ? out : new Float64Array(len);
      result.fill(NaN);

      if (len < period) return result;

      const sma = this.sma(data, period);

      for (let i = period - 1; i < len; i++) {
        let meanDev = 0;
        const avg = sma[i];
        for (let j = 0; j < period; j++) {
          meanDev += Math.abs(data[i - j] - avg);
        }
        meanDev /= period;

        result[i] = meanDev === 0 ? 0 : (data[i] - avg) / (0.015 * meanDev);
      }
      return result;
  },
};

export function calculateCCISeries(
  high: NumberArray,
  low: NumberArray,
  close: NumberArray,
  period: number,
  out?: Float64Array,
): Float64Array {
  const len = close.length;
  const tp = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    tp[i] = (high[i] + low[i] + close[i]) / 3;
  }
  return JSIndicators.cci(tp, period, out);
}

export function calculateMFI(
  high: NumberArray,
  low: NumberArray,
  close: NumberArray,
  volume: NumberArray,
  period: number,
): number {
  const len = close.length;
  if (len < period + 1) return 50;

  let posFlow = 0;
  let negFlow = 0;

  for (let i = len - period; i < len; i++) {
    const tp = (high[i] + low[i] + close[i]) / 3;
    const tpPrev = (high[i - 1] + low[i - 1] + close[i - 1]) / 3;
    const rawFlow = tp * volume[i];

    if (tp > tpPrev) posFlow += rawFlow;
    else if (tp < tpPrev) negFlow += rawFlow;
  }

  if (negFlow === 0) return 100;
  const mfr = posFlow / negFlow;
  return 100 - 100 / (1 + mfr);
}

export function calculateAwesomeOscillator(
  high: NumberArray,
  low: NumberArray,
  fast: number,
  slow: number,
  out?: Float64Array,
): Float64Array {
  const len = high.length;
  const hl2 = new Float64Array(len);
  for (let i = 0; i < len; i++) hl2[i] = (high[i] + low[i]) / 2;

  const smaFast = JSIndicators.sma(hl2, fast);
  const smaSlow = JSIndicators.sma(hl2, slow);

  const result = (out && out.length === len) ? out : new Float64Array(len);
  for (let i = 0; i < len; i++) {
    result[i] = smaFast[i] - smaSlow[i];
  }
  return result;
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

  // 1. Always Calculate Classic Pivots
  let cp = (high + low + close) / 3;
  let cr1 = cp * 2 - low;
  let cs1 = cp * 2 - high;
  let cr2 = cp + (high - low);
  let cs2 = cp - (high - low);
  let cr3 = high + (cp - low) * 2;
  let cs3 = low - (high - cp) * 2;

  const classicPivots = { p: cp, r1: cr1, r2: cr2, r3: cr3, s1: cs1, s2: cs2, s3: cs3 };

  const result: any = { pivots: { classic: classicPivots } };

  // 2. Calculate requested type if different
  if (type === "woodie") {
    let p = (high + low + close * 2) / 4;
    let r1 = p * 2 - low;
    let r2 = p + high - low;
    let s1 = p * 2 - high;
    let s2 = p - high + low;
    let r3 = high + (p - low) * 2;
    let s3 = low - (high - p) * 2;
    result.pivots.woodie = { p, r1, r2, r3, s1, s2, s3 };
  } else if (type === "camarilla") {
    const range = high - low;
    let r4 = close + (range * 1.1) / 2;
    let r3 = close + (range * 1.1) / 4;
    let r2 = close + (range * 1.1) / 6;
    let r1 = close + (range * 1.1) / 12;
    let p = close;
    let s1 = close - (range * 1.1) / 12;
    let s2 = close - (range * 1.1) / 6;
    let s3 = close - (range * 1.1) / 4;
    let s4 = close - (range * 1.1) / 2;
    result.pivots.camarilla = { p, r1, r2, r3, s1, s2, s3, r4, s4 };
  } else if (type === "fibonacci") {
    let p = (high + low + close) / 3;
    const range = high - low;
    let r1 = p + range * 0.382;
    let r2 = p + range * 0.618;
    let r3 = p + range * 1.0;
    let s1 = p - range * 0.382;
    let s2 = p - range * 0.618;
    let s3 = p - range * 1.0;
    result.pivots.fibonacci = { p, r1, r2, r3, s1, s2, s3 };
  }

  return {
    ...result,
    basis: {
      high,
      low,
      close,
      open,
    },
  };
}

export function calculatePivots(klines: Kline[], type: string = "classic") {
  if (klines.length < 2) return getEmptyPivots();
  // Use previous candle for pivots
  const k = klines[klines.length - 2];
  return calculatePivotsFromValues(
    k.high.toNumber(),
    k.low.toNumber(),
    k.close.toNumber(),
    k.open.toNumber(),
    type
  );
}

function getEmptyPivots() {
  return {
    pivots: {
      classic: { p: 0, r1: 0, r2: 0, r3: 0, s1: 0, s2: 0, s3: 0 },
    },
    basis: { high: 0, low: 0, close: 0, open: 0 },
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
    period: number = 14,
  ): Decimal | null {
    if (close.length < period * 2) return null;
    const h = high.map(toNumFast);
    const l = low.map(toNumFast);
    const c = close.map(toNumFast);
    const res = JSIndicators.adx(h, l, c, period);
    return new Decimal(res[res.length - 1]);
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
    conversionPeriod: number = 9,
    basePeriod: number = 26,
    spanBPeriod: number = 52,
    displacement: number = 26,
  ) {
    if (high.length < spanBPeriod) return null;
    const h = high.map(toNumFast);
    const l = low.map(toNumFast);
    const res = JSIndicators.ichimoku(
      h,
      l,
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
    if (close.length < period) return null;
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
    if (close.length < period) return null;
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

  calculateMarketStructure(
    high: (number | string | Decimal)[],
    low: (number | string | Decimal)[],
    period: number = 5,
  ) {
    if (high.length < period * 2 + 1) return null;
    const h = high.map(toNumFast);
    const l = low.map(toNumFast);
    const res = JSIndicators.marketStructure(h, l, period);
    return {
      highs: res.highs.map(p => ({ ...p, value: new Decimal(p.value) })),
      lows: res.lows.map(p => ({ ...p, value: new Decimal(p.value) }))
    };
  },

  calculateVolumeMA(
    volume: (number | string | Decimal)[],
    period: number = 20,
    type: "sma" | "ema" | "wma" = "sma"
  ): Decimal | null {
    if (volume.length < period) return null;
    const v = volume.map(toNumFast);
    let res: Float64Array;

    if (type === 'ema') res = JSIndicators.ema(v, period);
    else if (type === 'wma') res = JSIndicators.wma(v, period);
    else res = JSIndicators.sma(v, period);

    return new Decimal(res[res.length - 1]);
  },
};
