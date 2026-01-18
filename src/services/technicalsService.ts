/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
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
import { browser } from "$app/environment";
import type { IndicatorSettings } from "../stores/indicatorStore";
import type { TechnicalsData, IndicatorResult } from "./technicalsTypes";
import {
  JSIndicators,
  calculateAwesomeOscillator,
  calculatePivots,
  getRsiAction,
  type Kline
} from "../utils/indicators";

export { JSIndicators };
export type { Kline, TechnicalsData, IndicatorResult };

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
    settings?: IndicatorSettings,
  ): Promise<TechnicalsData> {
    if (klinesInput.length === 0) return this.getEmptyData();

    // 0. Cache Check
    const lastKline = klinesInput[klinesInput.length - 1];
    const lastPrice = lastKline.close?.toString() || "0";
    const cacheKey = `${klinesInput.length}-${lastKline.time}-${lastPrice}-${JSON.stringify(
      settings,
    )}`;
    const cached = calculationCache.get(cacheKey);
    if (cached) {
      return cached.data;
    }

    // --- Worker Offloading ---
    if (browser && window.Worker) {
      return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('../workers/technicals.worker.ts', import.meta.url), { type: 'module' });

        const timeout = setTimeout(() => {
          worker.terminate();
          console.warn("Worker timed out, falling back to main thread.");
          resolve(this.calculateTechnicalsInline(klinesInput, settings));
        }, 3000); // 3s timeout

        worker.onmessage = (e) => {
          clearTimeout(timeout);
          const { type, payload, error } = e.data;
          if (type === "RESULT") {
            worker.terminate();
            // Rehydrate Decimals from strings
            try {
              if (payload.oscillators) {
                payload.oscillators.forEach((o: any) => {
                  o.value = new Decimal(o.value || 0);
                });
              }
              if (payload.movingAverages) {
                payload.movingAverages.forEach((m: any) => {
                  m.value = new Decimal(m.value || 0);
                });
              }
              if (payload.pivots && payload.pivots.classic) {
                Object.keys(payload.pivots.classic).forEach((key) => {
                  payload.pivots.classic[key] = new Decimal(payload.pivots.classic[key] || 0);
                });
              }
              if (payload.pivotBasis) {
                payload.pivotBasis.high = new Decimal(payload.pivotBasis.high || 0);
                payload.pivotBasis.low = new Decimal(payload.pivotBasis.low || 0);
                payload.pivotBasis.close = new Decimal(payload.pivotBasis.close || 0);
                payload.pivotBasis.open = new Decimal(payload.pivotBasis.open || 0);
              }
            } catch (rehydrateError) {
              console.error("Rehydration error:", rehydrateError);
            }

            calculationCache.set(cacheKey, { data: payload, timestamp: Date.now() });
            resolve(payload);
          } else {
            worker.terminate();
            console.error("Worker Error:", error);
            resolve(this.calculateTechnicalsInline(klinesInput, settings));
          }
        };

        worker.onerror = (err) => {
          clearTimeout(timeout);
          worker.terminate();
          console.error("Worker System Error:", err);
          resolve(this.calculateTechnicalsInline(klinesInput, settings));
        };

        // Send Data
        const klinesSerializable = klinesInput.map(k => ({
          time: k.time,
          open: (k.open || 0).toString(),
          high: (k.high || 0).toString(),
          low: (k.low || 0).toString(),
          close: (k.close || 0).toString(),
          volume: (k.volume || 0).toString()
        }));

        const cleanSettings = JSON.parse(JSON.stringify(settings || {}));

        worker.postMessage({
          type: "CALCULATE",
          payload: { klines: klinesSerializable, settings: cleanSettings }
        });
      });
    }

    // Fallback or SSR
    return this.calculateTechnicalsInline(klinesInput, settings);
  },

  calculateTechnicalsInline(
    klinesInput: {
      time: number;
      open: number | string | Decimal;
      high: number | string | Decimal;
      low: number | string | Decimal;
      close: number | string | Decimal;
      volume?: number | string | Decimal;
    }[],
    settings?: IndicatorSettings,
  ): TechnicalsData {
    // 1. Normalize Data to strict Kline format with Decimals
    const klines: Kline[] = [];
    let prevClose = new Decimal(0);
    const lastKline = klinesInput[klinesInput.length - 1];
    const lastPrice = lastKline.close?.toString() || "0";
    const cacheKey = `${klinesInput.length}-${lastKline.time}-${lastPrice}-${JSON.stringify(
      settings,
    )}`;

    const toDec = (
      val: number | string | Decimal | undefined,
      fallback: Decimal,
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
        d.toNumber(),
      );
      const rsiResults = JSIndicators.rsi(rsiSource, rsiLen);
      const rsiVal = new Decimal(rsiResults[rsiResults.length - 1]);

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

      // 2. Stochastic
      const stochK = settings?.stochastic?.kPeriod || 14;
      const stochD = settings?.stochastic?.dPeriod || 3;
      const stochKSmooth = settings?.stochastic?.kSmoothing || 1;

      let kLine = JSIndicators.stoch(
        Array.from(highsNum),
        Array.from(lowsNum),
        Array.from(closesNum),
        stochK,
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
        // signal: stochDVal // Add if UI supports it
      });

      // 3. CCI
      const cciLen = settings?.cci?.length || 20;
      const cciSmoothLen = settings?.cci?.smoothingLength || 1;
      const cciSmoothType = settings?.cci?.smoothingType || "sma";

      // Default CCI source is Typical Price (HLC3)
      const cciSource = getSource(settings?.cci?.source || "hlc3").map((d) =>
        d.toNumber(),
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
        adxLen,
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
      const aoVal = new Decimal(calculateAwesomeOscillator(
        highsNum,
        lowsNum,
        aoFast,
        aoSlow,
      ));

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
        (d) => d.toNumber(),
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
        d.toNumber(),
      );

      const macdResults = JSIndicators.macd(
        macdSource,
        macdFast,
        macdSlow,
        macdSig,
      );
      const macdVal = new Decimal(
        macdResults.macd[macdResults.macd.length - 1],
      );
      const macdSignalVal = new Decimal(
        macdResults.signal[macdResults.signal.length - 1],
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
        d.toNumber(),
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
    const pivotData = calculatePivots(klines, pivotType); // Using imported helper

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
        open: new Decimal(0)
      },
      summary: { buy: 0, sell: 0, neutral: 0, action: "Neutral" },
    };
  }
};

