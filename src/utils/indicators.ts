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

// --- JSIndicators (Fast, Array-based, used by Worker/Service) ---
export const JSIndicators = {
  sma(data: number[], period: number): number[] {
    const result = new Array(data.length).fill(0);
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

  ema(data: number[], period: number): number[] {
    const result = new Array(data.length).fill(0);
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

  rsi(data: number[], period: number): number[] {
    const result = new Array(data.length).fill(0);
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
    high: number[],
    low: number[],
    close: number[],
    kPeriod: number,
  ): number[] {
    const result = new Array(close.length).fill(0);
    if (close.length < kPeriod) return result;
    for (let i = kPeriod - 1; i < close.length; i++) {
      const lookbackHigh = Math.max(...high.slice(i - kPeriod + 1, i + 1));
      const lookbackLow = Math.min(...low.slice(i - kPeriod + 1, i + 1));
      const range = lookbackHigh - lookbackLow;
      result[i] = range === 0 ? 50 : ((close[i] - lookbackLow) / range) * 100;
    }
    return result;
  },

  macd(data: number[], fast: number, slow: number, signal: number) {
    const emaFast = this.ema(data, fast);
    const emaSlow = this.ema(data, slow);
    const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
    const macdSignal = this.ema(macdLine.slice(slow - 1), signal);
    const paddedSignal = new Array(slow - 1).fill(0).concat(macdSignal);
    return { macd: macdLine, signal: paddedSignal };
  },

  mom(data: number[], period: number): number[] {
    const result = new Array(data.length).fill(0);
    for (let i = period; i < data.length; i++) {
      result[i] = data[i] - data[i - period];
    }
    return result;
  },

  cci(data: number[], period: number): number[] {
    const result = new Array(data.length).fill(0);
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
    high: number[],
    low: number[],
    close: number[],
    period: number,
  ): number[] {
    const result = new Array(close.length).fill(0);
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

    const plusDI_S = this.ema(upMove, period);
    const minusDI_S = this.ema(downMove, period);
    const tr_S = this.ema(tr, period);

    const dx = new Array(close.length).fill(0);
    for (let i = 0; i < close.length; i++) {
      const pDI = (plusDI_S[i] / (tr_S[i] || 1)) * 100;
      const mDI = (minusDI_S[i] / (tr_S[i] || 1)) * 100;
      const sum = pDI + mDI;
      dx[i] = sum === 0 ? 0 : (Math.abs(pDI - mDI) / sum) * 100;
    }

    return this.ema(dx, period);
  },

  atr(
    high: number[],
    low: number[],
    close: number[],
    period: number,
  ): number[] {
    const result = new Array(close.length).fill(0);
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
    return this.ema(tr, period);
  },

  bb(data: number[], period: number, stdDev: number = 2) {
    const sma = this.sma(data, period);
    const upper = new Array(data.length).fill(0);
    const lower = new Array(data.length).fill(0);

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
    high: number[],
    low: number[],
    close: number[],
    volume: number[],
  ): number[] {
    const result = new Array(close.length).fill(0);
    // VWAP is typically Intraday, resetting at start of day.
    // However, for general timeframe usage (like TradingView's sessionless VWAP),
    // we often need a rolling window or a full accumulation if "anchored".
    // For this generic implementation, we'll do a simple cumulative VWAP
    // but ideally, this should accept an "anchor" or reset periodicity.
    // For simplicity in this context (and consistency with similar libs):
    // We will implement a "Rolling VWAP" if period is provided, or Cumulative if not?
    // Standard VWAP is Cumulative from start of data series here.

    let cumVol = 0;
    let cumVolPrice = 0;

    for (let i = 0; i < close.length; i++) {
      const typicalPrice = (high[i] + low[i] + close[i]) / 3;
      const vol = volume[i];
      cumVol += vol;
      cumVolPrice += typicalPrice * vol;
      result[i] = cumVol === 0 ? 0 : cumVolPrice / cumVol;
    }
    return result;
  },

  mfi(
    high: number[],
    low: number[],
    close: number[],
    volume: number[],
    period: number,
  ): number[] {
    const result = new Array(close.length).fill(0);
    if (close.length < period + 1) return result;

    const typicalPrices = close.map((c, i) => (high[i] + low[i] + c) / 3);
    const moneyFlow = typicalPrices.map((tp, i) => tp * volume[i]);

    const posFlow = new Array(close.length).fill(0);
    const negFlow = new Array(close.length).fill(0);

    // 1. Calculate Flows
    for (let i = 1; i < close.length; i++) {
      if (typicalPrices[i] > typicalPrices[i - 1]) {
        posFlow[i] = moneyFlow[i];
      } else if (typicalPrices[i] < typicalPrices[i - 1]) {
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
      const mfr = sumNeg === 0 ? 100 : sumPos / sumNeg;
      result[i] = 100 - 100 / (1 + mfr);
    }

    return result;
  },

  stochRsi(
    data: number[],
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
    const stochSingle = (src: number[], len: number) => {
      const res = new Array(src.length).fill(0);
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
    high: number[],
    low: number[],
    close: number[],
    period: number,
  ): number[] {
    const result = new Array(close.length).fill(0);
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
    high: number[],
    low: number[],
    close: number[],
    period: number,
  ): number[] {
    const result = new Array(close.length).fill(0);
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
    high: number[],
    low: number[],
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
    const conversion = new Array(len).fill(0);
    const base = new Array(len).fill(0);
    const spanA = new Array(len).fill(0);
    const spanB = new Array(len).fill(0);
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
    const currentSpanA = new Array(len).fill(0);
    const currentSpanB = new Array(len).fill(0);

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
    high: number[],
    low: number[],
    close: number[],
    period: number = 10,
    multiplier: number = 3,
  ) {
    // 1. ATR
    const atr = this.atr(high, low, close, period);
    const len = close.length;
    const basicUpper = new Array(len).fill(0);
    const basicLower = new Array(len).fill(0);
    const finalUpper = new Array(len).fill(0);
    const finalLower = new Array(len).fill(0);
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
    high: number[],
    low: number[],
    close: number[],
    period: number = 22,
    multiplier: number = 3,
  ) {
    // Chandelier Exit Logic essentially
    // Long Exit = Highest High (period) - ATR * mult
    // Short Exit = Lowest Low (period) + ATR * mult
    const atr = this.atr(high, low, close, period);
    const len = close.length;
    const buyStop = new Array(len).fill(0);
    const sellStop = new Array(len).fill(0);

    for (let i = period; i < len; i++) {
      const highestHigh = Math.max(...high.slice(i - period + 1, i + 1));
      const lowestLow = Math.min(...low.slice(i - period + 1, i + 1));

      buyStop[i] = highestHigh - atr[i] * multiplier;
      sellStop[i] = lowestLow + atr[i] * multiplier;
    }
    return { buyStop, sellStop };
  },

  obv(close: number[], volume: number[]) {
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
    high: number[],
    low: number[],
    close: number[],
    volume: number[],
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
};

// --- Helpers (Decimals, used by Service/Worker logic requiring precision) ---

export function calculateAwesomeOscillator(
  high: number[],
  low: number[],
  fastPeriod: number,
  slowPeriod: number,
): number {
  const hl2 = high.map((val, i) => (val + low[i]) / 2);

  const getSMA = (data: number[], period: number): number => {
    if (data.length < period) return 0;
    let sum = 0;
    for (let i = data.length - period; i < data.length; i++) {
      sum += data[i];
    }
    return sum / period;
  };

  const fastSMA = getSMA(hl2, fastPeriod);
  const slowSMA = getSMA(hl2, slowPeriod);

  return fastSMA - slowSMA;
}

export function calculatePivots(klines: Kline[], type: string) {
  const emptyResult = {
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
    basis: {
      high: new Decimal(0),
      low: new Decimal(0),
      close: new Decimal(0),
      open: new Decimal(0),
    },
  };

  if (klines.length < 2) return emptyResult;
  // previous Completed candle
  const prev = klines[klines.length - 2];

  // We work with Decimals here because pivot math is sensitive
  const high = new Decimal(prev.high);
  const low = new Decimal(prev.low);
  const close = new Decimal(prev.close);
  const open = new Decimal(prev.open);

  let p = new Decimal(0);
  let r1 = new Decimal(0),
    r2 = new Decimal(0),
    r3 = new Decimal(0);
  let s1 = new Decimal(0),
    s2 = new Decimal(0),
    s3 = new Decimal(0);

  if (type === "woodie") {
    p = high.plus(low).plus(close.times(2)).div(4);
    r1 = p.times(2).minus(low);
    r2 = p.plus(high).minus(low);
    s1 = p.times(2).minus(high);
    s2 = p.minus(high).plus(low);
    r3 = high.plus(p.minus(low).times(2));
    s3 = low.minus(high.minus(p).times(2));
  } else if (type === "camarilla") {
    const range = high.minus(low);
    r3 = close.plus(range.times(1.1).div(4));
    r2 = close.plus(range.times(1.1).div(6));
    r1 = close.plus(range.times(1.1).div(12));
    p = close;
    s1 = close.minus(range.times(1.1).div(12));
    s2 = close.minus(range.times(1.1).div(6));
    s3 = close.minus(range.times(1.1).div(4));
  } else if (type === "fibonacci") {
    p = high.plus(low).plus(close).div(3);
    const range = high.minus(low);
    r1 = p.plus(range.times(0.382));
    r2 = p.plus(range.times(0.618));
    r3 = p.plus(range.times(1.0));
    s1 = p.minus(range.times(0.382));
    s2 = p.minus(range.times(0.618));
    s3 = p.minus(range.times(1.0));
  } else {
    p = high.plus(low).plus(close).div(3);
    r1 = p.times(2).minus(low);
    s1 = p.times(2).minus(high);
    r2 = p.plus(high.minus(low));
    s2 = p.minus(high.minus(low));
    r3 = high.plus(p.minus(low).times(2));
    s3 = low.minus(high.minus(p).times(2));
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

export function getRsiAction(
  val: number | Decimal | null,
  overbought: number,
  oversold: number,
) {
  if (!val) return "Neutral";
  const v = new Decimal(val || 0).toNumber();
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
    const nums = prices.map((p) => new Decimal(p || 0).toNumber());
    const rsiArr = JSIndicators.rsi(nums, period);
    const last = rsiArr[rsiArr.length - 1];
    return new Decimal(last);
  },

  calculateSMA(
    data: (number | string | Decimal)[],
    period: number,
  ): Decimal | null {
    if (data.length < period) return null;
    const nums = data.map((p) => new Decimal(p || 0).toNumber());
    const res = JSIndicators.sma(nums, period);
    return new Decimal(res[res.length - 1]);
  },

  calculateEMA(
    data: (number | string | Decimal)[],
    period: number,
  ): Decimal | null {
    if (data.length < period) return null;
    const nums = data.map((p) => new Decimal(p || 0).toNumber());
    const res = JSIndicators.ema(nums, period);
    return new Decimal(res[res.length - 1]);
  },
};
