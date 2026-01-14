import * as talib from "talib-web";
import { Decimal } from "decimal.js";
import { browser } from "$app/environment";
import talibWasmUrl from "talib-web/lib/talib.wasm?url";
import type { IndicatorSettings } from "../stores/indicatorStore";
import type { Kline, TechnicalsData, IndicatorResult } from "./technicalsTypes";

export type { Kline, TechnicalsData, IndicatorResult };

// --- Native JS implementations for stability ---
// Exported to avoid code duplication and enable efficient O(N) calculations
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
    kPeriod: number
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
    // Only calculate signal from where MACD line has valid data (approx starting at 'slow' index)
    const macdSignal = this.ema(macdLine.slice(slow - 1), signal);
    // Pad macdSignal back to original length
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

      // 1. SMA (Simple Moving Average)
      let sum = new Decimal(0);
      for (const val of slice) sum = sum.plus(val);
      const sma = sum.dividedBy(period);

      // 2. Mean Deviation
      let sumAbsDiff = new Decimal(0);
      for (const val of slice) {
        sumAbsDiff = sumAbsDiff.plus(new Decimal(val).minus(sma).abs());
      }
      const meanDev = sumAbsDiff.dividedBy(period);

      if (meanDev.isZero()) {
        result[i] = 0;
      } else {
        // CCI = (Price - SMA) / (0.015 * Mean Deviation)
        const diff = new Decimal(data[i]).minus(sma);
        const divisor = meanDev.times(0.015);
        result[i] = diff.dividedBy(divisor).toNumber();
      }
    }
    return result;
  },

  adx(
    high: number[],
    low: number[],
    close: number[],
    period: number
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
        Math.abs(low[i] - close[i - 1])
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

// Initialize talib-web WASM module
let talibReady = false;
// Explicitly point to the WASM file using Vite asset URL
const wasmPath = browser ? talibWasmUrl : undefined;

let talibInit: Promise<void> | undefined;

if (browser && wasmPath) {
  talibInit = talib
    .init(wasmPath)
    .then(() => {
      talibReady = true;
      console.log(`talib-web initialized successfully from ${wasmPath}`);
    })
    .catch((err) => {
      console.error(`Failed to initialize talib-web form ${wasmPath}:`, err);
    });
} else {
  // SSR or no WASM path
  talibInit = Promise.resolve();
}

// Cache for indicator calculations
const calculationCache = new Map<string, TechnicalsResultCacheEntry>();
const MAX_CACHE_SIZE = 20;

interface TechnicalsResultCacheEntry {
  data: TechnicalsData;
  timestamp: number;
}

export const technicalsService = {
  async calculateTechnicals(
    klinesInput: {
      time: number;
      open: number | string | Decimal;
      high: number | string | Decimal;
      low: number | string | Decimal;
      close: number | string | Decimal;
      volume?: number | string | Decimal;
    }[],
    settings?: IndicatorSettings
  ): Promise<TechnicalsData> {
    if (klinesInput.length === 0) return this.getEmptyData();

    // 0. Cache Check
    const lastKline = klinesInput[klinesInput.length - 1];
    const lastPrice = lastKline.close?.toString() || "0";
    const cacheKey = `${klinesInput.length}-${lastKline.time}-${lastPrice}-${JSON.stringify(
      settings
    )}`;
    const cached = calculationCache.get(cacheKey);
    if (cached) {
      return cached.data;
    }

    // Ensure talib is initialized (though we use JS fallbacks for most)
    if (!talibReady) {
      console.log("Waiting for talib-web initialization...");

      try {
        await talibInit;
        if (!talibReady) {
          console.error("talib-web initialization failed or timed out.");
          return this.getEmptyData();
        }
      } catch (e) {
        console.error("Error awaiting talibInit:", e);
        return this.getEmptyData();
      }
    }

    // 1. Normalize Data to strict Kline format with Decimals
    const klines: Kline[] = [];
    let prevClose = new Decimal(0);

    const toDec = (
      val: number | string | Decimal | undefined,
      fallback: Decimal
    ): Decimal => {
      if (val instanceof Decimal) return val;
      if (typeof val === "number" && !isNaN(val)) return new Decimal(val);
      if (typeof val === "string") {
        const parsed = parseFloat(val);
        if (!isNaN(parsed)) return new Decimal(val);
      }
      return fallback;
    };

    klinesInput.forEach((k) => {
      const time = k.time;
      const close = toDec(k.close, prevClose);
      const safeClose =
        close.isZero() && !prevClose.isZero() ? prevClose : close;
      const open = toDec(k.open, safeClose);
      const high = toDec(k.high, safeClose);
      const low = toDec(k.low, safeClose);
      const volume = toDec(k.volume, new Decimal(0));

      if (!safeClose.isZero()) {
        klines.push({ open, high, low, close: safeClose, volume, time });
        prevClose = safeClose;
      }
    });

    if (klines.length < 2) return this.getEmptyData();

    // Helper to get source array based on config (returns Decimal[])
    const getSource = (sourceType: string): Decimal[] => {
      switch (sourceType) {
        case "open":
          return klines.map((k) => k.open);
        case "high":
          return klines.map((k) => k.high);
        case "low":
          return klines.map((k) => k.low);
        case "hl2":
          return klines.map((k) => k.high.plus(k.low).div(2));
        case "hlc3":
          return klines.map((k) => k.high.plus(k.low).plus(k.close).div(3));
        default:
          return klines.map((k) => k.close);
      }
    };

    // Convert Decimal arrays to number arrays for talib
    const highsNum = klines.map((k) => k.high.toNumber());
    const lowsNum = klines.map((k) => k.low.toNumber());
    const closesNum = klines.map((k) => k.close.toNumber());
    const currentPrice = klines[klines.length - 1].close;

    // Initializing technicals...

    // --- Oscillators ---
    const oscillators: IndicatorResult[] = [];

    try {
      // 1. RSI
      const rsiLen = settings?.rsi?.length || 14;
      const rsiSource = getSource(settings?.rsi?.source || "close").map((d) =>
        d.toNumber()
      );
      const rsiResults = JSIndicators.rsi(rsiSource, rsiLen);
      const rsiVal = new Decimal(rsiResults[rsiResults.length - 1]);

      oscillators.push({
        name: "RSI",
        value: rsiVal,
        params: rsiLen.toString(),
        action: this.getRsiAction(
          rsiVal,
          settings?.rsi?.overbought || 70,
          settings?.rsi?.oversold || 30
        ),
      });

      // 2. Stochastic
      const stochK = settings?.stochastic?.kPeriod || 14;
      const stochD = settings?.stochastic?.dPeriod || 3;
      const stochKSmooth = settings?.stochastic?.kSmoothing || 1;

      let kLine = JSIndicators.stoch(
        Array.from(highsNum),
        Array.from(lowsNum),
        Array.from(closesNum),
        stochK
      );
      if (stochKSmooth > 1) kLine = JSIndicators.sma(kLine, stochKSmooth);
      const dLine = JSIndicators.sma(kLine, stochD);

      const stochKVal = new Decimal(kLine[kLine.length - 1]);
      const stochDVal = new Decimal(dLine[dLine.length - 1]);

      let stochAction: "Buy" | "Sell" | "Neutral" = "Neutral";
      if (stochKVal.lt(20) && stochDVal.lt(20) && stochKVal.gt(stochDVal))
        stochAction = "Buy";
      else if (stochKVal.gt(80) && stochDVal.gt(80) && stochKVal.lt(stochDVal))
        stochAction = "Sell";

      oscillators.push({
        name: "Stoch",
        params: `${stochK}, ${stochKSmooth}, ${stochD}`,
        value: stochKVal,
        action: stochAction,
      });

      // 3. CCI
      const cciLen = settings?.cci?.length || 20;
      const cciSmoothLen = settings?.cci?.smoothingLength || 1;
      const cciSmoothType = settings?.cci?.smoothingType || "sma";

      // Default CCI source is Typical Price (HLC3)
      const cciSource = getSource(settings?.cci?.source || "hlc3").map((d) =>
        d.toNumber()
      );

      let cciResults = JSIndicators.cci(cciSource, cciLen);

      // Apply smoothing if requested
      if (cciSmoothLen > 1) {
        if (cciSmoothType === "ema") {
          cciResults = JSIndicators.ema(cciResults, cciSmoothLen);
        } else {
          cciResults = JSIndicators.sma(cciResults, cciSmoothLen);
        }
      }

      const cciVal = new Decimal(cciResults[cciResults.length - 1]);

      oscillators.push({
        name: "CCI",
        value: cciVal,
        params:
          cciSmoothLen > 1
            ? `${cciLen}, ${cciSmoothLen} (${cciSmoothType.toUpperCase()})`
            : cciLen.toString(),
        action: cciVal.gt(100) ? "Sell" : cciVal.lt(-100) ? "Buy" : "Neutral",
      });

      // 4. ADX
      const adxLen = settings?.adx?.adxSmoothing || 14;
      const adxResults = JSIndicators.adx(
        Array.from(highsNum),
        Array.from(lowsNum),
        Array.from(closesNum),
        adxLen
      );
      const adxVal = new Decimal(adxResults[adxResults.length - 1]);

      oscillators.push({
        name: "ADX",
        value: adxVal,
        params: adxLen.toString(),
        action: adxVal.gt(25) ? "Buy" : "Neutral",
      });

      // 5. Awesome Oscillator (manually calculated)
      const aoFast = settings?.ao?.fastLength || 5;
      const aoSlow = settings?.ao?.slowLength || 34;
      const aoVal = await this.calculateAwesomeOscillator(
        highsNum,
        lowsNum,
        aoFast,
        aoSlow
      );

      let aoAction: "Buy" | "Sell" | "Neutral" = "Neutral";
      if (aoVal.gt(0)) aoAction = "Buy";
      else if (aoVal.lt(0)) aoAction = "Sell";

      oscillators.push({
        name: "Awesome Osc.",
        params: `${aoFast}, ${aoSlow}`,
        value: aoVal,
        action: aoAction,
      });

      // 6. Momentum
      const momLen = settings?.momentum?.length || 10;
      const momSource = getSource(settings?.momentum?.source || "close").map(
        (d) => d.toNumber()
      );
      const momResults = JSIndicators.mom(momSource, momLen);
      const momVal = new Decimal(momResults[momResults.length - 1]);

      let momAction: "Buy" | "Sell" | "Neutral" = "Neutral";
      if (momVal.gt(0)) momAction = "Buy";
      else if (momVal.lt(0)) momAction = "Sell";

      oscillators.push({
        name: "Momentum",
        params: `${momLen}`,
        value: momVal,
        action: momAction,
      });

      // 7. MACD
      const macdFast = settings?.macd?.fastLength || 12;
      const macdSlow = settings?.macd?.slowLength || 26;
      const macdSig = settings?.macd?.signalLength || 9;
      const macdSource = getSource(settings?.macd?.source || "close").map((d) =>
        d.toNumber()
      );

      const macdResults = JSIndicators.macd(
        macdSource,
        macdFast,
        macdSlow,
        macdSig
      );
      const macdVal = new Decimal(
        macdResults.macd[macdResults.macd.length - 1]
      );
      const macdSignalVal = new Decimal(
        macdResults.signal[macdResults.signal.length - 1]
      );

      let macdAction: "Buy" | "Sell" | "Neutral" = "Neutral";
      if (!macdVal.isZero() || !macdSignalVal.isZero()) {
        if (macdVal.gt(macdSignalVal)) macdAction = "Buy";
        else if (macdVal.lt(macdSignalVal)) macdAction = "Sell";
      }

      oscillators.push({
        name: "MACD",
        params: `${macdFast}, ${macdSlow}, ${macdSig}`,
        value: macdVal,
        signal: macdSignalVal,
        action: macdAction,
      });
    } catch (error) {
      console.error("Error calculating oscillators:", error);
    }

    // --- Moving Averages ---
    const movingAverages: IndicatorResult[] = [];
    try {
      const ema1 = settings?.ema?.ema1?.length || 20;
      const ema2 = settings?.ema?.ema2?.length || 50;
      const ema3 = settings?.ema?.ema3?.length || 200;
      const emaSource = getSource(settings?.ema?.source || "close").map((d) =>
        d.toNumber()
      );

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
      console.error("Error calculating moving averages:", error);
    }

    // --- Pivots ---
    const pivotType = settings?.pivots?.type || "classic";
    const pivotData = this.calculatePivots(klines, pivotType);

    // --- Summary ---
    let buy = 0;
    let sell = 0;
    let neutral = 0;

    [...oscillators, ...movingAverages].forEach((ind) => {
      if (ind.action === "Buy") buy++;
      else if (ind.action === "Sell") sell++;
      else neutral++;
    });

    let summaryAction: "Buy" | "Sell" | "Neutral" = "Neutral";
    if (buy > sell && buy > neutral) summaryAction = "Buy";
    else if (sell > buy && sell > neutral) summaryAction = "Sell";

    const result: TechnicalsData = {
      oscillators,
      movingAverages,
      pivots: pivotData.pivots,
      pivotBasis: pivotData.basis,
      summary: { buy, sell, neutral, action: summaryAction },
    };

    // Store in cache
    if (calculationCache.size >= MAX_CACHE_SIZE) {
      const firstKey = calculationCache.keys().next().value;
      if (firstKey) calculationCache.delete(firstKey);
    }
    calculationCache.set(cacheKey, { data: result, timestamp: Date.now() });

    return result;
  },

  clearCache(): void {
    calculationCache.clear();
  },

  // --- Helpers ---

  // Awesome Oscillator (nicht in talib-web)
  async calculateAwesomeOscillator(
    high: number[] | Float64Array,
    low: number[] | Float64Array,
    fastPeriod: number,
    slowPeriod: number
  ): Promise<Decimal> {
    try {
      const h = Array.from(high);
      const l = Array.from(low);
      const hl2 = h.map((val, i) => (val + l[i]) / 2);

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

      console.log(
        `[Technicals] AO Internal: fastSMA=${fastSMA}, slowSMA=${slowSMA}, diff=${fastSMA - slowSMA
        }`
      );

      return new Decimal(fastSMA - slowSMA);
    } catch (error) {
      console.error("Error calculating Awesome Oscillator:", error);
    }
    return new Decimal(0);
  },

  calculatePivots(klines: Kline[], type: string) {
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
    const prev = klines[klines.length - 2];
    if (prev.close.isZero()) return emptyResult;

    const high = prev.high;
    const low = prev.low;
    const close = prev.close;
    const open = prev.open;

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
        classic: { p, r1, r2, r3, s1, s2, s3 },
      },
      basis: { high, low, close, open },
    };
  },

  getRsiAction(
    val: Decimal | null,
    overbought: number = 70,
    oversold: number = 30
  ): "Buy" | "Sell" | "Neutral" {
    if (!val) return "Neutral";
    const v = val.toNumber();
    if (v >= overbought) return "Sell";
    if (v <= oversold) return "Buy";
    return "Neutral";
  },

  getEmptyData(): TechnicalsData {
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
  },
};
