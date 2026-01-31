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
 * 1. JSIndicators: Fast, array-based pure math implementations (number[] -> number[]).
 * 2. indicators: Decimal-based wrappers for UI/Chart precision.
 * 3. Helpers: Pivots, AO, etc.
 */

import { Decimal } from "decimal.js";

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
  sma(data: NumberArray, period: number): number[] {
    const result = new Array(data.length).fill(NaN);
    if (data.length < period) return result;
    let sum = 0;
    for (let i = 0; i < period; i++) sum += data[i];
    result[period - 1] = sum / period;
    for (let i = period; i < data.length; i++) {
      sum = sum - data[i - period] + data[i];
      result[i] = sum / period;
    }
    return result;
  },

  wma(data: NumberArray, period: number): number[] {
    const result = new Array(data.length).fill(NaN);
    if (data.length < period) return result;

    const denominator = (period * (period + 1)) / 2;

    for (let i = period - 1; i < data.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        // data[i] has weight n, data[i-1] has weight n-1...
        // standard WMA: most recent price has heaviest weight
        // j=0 (oldest in window) -> weight 1
        // j=period-1 (newest) -> weight period
        sum += data[i - period + 1 + j] * (j + 1);
      }
      result[i] = sum / denominator;
    }
    return result;
  },

  ema(data: NumberArray, period: number): number[] {
    const result = new Array(data.length).fill(NaN);
    if (data.length < period) return result;
    const k = 2 / (period + 1);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += data[i];
    let currentEma = sum / period;
    result[period - 1] = currentEma;
    for (let i = period; i < data.length; i++) {
      currentEma = (data[i] - currentEma) * k + currentEma;
      result[i] = currentEma;
    }
    return result;
  },

  smma(data: NumberArray, period: number): number[] {
    // Wilder's Smoothing (RMA)
    // alpha = 1 / period
    const result = new Array(data.length).fill(NaN);
    if (data.length < period) return result;

    let sum = 0;
    for (let i = 0; i < period; i++) sum += data[i];
    let currentSmma = sum / period;
    result[period - 1] = currentSmma;

    for (let i = period; i < data.length; i++) {
      // RMA formula: (Prior * (n-1) + Current) / n
      currentSmma = (currentSmma * (period - 1) + data[i]) / period;
      result[i] = currentSmma;
    }
    return result;
  },

  rsi(data: NumberArray, period: number): number[] {
    const result = new Array(data.length).fill(NaN);
    if (data.length <= period) return result;
    let sumGain = 0;
    let sumLoss = 0;
    for (let i = 1; i <= period; i++) {
      const diff = data[i] - data[i - 1];
      if (diff >= 0) sumGain += diff;
      else sumLoss -= diff;
    }
    let avgGain = sumGain / period;
    let avgLoss = sumLoss / period;
    result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

    for (let i = period + 1; i < data.length; i++) {
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
  ): number[] {
    const result = new Array(close.length).fill(NaN);
    if (close.length < kPeriod) return result;
    for (let i = kPeriod - 1; i < close.length; i++) {
      const lookbackHigh = Math.max(...high.slice(i - kPeriod + 1, i + 1));
      const lookbackLow = Math.min(...low.slice(i - kPeriod + 1, i + 1));
      const range = lookbackHigh - lookbackLow;
      result[i] = range === 0 ? 50 : ((close[i] - lookbackLow) / range) * 100;
    }
    return result;
  },

  macd(data: NumberArray, fast: number, slow: number, signal: number) {
    const emaFast = this.ema(data, fast);
    const emaSlow = this.ema(data, slow);
    const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
    const macdSignal = this.ema(macdLine.slice(slow - 1), signal);
    const paddedSignal = new Array(slow - 1).fill(NaN).concat(macdSignal);
    return { macd: macdLine, signal: paddedSignal };
  },

  mom(data: NumberArray, period: number): number[] {
    const result = new Array(data.length).fill(NaN);
    for (let i = period; i < data.length; i++) {
      result[i] = data[i] - data[i - period];
    }
    return result;
  },

  cci(data: NumberArray, period: number): number[] {
    const result = new Array(data.length).fill(NaN);
    if (data.length < period) return result;

    for (let i = period - 1; i < data.length; i++) {
      const slice = data.slice(i - period + 1, i + 1);

      // Calculate SMA using Decimal for precision in Sum if needed, or keeping it fast with numbers?
      // TechnicalsService used Decimal for sum. Let's stick to number for raw speed if consistent,
      // BUT duplicate implementation used Decimal. Let's use Number for performance unless precision is critical here.
      // Actually, CCI is often sensitive. Let's use Number for JSIndicators as it is meant to be "Fast JS".
      // ...wait, the previous worker implementation used Decimal in cci.
      // Let's use simple number math here to match the "Fast" nature of JSIndicators. if higher precision needed, use Decimal variant.

      let sum = 0;
      for (const val of slice) sum += val;
      const sma = sum / period;

      let sumAbsDiff = 0;
      for (const val of slice) {
        sumAbsDiff += Math.abs(val - sma);
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
  ): number[] {
    const result = new Array(close.length).fill(NaN);
    if (close.length < period * 2) return result;

    const upMove = new Array(close.length).fill(0);
    const downMove = new Array(close.length).fill(0);
    const tr = new Array(close.length).fill(0);

    for (let i = 1; i < close.length; i++) {
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

    const plusDI_S = this.smma(upMove, period);
    const minusDI_S = this.smma(downMove, period);
    const tr_S = this.smma(tr, period);

    const dx = new Array(close.length).fill(0);
    for (let i = 0; i < close.length; i++) {
      const pDI = (plusDI_S[i] / (tr_S[i] || 1)) * 100;
      const mDI = (minusDI_S[i] / (tr_S[i] || 1)) * 100;
      const sum = pDI + mDI;
      dx[i] = sum === 0 ? 0 : (Math.abs(pDI - mDI) / sum) * 100;
    }

    return this.smma(dx, period);
  },

  atr(
    high: NumberArray,
    low: NumberArray,
    close: NumberArray,
    period: number,
  ): number[] {
    const result = new Array(close.length).fill(NaN);
    if (close.length < period) return result;
    const tr = new Array(close.length).fill(0);
    for (let i = 1; i < close.length; i++) {
      tr[i] = Math.max(
        high[i] - low[i],
        Math.abs(high[i] - close[i - 1]),
        Math.abs(low[i] - close[i - 1]),
      );
    }
    // ATR is usually a smoothed moving average of TR
    return this.smma(tr, period);
  },

  bb(data: NumberArray, period: number, stdDev: number = 2) {
    const sma = this.sma(data, period);
    const upper = new Array(data.length).fill(NaN);
    const lower = new Array(data.length).fill(NaN);

    for (let i = period - 1; i < data.length; i++) {
      const slice = data.slice(i - period + 1, i + 1);
      const avg = sma[i];
      let sumSqDiff = 0;
      for (const val of slice) sumSqDiff += Math.pow(val - avg, 2);
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
  ): number[] {
    const result = new Array(close.length).fill(NaN);
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
  ): number[] {
    const result = new Array(close.length).fill(NaN);
    if (close.length < period + 1) return result;

    const tp = typicalPrices || close.map((c, i) => (high[i] + low[i] + c) / 3);
    const moneyFlow = new Array(close.length);
    for (let i = 0; i < close.length; i++) moneyFlow[i] = tp[i] * volume[i];

    const posFlow = new Array(close.length).fill(0);
    const negFlow = new Array(close.length).fill(0);

    // 1. Calculate Flows
    for (let i = 1; i < close.length; i++) {
      if (tp[i] > tp[i - 1]) {
        posFlow[i] = moneyFlow[i];
      } else if (tp[i] < tp[i - 1]) {
        negFlow[i] = moneyFlow[i];
      }
    }

    // 2. Sum over period
    for (let i = period; i < close.length; i++) {
      let sumPos = 0;
      let sumNeg = 0;
      for (let j = 0; j < period; j++) {
        sumPos += posFlow[i - j];
        sumNeg += negFlow[i - j];
      }

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
  ) {
    const rsiRaw = this.rsi(data, period);
    // Stoch of RSI
    // Use the stoch function but on RSI data
    // JSIndicators.stoch expects High, Low, Close.
    // For StochRSI, High=RSI, Low=RSI, Close=RSI

    // We need a helper for simple stochastic on a single array
    const stochSingle = (src: NumberArray, len: number) => {
      const res = new Array(src.length).fill(NaN);
      for (let i = len - 1; i < src.length; i++) {
        const slice = src.slice(i - len + 1, i + 1);
        const min = Math.min(...slice);
        const max = Math.max(...slice);
        const range = max - min;
        res[i] = range === 0 ? 50 : ((src[i] - min) / range) * 100;
      }
      return res;
    };

    let kPoints = stochSingle(rsiRaw, kPeriod);

    if (smoothK > 1) {
      kPoints = this.sma(kPoints, smoothK);
    }

    const dPoints = this.sma(kPoints, dPeriod);

    return { k: kPoints, d: dPoints };
  },

  williamsR(
    high: NumberArray,
    low: NumberArray,
    close: NumberArray,
    period: number,
  ): number[] {
    const result = new Array(close.length).fill(NaN);
    if (close.length < period) return result;

    for (let i = period - 1; i < close.length; i++) {
      const highestHigh = Math.max(...high.slice(i - period + 1, i + 1));
      const lowestLow = Math.min(...low.slice(i - period + 1, i + 1));
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
  ): number[] {
    const result = new Array(close.length).fill(NaN);
    if (close.length < period) return result;
    // CI = 100 * LOG10( SUM(ATR(1), n) / ( MaxHi(n) - MinLo(n) ) ) / LOG10(n)

    // First calculate TR for each candle
    const tr = new Array(close.length).fill(0);
    for (let i = 1; i < close.length; i++) {
      tr[i] = Math.max(
        high[i] - low[i],
        Math.abs(high[i] - close[i - 1]),
        Math.abs(low[i] - close[i - 1]),
      );
    }

    const log10n = Math.log10(period);

    for (let i = period; i < close.length; i++) {
      let sumTr = 0;
      for (let j = 0; j < period; j++) sumTr += tr[i - j];

      const maxHigh = Math.max(...high.slice(i - period + 1, i + 1));
      const minLow = Math.min(...low.slice(i - period + 1, i + 1));
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
    // Tenkan-sen (Conversion Line): (9-period high + 9-period low)/2
    // Kijun-sen (Base Line): (26-period high + 26-period low)/2
    // Senkou Span A (Leading Span A): (Conversion Line + Base Line)/2
    // Senkou Span B (Leading Span B): (52-period high + 52-period low)/2
    // Chikou Span (Lagging Span): Close plotted 26 days in the past (handled by UI offset mostly, but here we just return close)

    const getAvg = (len: number, idx: number) => {
      if (idx < len - 1) return 0;
      const h = Math.max(...high.slice(idx - len + 1, idx + 1));
      const l = Math.min(...low.slice(idx - len + 1, idx + 1));
      return (h + l) / 2;
    };

    const len = high.length;
    const conversion = new Array(len).fill(NaN);
    const base = new Array(len).fill(NaN);
    const spanA = new Array(len).fill(NaN);
    const spanB = new Array(len).fill(NaN);
    // const lagging = close.map((c, i) => c); // Just the close price

    for (let i = 0; i < len; i++) {
      conversion[i] = getAvg(conversionPeriod, i);
      base[i] = getAvg(basePeriod, i);
      spanA[i] = (conversion[i] + base[i]) / 2;
      spanB[i] = getAvg(spanBPeriod, i);
    }

    // Span A and B are shifted FORWARD by displacement (usually 26)
    // We will return the raw arrays aligned to current time,
    // the consumer must handle the "future" plotting or we shift array here?
    // Standard: Span A/B value at index `i` is plotted at `i + displacement`.
    // To make it easy for "Current Status" checks:
    // The "Cloud" valid for TODAY (index i) comes from calculations made `displacement` ago.

    const displacement = basePeriod; // Often 26

    // E.g. Cloud at i = SpanA[i-26]
    const currentSpanA = new Array(len).fill(NaN);
    const currentSpanB = new Array(len).fill(NaN);

    for (let i = displacement; i < len; i++) {
      currentSpanA[i] = spanA[i - displacement];
      currentSpanB[i] = spanB[i - displacement];
    }

    return {
      conversion,
      base,
      spanA: currentSpanA, // This is the cloud value "active" at time i
      spanB: currentSpanB, // This is the cloud value "active" at time i
      lagging: [], // Not needed for current signal check usually, visual only
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
    const basicUpper = new Array(len).fill(NaN);
    const basicLower = new Array(len).fill(NaN);
    const finalUpper = new Array(len).fill(NaN);
    const finalLower = new Array(len).fill(NaN);
    const trend = new Array(len).fill(0); // 1 = Bull, -1 = Bear
    // Initialize trend
    trend[0] = 1;

    // Calculation loop
    for (let i = 1; i < len; i++) {
      const hl2 = (high[i] + low[i]) / 2;
      basicUpper[i] = hl2 + multiplier * atr[i];
      basicLower[i] = hl2 - multiplier * atr[i];

      // Final Upper Band Rule
      // If Basic Upper < Prev Final Upper OR Prev Close > Prev Final Upper: use Basic Upper
      // Else use Prev Final Upper
      if (
        basicUpper[i] < finalUpper[i - 1] ||
        close[i - 1] > finalUpper[i - 1]
      ) {
        finalUpper[i] = basicUpper[i];
      } else {
        finalUpper[i] = finalUpper[i - 1];
      }

      // Final Lower Band Rule
      // If Basic Lower > Prev Final Lower OR Prev Close < Prev Final Lower: use Basic Lower
      // Else use Prev Final Lower
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
        // Was Bullish
        if (close[i] < finalLower[i - 1]) currentTrend = -1; // Turned Bearish
      } else {
        // Was Bearish
        if (close[i] > finalUpper[i - 1]) currentTrend = 1; // Turned Bullish
      }
      trend[i] = currentTrend;
    }

    return {
      trend, // 1 or -1
      value: trend.map((t, i) => (t === 1 ? finalLower[i] : finalUpper[i])), // The active line
    };
  },

  atrTrailingStop(
    high: NumberArray,
    low: NumberArray,
    close: NumberArray,
    period: number = 22,
    multiplier: number = 3,
  ) {
    // Chandelier Exit Logic essentially
    // Long Exit = Highest High (period) - ATR * mult
    // Short Exit = Lowest Low (period) + ATR * mult
    const atr = this.atr(high, low, close, period);
    const len = close.length;
    const buyStop = new Array(len).fill(NaN);
    const sellStop = new Array(len).fill(NaN);

    for (let i = period; i < len; i++) {
      const highestHigh = Math.max(...high.slice(i - period + 1, i + 1));
      const lowestLow = Math.min(...low.slice(i - period + 1, i + 1));

      buyStop[i] = highestHigh - atr[i] * multiplier;
      sellStop[i] = lowestLow + atr[i] * multiplier;
    }
    return { buyStop, sellStop };
  },

  obv(close: NumberArray, volume: NumberArray) {
    const result = new Array(close.length).fill(0);
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
    const minPrice = Math.min(...low);
    const maxPrice = Math.max(...high);
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
        // Find start row and end row
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
          // Calculate overlap
          const rStart = rows[r].priceStart;
          const rEnd = rows[r].priceEnd;
          const overlapStart = Math.max(cLow, rStart);
          const overlapEnd = Math.min(cHigh, rEnd);
          const overlap = Math.max(0, overlapEnd - overlapStart);

          // Proportional Volume
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

      if (upVol === 0 && downVol === 0) break; // Should not happen if data exists

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

  psar(high: NumberArray, low: NumberArray, accel: number = 0.02, max: number = 0.2) {
    // Wilder's Parabolic SAR
    const result = new Array(high.length).fill(NaN);
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
          nextSar = ep; // SAR becomes EP on reversal
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
};

// --- Helpers (Decimals, used by Service/Worker logic requiring precision) ---

export function calculateAwesomeOscillator(
  high: NumberArray,
  low: NumberArray,
  fastPeriod: number,
  slowPeriod: number,
  hl2?: NumberArray,
): number {
  const _hl2 = hl2 || high.map((val, i) => (val + low[i]) / 2);

  const getSMA = (data: NumberArray, period: number): number => {
    if (data.length < period) return 0;
    let sum = 0;
    for (let i = data.length - period; i < data.length; i++) {
      sum += data[i];
    }
    return sum / period;
  };

  const fastSMA = getSMA(_hl2, fastPeriod);
  const slowSMA = getSMA(_hl2, slowPeriod);

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
    const nums = prices.map((p) =>
      p instanceof Decimal ? p.toNumber() : new Decimal(p || 0).toNumber(),
    );
    const rsiArr = JSIndicators.rsi(nums, period);
    const last = rsiArr[rsiArr.length - 1];
    return new Decimal(last);
  },

  calculateSMA(
    data: (number | string | Decimal)[],
    period: number,
  ): Decimal | null {
    if (data.length < period) return null;
    const nums = data.map((p) =>
      p instanceof Decimal ? p.toNumber() : new Decimal(p || 0).toNumber(),
    );
    const res = JSIndicators.sma(nums, period);
    return new Decimal(res[res.length - 1]);
  },

  calculateEMA(
    data: (number | string | Decimal)[],
    period: number,
  ): Decimal | null {
    if (data.length < period) return null;
    const nums = data.map((p) =>
      p instanceof Decimal ? p.toNumber() : new Decimal(p || 0).toNumber(),
    );
    const res = JSIndicators.ema(nums, period);
    return new Decimal(res[res.length - 1]);
  },
};
