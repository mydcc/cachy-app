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
    result[period] = 100 - 100 / (1 + avgGain / (avgLoss || 1));

    for (let i = period + 1; i < data.length; i++) {
      const diff = data[i] - data[i - 1];
      const gain = diff >= 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      result[i] = 100 - 100 / (1 + avgGain / (avgLoss || 1));
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
      open: new Decimal(0)
    }
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
  let r1 = new Decimal(0), r2 = new Decimal(0), r3 = new Decimal(0);
  let s1 = new Decimal(0), s2 = new Decimal(0), s3 = new Decimal(0);

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
        p, r1, r2, r3, s1, s2, s3
      },
    },
    basis: {
      high, low, close, open
    },
  };
}

export function getRsiAction(val: number | Decimal | null, overbought: number, oversold: number) {
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
    const nums = prices.map(p => (typeof p === 'object' ? p.toNumber() : Number(p)));
    const rsiArr = JSIndicators.rsi(nums, period);
    const last = rsiArr[rsiArr.length - 1];
    return new Decimal(last);
  },

  calculateSMA(
    data: (number | string | Decimal)[],
    period: number,
  ): Decimal | null {
    if (data.length < period) return null;
    const nums = data.map(p => (typeof p === 'object' ? p.toNumber() : Number(p)));
    const res = JSIndicators.sma(nums, period);
    return new Decimal(res[res.length - 1]);
  },

  calculateEMA(
    data: (number | string | Decimal)[],
    period: number,
  ): Decimal | null {
    if (data.length < period) return null;
    const nums = data.map(p => (typeof p === 'object' ? p.toNumber() : Number(p)));
    const res = JSIndicators.ema(nums, period);
    return new Decimal(res[res.length - 1]);
  },
};
