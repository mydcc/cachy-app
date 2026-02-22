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

/**
 * Stateful Technicals Calculator
 * Manages the state of technical indicators to allow for O(1) incremental updates.
 */

import { Decimal } from "decimal.js";
import { JSIndicators, type Kline } from "./indicators";
import { calculateAllIndicators } from "./technicalsCalculator";
import type { TechnicalsData, TechnicalsState, EmaState, RsiState, MfiState } from "../services/technicalsTypes";
import { CircularBuffer } from "./circularBuffer";

export class StatefulTechnicalsCalculator {
  private state: TechnicalsState = {
    lastCandle: null,
    ema: {},
    rsi: {},
    mfi: undefined,
  };

  private settings: any;
  private enabledIndicators: Partial<Record<string, boolean>> | undefined;

  // History Buffer for price data (Circular Buffer with max 200 candles)
  private priceHistory: CircularBuffer<number>;
  private readonly MAX_HISTORY_SIZE = 200;

  constructor() {
    this.priceHistory = new CircularBuffer<number>(this.MAX_HISTORY_SIZE);
  }

  public initialize(
    history: Kline[],
    settings: any,
    enabledIndicators?: Partial<Record<string, boolean>>
  ): TechnicalsData {
    this.settings = settings;
    this.enabledIndicators = enabledIndicators;

    // 1. Run full calculation to get the baseline
    const result = calculateAllIndicators(history, settings, enabledIndicators);
    this.state.lastResult = result;
    this.state.lastCandle = history[history.length - 1];

    this.reconstructState(history, result);
    this.reconstructMfiState(history);
    this.reconstructAtrState(history);
    this.reconstructStochRsiState(history);
    this.initHistoryBuffers(history);

    return result;
  }

  public update(tick: Kline): TechnicalsData {
    if (!this.state.lastResult || !this.state.lastCandle) {
        throw new Error("Calculator not initialized");
    }

    const prevResult = this.state.lastResult;
    const currentPrice = tick.close.toNumber();
    const prevPrice = this.state.lastCandle.close.toNumber();

    // Clone the previous result to modify it
    // Deep clone might be expensive, but structure is simple.
    // For perf, we mutate a fresh object based on prev.
    const newResult = { ...prevResult }; // Shallow copy of top level

    // Arrays (oscillators, MAs) need to be cloned or we just replace the entries we update.
    // Since 'oscillators' is an array of objects, we can map it.
    newResult.oscillators = prevResult.oscillators.map(o => ({ ...o }));
    newResult.movingAverages = prevResult.movingAverages.map(ma => ({ ...ma }));

    // 1. Update EMA
    if (this.state.ema && this.enabled("ema")) {
       this.updateEmaGroup(newResult, currentPrice);
    }

    // 2. Update RSI
    if (this.state.rsi && this.enabled("rsi")) {
       this.updateRsiGroup(newResult, currentPrice, prevPrice);
    }

    // 3. Update SMA / Bollinger Bands
    if (this.state.sma && this.enabled("sma")) {
        this.updateSmaGroup(newResult, currentPrice);
    }

    // 4. Update MFI incrementally (updating with the current forming candle)
    if (this.state.mfi && this.enabled("mfi") && tick) {
        this.updateMfiGroup(newResult, tick);
    }

    // 5. Update ATR incrementally
    if (this.state.atr && this.enabled("atr")) {
        this.updateAtrGroup(newResult, tick);
    }

    // 6. Update StochRSI incrementally
    if (this.state.stochRsi && this.enabled("stochrsi")) {
        this.updateStochRsiGroup(newResult, currentPrice);
    }

    // Update State for next tick
    this.state.lastResult = newResult;

    return newResult;
  }

  public commitCandle(candle: Kline) {
      if (!this.state.lastCandle) {
        this.state.lastCandle = candle;
        return;
      }

      const price = candle.close.toNumber();

      // Update Price History
      this.priceHistory.push(price);

      // 1. Update EMA State
      if (this.state.ema) {
          Object.keys(this.state.ema).forEach(key => {
              const len = parseInt(key);
              const emaState = this.state.ema![len];
              // EMA(t) = alpha * price + (1-alpha) * EMA(t-1)
              const k = 2 / (len + 1);
              emaState.prevEma = (price * k) + (emaState.prevEma * (1 - k));
          });
      }

      // 2. Update RSI State
      if (this.state.rsi) {
           Object.keys(this.state.rsi).forEach(key => {
              const len = parseInt(key);
              const rsiState = this.state.rsi![len];

              const change = price - rsiState.prevPrice;
              let gain = change > 0 ? change : 0;
              let loss = change < 0 ? -change : 0;

              // RMA update
              rsiState.avgGain = (rsiState.avgGain * (len - 1) + gain) / len;
              rsiState.avgLoss = (rsiState.avgLoss * (len - 1) + loss) / len;
              rsiState.prevPrice = price;
          });
      }

      // 3. Update SMA State
      if (this.state.sma) {
          Object.keys(this.state.sma).forEach(key => {
              const len = parseInt(key);
              const smaState = this.state.sma![len];

              // Remove oldest value from sum
              // The buffer is already updated with 'price' at the end.
              // So the oldest value is at 'size - len - 1' (because 'len' includes the new one)
              // Wait, if history size is N, and we just pushed, size is N.
              // We need the value from N - len (0-indexed? No circular buffer get is logical index).
              // If buffer has [0, 1, 2 ... N], newest is N.
              // Window is [N-len+1 ... N].
              // Oldest in window was N-len?
              // The SMA formula is: sum = sum - old + new.
              // 'old' is the value that just fell out of the window.
              // If window size is 5. History: 1,2,3,4,5.
              // Next step: 6. History: 2,3,4,5,6.
              // We removed 1.
              // So we need value at index (currentSize - len - 1).
              const oldValIdx = this.priceHistory.getSize() - len - 1;
              const oldVal = this.priceHistory.get(oldValIdx);

              if (oldVal !== undefined) {
                  smaState.prevSum = smaState.prevSum - oldVal + price;

                  if (smaState.prevSumSq !== undefined) {
                      smaState.prevSumSq = smaState.prevSumSq - (oldVal * oldVal) + (price * price);
                  }
              }
          });
      }

      // 4. Update MFI State
      if (this.state.mfi) {
          const mfi = this.state.mfi;
          const h = candle.high.toNumber();
          const l = candle.low.toNumber();
          const c = candle.close.toNumber();
          const v = candle.volume.toNumber();
          const tp = (h + l + c) / 3;
          const rawMf = tp * v;

          const posFlow = tp > mfi.prevTp ? rawMf : 0;
          const negFlow = tp < mfi.prevTp ? rawMf : 0;

          mfi.window.push({ tp, posFlow, negFlow });
          mfi.sumPos += posFlow;
          mfi.sumNeg += negFlow;
          mfi.prevTp = tp;

          if (mfi.window.length > mfi.period) {
              const removed = mfi.window.shift();
              if (removed) {
                  mfi.sumPos -= removed.posFlow;
                  mfi.sumNeg -= removed.negFlow;
              }
          }
      }

      // 5. Update ATR State
      if (this.state.atr) {
          Object.keys(this.state.atr).forEach(key => {
             const len = parseInt(key);
             const atrState = this.state.atr![len];

             const h = candle.high.toNumber();
             const l = candle.low.toNumber();
             const pc = atrState.prevClose; // Close of previous candle

             const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));

             // RMA update: ATR = (PrevATR * (n-1) + TR) / n
             atrState.prevAtr = (atrState.prevAtr * (len - 1) + tr) / len;
             atrState.prevClose = candle.close.toNumber();
          });
      }

      // 6. Update StochRSI State
      if (this.state.stochRsi) {
          Object.keys(this.state.stochRsi).forEach(key => {
             const len = parseInt(key);
             const sState = this.state.stochRsi![len];

             // Calculate RSI for this closed candle
             // We reuse the RSI logic or rely on the RSI state we just updated?
             // Since StochRSI maintains its OWN RSI state (independent of the main RSI indicator to avoid dependency issues if RSI is disabled),
             // we update it here.

             const change = price - sState.rsiState.prevPrice;
             const gain = change > 0 ? change : 0;
             const loss = change < 0 ? -change : 0;

             // Update RSI state
             // Note: RsiState does not track length, so we rely on settings or default
             const rsiLen = this.settings?.stochRsi?.rsiLength || 14;

             sState.rsiState.avgGain = (sState.rsiState.avgGain * (rsiLen - 1) + gain) / rsiLen;
             sState.rsiState.avgLoss = (sState.rsiState.avgLoss * (rsiLen - 1) + loss) / rsiLen;
             sState.rsiState.prevPrice = price;

             const rs = sState.rsiState.avgLoss === 0 ? 100 : sState.rsiState.avgGain / sState.rsiState.avgLoss;
             const rsi = sState.rsiState.avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));

             // Push to history
             sState.rsiHistory.push(rsi);
             if (sState.rsiHistory.length > len) sState.rsiHistory.shift();

             // Calculate %K
             let rawK = 50;
             if (sState.rsiHistory.length >= len) {
                 const max = Math.max(...sState.rsiHistory);
                 const min = Math.min(...sState.rsiHistory);
                 if (max !== min) {
                     rawK = ((rsi - min) / (max - min)) * 100;
                 }
             }

             sState.rawKHistory.push(rawK);
             const kPeriod = this.settings?.stochRsi?.kPeriod || 3;
             if (sState.rawKHistory.length > kPeriod) sState.rawKHistory.shift();
          });
      }

      this.state.lastCandle = candle;
  }

  private enabled(key: string): boolean {
    if (!this.enabledIndicators) return true;
    // Normalize to lowercase for comparison, since enabledIndicators uses
    // camelCase keys (e.g. "stochRsi", "bollingerBands") but callers may
    // pass lowercase (e.g. "stochrsi"). The stateless calculator does the
    // same normalization in technicalsCalculator.ts:114-122.
    const normalizedKey = key.toLowerCase();
    for (const [k, v] of Object.entries(this.enabledIndicators)) {
      if (k.toLowerCase() === normalizedKey) {
        return v !== false;
      }
    }
    // Key not found — treat as enabled (matches old behavior and the
    // stateless calculator's blocklist/allowlist logic).
    return true;
  }

  // --- Helpers to Reconstruct State from Initial Calculation ---

  private reconstructState(history: Kline[], result: TechnicalsData) {
     // Reconstruct EMA
     if (this.settings?.ema) {
         const emas = [this.settings.ema.ema1, this.settings.ema.ema2, this.settings.ema.ema3];
         emas.forEach(cfg => {
             if (cfg && cfg.length) {
                // Find the result in the movingAverages array
                const ma = result.movingAverages.find(m => m.name === "EMA" && m.params === cfg.length.toString());
                if (ma) {
                    this.state.ema![cfg.length] = { prevEma: ma.value };
                }
             }
         });
     }

     // Reconstruct SMA
     if (this.settings?.sma) {
         const smas = [this.settings.sma.sma1, this.settings.sma.sma2, this.settings.sma.sma3];
         smas.forEach(cfg => {
             if (cfg && cfg.length) {
                 // For SMA, we need the SUM of the last N candles.
                 // SMA = Sum / N => Sum = SMA * N
                 const ma = result.movingAverages.find(m => m.name === "SMA" && m.params === cfg.length.toString());
                 if (ma) {
                     this.state.sma![cfg.length] = { prevSum: ma.value * cfg.length };
                 }
             }
         });
     }

     // Reconstruct Bollinger Bands SMA state
     if (this.enabled("bollingerBands") && result.volatility?.bb) {
         const bbLen = this.settings?.bollingerBands?.length || 20;
         const smaVal = result.volatility.bb.middle;
         if (!this.state.sma) this.state.sma = {};
         let sumSq = 0;
         const histLen = history.length;
         const startIdx = Math.max(0, histLen - bbLen);
         for (let i = startIdx; i < histLen; i++) {
             const val = history[i].close.toNumber();
             sumSq += val * val;
         }
         this.state.sma![bbLen] = { prevSum: smaVal * bbLen, prevSumSq: sumSq };
     }

     // Reconstruct RSI
     if (this.settings?.rsi) {
         const len = this.settings.rsi.length || 14; // RSI period
         // We need AvgGain and AvgLoss.
         // We can approximate them if we only have the final RSI value, but that leads to inaccuracy.
         // Better to re-calculate them from the last N*2 candles.

         const subset = history.slice(-len * 10); // Lookback enough to stabilize
         // Standard Wilder's RSI calculation on subset
         let avgGain = 0, avgLoss = 0;
         const closes = subset.map(k => k.close.toNumber());

         if (closes.length > len) {
             // Initial SMA
             for (let i = 1; i <= len; i++) {
                 const diff = closes[i] - closes[i-1];
                 if (diff > 0) avgGain += diff;
                 else avgLoss -= diff;
             }
             avgGain /= len;
             avgLoss /= len;

             // RMA
             for (let i = len + 1; i < closes.length; i++) {
                 const diff = closes[i] - closes[i-1];
                 const g = diff > 0 ? diff : 0;
                 const l = diff < 0 ? -diff : 0;
                 avgGain = (avgGain * (len - 1) + g) / len;
                 avgLoss = (avgLoss * (len - 1) + l) / len;
             }
         }

         this.state.rsi![len] = {
             avgGain,
             avgLoss,
             prevPrice: closes[closes.length - 1]
         };
     }
  }

  private initHistoryBuffers(history: Kline[]) {
      // Fill the circular buffer with the last N prices
      const recent = history.slice(-this.MAX_HISTORY_SIZE);
      for (const k of recent) {
          this.priceHistory.push(k.close.toNumber());
      }
  }

  private updateEmaGroup(result: TechnicalsData, price: number) {
      if (!this.state.ema) return;

      const emaInds = result.movingAverages.filter(m => m.name === "EMA");
      for (const ma of emaInds) {
          const len = parseInt(ma.params || "0");
          const state = this.state.ema[len];
          if (state && len > 0) {
              const k = 2 / (len + 1);
              const newEma = (price * k) + (state.prevEma * (1 - k));
              ma.value = newEma;
              ma.action = price > newEma ? "Buy" : "Sell";

              // Note: Signal/Band logic handles smoothing which might be complex to incrementalize perfectly
              // without extra state. For now, we update the base value.
              // If smoothing is enabled, we might skip updating signal/bands here or approximate.
          }
      }
  }

  private updateSmaGroup(result: TechnicalsData, price: number) {
      if (!this.state.sma) return;

      const smaInds = result.movingAverages.filter(m => m.name === "SMA");
      for (const ma of smaInds) {
          const len = parseInt(ma.params || "0");
          const state = this.state.sma[len];
          if (state && len > 0) {
              const oldestInWindow = this.priceHistory.getSize() - len;
              const oldVal = this.priceHistory.get(oldestInWindow);

              if (oldVal !== undefined) {
                  const newSum = state.prevSum - oldVal + price;
                  const newSma = newSum / len;
                  ma.value = newSma;
                  ma.action = price > newSma ? "Buy" : "Sell";

                  // Bollinger Bands check
                  // We also need to update BB if this SMA length corresponds to BB length
                  // The BB uses the result.volatility.bb structure
                  if (result.volatility?.bb) {
                      const bbLen = this.settings?.bollingerBands?.length || 20;
                      if (len === bbLen) {
                         const prevSumSq = state.prevSumSq || 0; // If not initialized, BB fails. Should be initialized in reconstruct.
                         const newSumSq = prevSumSq - (oldVal * oldVal) + (price * price);
                         const variance = Math.max(0, (newSumSq / len) - (newSma * newSma));
                         const std = Math.sqrt(variance);
                         const stdDev = this.settings?.bollingerBands?.stdDev || 2;

                         result.volatility.bb.middle = newSma;
                         result.volatility.bb.upper = newSma + std * stdDev;
                         result.volatility.bb.lower = newSma - std * stdDev;

                         const range = result.volatility.bb.upper - result.volatility.bb.lower;
                         result.volatility.bb.percentP = range === 0 ? 0.5 : (price - result.volatility.bb.lower) / range;
                      }
                  }
              }
          }
      }
  }

  private updateRsiGroup(result: TechnicalsData, price: number, prevPrice: number) {
      if (!this.state.rsi) return;

      const rsiInd = result.oscillators.find(o => o.name === "RSI");
      if (!rsiInd) return;

      const len = this.settings?.rsi?.length || 14;
      const state = this.state.rsi[len];
      if (state) {
          const { rsi } = JSIndicators.updateRsi(state.avgGain, state.avgLoss, price, prevPrice, len);
          rsiInd.value = rsi;

          if (rsi > (this.settings?.rsi?.overbought || 70)) rsiInd.action = "Sell";
          else if (rsi < (this.settings?.rsi?.oversold || 30)) rsiInd.action = "Buy";
          else rsiInd.action = "Neutral";
      }
  }

  private updateMfiGroup(result: TechnicalsData, tick: Kline) {
      if (!this.state.mfi || !result.advanced) return;
      const mfi = this.state.mfi;

      const h = tick.high.toNumber();
      const l = tick.low.toNumber();
      const c = tick.close.toNumber();
      const v = tick.volume.toNumber();
      const tp = (h + l + c) / 3;
      const rawMf = tp * v;

      const posFlow = tp > mfi.prevTp ? rawMf : 0;
      const negFlow = tp < mfi.prevTp ? rawMf : 0;

      // Tentative sums: add the forming bar, remove the oldest if full
      let tentSumPos = mfi.sumPos + posFlow;
      let tentSumNeg = mfi.sumNeg + negFlow;
      if (mfi.window.length >= mfi.period) {
          tentSumPos -= mfi.window[0].posFlow;
          tentSumNeg -= mfi.window[0].negFlow;
      }

      let mfiVal: number;
      if (tentSumPos + tentSumNeg === 0) {
          mfiVal = 50;
      } else if (tentSumNeg === 0) {
          mfiVal = 100;
      } else {
          const mfr = tentSumPos / tentSumNeg;
          mfiVal = 100 - 100 / (1 + mfr);
      }

      let action: "Buy" | "Sell" | "Neutral" = "Neutral";
      if (mfiVal > 80)  action = "Sell";
      else if (mfiVal < 20) action = "Buy";

      result.advanced.mfi = { value: mfiVal, action };
  }

  private reconstructMfiState(history: Kline[]) {
      const period = this.settings?.mfi?.length || 14;
      if (!this.enabled("mfi") || history.length < period + 1) {
          this.state.mfi = undefined;
          return;
      }

      const start = Math.max(0, history.length - period - 1);
      const window: { tp: number; posFlow: number; negFlow: number }[] = [];
      let sumPos = 0;
      let sumNeg = 0;
      let prevTp = (history[start].high.toNumber() + history[start].low.toNumber() + history[start].close.toNumber()) / 3;

      for (let i = start + 1; i < history.length; i++) {
          const h = history[i].high.toNumber();
          const l = history[i].low.toNumber();
          const c = history[i].close.toNumber();
          const v = history[i].volume.toNumber();
          const tp = (h + l + c) / 3;
          const rawMf = tp * v;

          const posFlow = tp > prevTp ? rawMf : 0;
          const negFlow = tp < prevTp ? rawMf : 0;

          window.push({ tp, posFlow, negFlow });
          sumPos += posFlow;
          sumNeg += negFlow;
          prevTp = tp;
      }

      this.state.mfi = { period, window, sumPos, sumNeg, prevTp };
  }

  private updateAtrGroup(result: TechnicalsData, tick: Kline) {
      if (!this.state.atr || !result.volatility) return;
      
      const len = this.settings?.atr?.length || 14;
      const state = this.state.atr[len];
      if (state) {
          const h = tick.high.toNumber();
          const l = tick.low.toNumber();
          const c = tick.close.toNumber();
          // Current TR uses PREVIOUS close (which is in state)
          const tr = Math.max(h - l, Math.abs(h - state.prevClose), Math.abs(l - state.prevClose));

          // RMA update for forming candle
          // NewATR = (PrevATR * (n-1) + CurrentTR) / n
          const newAtr = (state.prevAtr * (len - 1) + tr) / len;
          result.volatility.atr = newAtr;
      }
  }

  private reconstructAtrState(history: Kline[]) {
      const len = this.settings?.atr?.length || 14;
      if (!this.enabled("atr") || history.length < len + 1) {
          this.state.atr = undefined;
          return;
      }

      // Use full history for best RMA precision
      let atr = 0;
      
      // Calculate initial SMA of TR for first ATR value
      // Need at least len+1 data points
      if (history.length <= len) return;

      // SMA for first 'len' periods
      // Starting from index 1 (since index 0 has no prevClose)
      for (let i = 1; i <= len; i++) {
          const h = history[i].high.toNumber();
          const l = history[i].low.toNumber();
          const pc = history[i-1].close.toNumber();
          const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
          atr += tr;
      }
      atr /= len;

      // RMA for rest
      let prevC = history[len].close.toNumber();
      for (let i = len + 1; i < history.length; i++) {
          const h = history[i].high.toNumber();
          const l = history[i].low.toNumber();
          const c = history[i].close.toNumber();
          const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
          atr = (atr * (len - 1) + tr) / len;
          prevC = c;
      }

      this.state.atr = { [len]: { prevAtr: atr, prevClose: prevC } };
  }

  private updateStochRsiGroup(result: TechnicalsData, price: number) {
      const len = this.settings?.stochRsi?.length || 14;
      const kPeriod = this.settings?.stochRsi?.kPeriod || 3;
      const rsiLen = this.settings?.stochRsi?.rsiLength || 14;
      
      const state = this.state.stochRsi?.[len];
      if (!state) return;

      // Calculate forming candle RSI
      const { rsi } = JSIndicators.updateRsi(
          state.rsiState.avgGain,
          state.rsiState.avgLoss,
          price,
          state.rsiState.prevPrice,
          rsiLen
      );

      // Create a temporary sliding window including the forming RSI
      const currentWindow = [...state.rsiHistory, rsi];
      if (currentWindow.length > len) {
          currentWindow.shift(); // keep it to size 'len'
      }

      // Compute Stochastic raw %K over this window
      let highestRsi = Math.max(...currentWindow);
      let lowestRsi = Math.min(...currentWindow);
      
      let rawKVal = 50;
      if (highestRsi !== lowestRsi) {
          rawKVal = ((rsi - lowestRsi) / (highestRsi - lowestRsi)) * 100;
      }
      
      // Create a temporary sliding window for smoothed %K
      const currentKWindow = [...state.rawKHistory, rawKVal];
      if (currentKWindow.length > kPeriod) {
          currentKWindow.shift();
      }
      
      let stochKVal = 0;
      if (currentKWindow.length > 0) {
          for (const k of currentKWindow) stochKVal += k;
          stochKVal /= currentKWindow.length;
      }

      // Find the StochRSI entry and update
      const stInd = result.oscillators.find(o => o.name === "StochRSI");
      if (stInd) {
          stInd.value = stochKVal;
      }
  }

  private reconstructStochRsiState(history: Kline[]) {
      const len = this.settings?.stochRsi?.length || 14;
      const rsiLen = this.settings?.stochRsi?.rsiLength || 14;
      
      if (!this.enabled("stochrsi") || history.length < Math.max(len, rsiLen) + 1) {
          this.state.stochRsi = undefined;
          return;
      }

      const closes = history.map(k => k.close.toNumber());
      const rsiArray = new Float64Array(closes.length);
      JSIndicators.rsi(closes, rsiLen, rsiArray);

      const rsiWindow = Array.from(rsiArray.slice(-len));
      
      let avgGain = 0;
      let avgLoss = 0;
      // Reconstruct RSI State using same RMA logic for consistency
      // Start RMA from index rsiLen
      // Need initial SMA
      for(let i=1; i<=rsiLen; i++) {
          const diff = closes[i] - closes[i-1];
          if (diff > 0) avgGain += diff;
          else avgLoss -= diff;
      }
      avgGain /= rsiLen;
      avgLoss /= rsiLen;

      for(let i=rsiLen+1; i<closes.length; i++) {
          const diff = closes[i] - closes[i-1];
          const gain = diff > 0 ? diff : 0;
          const loss = diff < 0 ? -diff : 0;
          avgGain = (avgGain * (rsiLen - 1) + gain) / rsiLen;
          avgLoss = (avgLoss * (rsiLen - 1) + loss) / rsiLen;
      }

      const kPeriod = this.settings?.stochRsi?.kPeriod || 3;
      const rawKHistory: number[] = [];
      
      // Rebuild rawK history
      for (let i = 0; i < kPeriod; i++) {
         const idx = rsiArray.length - kPeriod + i;
         if (idx >= len - 1) {
             const window = rsiArray.slice(idx - len + 1, idx + 1);
             const maxRsi = Math.max(...window);
             const minRsi = Math.min(...window);
             const r = maxRsi - minRsi;
             rawKHistory.push(r === 0 ? 50 : ((rsiArray[idx] - minRsi) / r) * 100);
         } else {
             rawKHistory.push(50);
         }
      }

      this.state.stochRsi = {
          [len]: {
              length: len,
              rsiState: {
                  avgGain,
                  avgLoss,
                  prevPrice: closes[closes.length - 1]
              },
              rsiHistory: rsiWindow,
              rawKHistory: rawKHistory
          }
      };
  }
}
