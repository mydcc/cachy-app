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

    // 2. Extract State from the end of the calculation
    // Note: 'calculateAllIndicators' returns the FINAL value, but it doesn't currently return the internal state (like AvgGain for RSI).
    // This is a challenge. The stateless calculator discards the state.
    // OPTION A: Modifying `calculateAllIndicators` to return state.
    // OPTION B: Re-running the LAST step of the calculation logic here to reconstruct state.
    // Since we want minimal intrusion, we will reconstruct state for supported incremental indicators.

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

    // Update other non-incremental fields simply by carrying over or re-running light logic?
    // For MVP, we only increment supported ones. Others remain "stale" or we re-run them if cheap.
    // Actually, if we don't update them, they show the value from the last candle close.
    // This is often acceptable for complex indicators (e.g. Ichimoku) between ticks.
    // BUT user expects "Realtime".

    // Update State for next tick
    this.state.lastResult = newResult;
    // We do NOT update 'lastCandle' here if this is an "Update" to the *current* candle (forming).
    // If 'tick' is a NEW candle, we would shift.
    // Assumption: 'update' is called for price changes within the CURRENT latest candle.
    // If a new candle opens, 'initialize' (or a new 'shift' method) should be called.

    return newResult;
  }

  public shift(newCandle: Kline) {
      if (!this.state.lastResult || !this.state.lastCandle) return;

      // 1. Finalize State for the CLOSED candle (this.state.lastCandle)
      // This is crucial. 'state.ema' currently holds the value from the *previous* close (T-1).
      // We need to advance it to the current close (T) before starting T+1.

      const lastClose = newCandle.close.toNumber(); // Corrected to use the shifting-in candle

      // Advance EMA State
      if (this.state.ema && this.enabled("ema")) {
          Object.keys(this.state.ema).forEach(k => {
              const len = parseInt(k);
              const state = this.state.ema![len];
              // Calculate final EMA for the closed candle
              const finalEma = JSIndicators.updateEma(state.prevEma, lastClose, len);
              // Update state to this new finalized value
              state.prevEma = finalEma;
          });
      }

      // Advance RSI State
      if (this.state.rsi && this.enabled("rsi")) {
          Object.keys(this.state.rsi).forEach(k => {
              const len = parseInt(k);
              const state = this.state.rsi![len];
              // Update with the finalized close of the candle being shifted out
              const { avgGain, avgLoss } = JSIndicators.updateRsi(
                  state.avgGain, state.avgLoss,
                  lastClose, state.prevPrice, len
              );
              state.avgGain = avgGain;
              state.avgLoss = avgLoss;
              state.prevPrice = lastClose;
          });
      }


      // Advance SMA State (and SumSq)
      if (this.state.sma) {
          Object.keys(this.state.sma).forEach(k => {
              const len = parseInt(k);
              const state = this.state.sma![len];

              // We need to shift the window.
              // Remove oldest, Add lastClose.
              // But wait, 'this.priceHistory' still contains the OLD history (lastClose not added yet).
              // So 'oldest' is at index (size - len).

              if (this.priceHistory.getSize() >= len) {
                  const oldestIdx = this.priceHistory.getSize() - len;
                  const oldVal = this.priceHistory.get(oldestIdx);

                  if (oldVal !== undefined) {
                       // Update Sum
                       state.prevSum = state.prevSum - oldVal + lastClose;

                       // Update SumSq if tracked
                       if (state.prevSumSq !== undefined) {
                           state.prevSumSq = state.prevSumSq - (oldVal * oldVal) + (lastClose * lastClose);
                       }
                  }
              } else {
                  // Buffer not full, just add?
                  // If buffer not full, SMA is not valid yet?
                  // Or we are building up.
                  state.prevSum += lastClose;
                   if (state.prevSumSq !== undefined) {
                       state.prevSumSq += (lastClose * lastClose);
                   }
              }
          });
      }

// 2. Shift History
      // Push the finalized lastClose to circular buffer
      this.priceHistory.push(lastClose);

      this.state.lastCandle = newCandle;

      // Note: 'lastResult' is not updated here.
      // The first 'update()' call on the new candle will generate the new result based on this shifted state.
      // Advance MFI State when a new candle is confirmed (shift the window)
      if (this.state.mfi) {
          const mfiState = this.state.mfi;
          const h = newCandle.high.toNumber();
          const l = newCandle.low.toNumber();
          const c = newCandle.close.toNumber();
          const v = newCandle.volume.toNumber();
          const tp = (h + l + c) / 3;
          const rawMf = tp * v;

          const posFlow = tp > mfiState.prevTp ? rawMf : 0;
          const negFlow = tp < mfiState.prevTp ? rawMf : 0;

          // Shift the window: add new entry, remove oldest if window is full
          const entry = { tp, posFlow, negFlow };
          if (mfiState.window.length >= mfiState.period) {
              const removed = mfiState.window.shift()!;
              mfiState.sumPos -= removed.posFlow;
              mfiState.sumNeg -= removed.negFlow;
          }
          mfiState.window.push(entry);
          mfiState.sumPos += posFlow;
          mfiState.sumNeg += negFlow;
          mfiState.prevTp = tp;
      }

      // Advance ATR State
      if (this.state.atr && this.enabled("atr")) {
          Object.keys(this.state.atr).forEach(k => {
              const len = parseInt(k);
              const state = this.state.atr![len];
              const h = newCandle.high.toNumber();
              const l = newCandle.low.toNumber();
              const c = newCandle.close.toNumber();
              const tr = Math.max(h - l, Math.abs(h - state.prevClose), Math.abs(l - state.prevClose));
              state.prevAtr = (state.prevAtr * (len - 1) + tr) / len;
              state.prevClose = c;
          });
      }

      // Advance StochRSI State
      if (this.state.stochRsi && this.enabled("stochrsi")) {
          Object.keys(this.state.stochRsi).forEach(k => {
              const len = parseInt(k);
              const rsiLen = this.settings?.stochRsi?.rsiLength || 14;
              const state = this.state.stochRsi![len];
              const { avgGain, avgLoss, rsi } = JSIndicators.updateRsi(
                  state.rsiState.avgGain, state.rsiState.avgLoss,
                  lastClose, state.rsiState.prevPrice, rsiLen
              );
              state.rsiState.avgGain = avgGain;
              state.rsiState.avgLoss = avgLoss;
              state.rsiState.prevPrice = lastClose;
              
              state.rsiHistory.push(rsi);
              if (state.rsiHistory.length > state.length) {
                  state.rsiHistory.shift();
              }

              const smoothK = this.settings?.stochRsi?.kPeriod || 3;
              let highestRsi = Math.max(...state.rsiHistory);
              let lowestRsi = Math.min(...state.rsiHistory);
              let rawK = 50;
              if (highestRsi !== lowestRsi) {
                  rawK = ((rsi - lowestRsi) / (highestRsi - lowestRsi)) * 100;
              }
              state.rawKHistory.push(rawK);
              if (state.rawKHistory.length > smoothK) {
                  state.rawKHistory.shift();
              }
          });
      }
  }


  private enabled(key: string): boolean {
      if (!this.enabledIndicators) return true;
      return this.enabledIndicators[key.toLowerCase()] !== false;
  }

  private reconstructState(history: Kline[], result: TechnicalsData) {
      // Reconstruct EMA State
      // EMA State is just the last value.
      this.state.ema = {};
      result.movingAverages.forEach(ma => {
          if (ma.name === "EMA") {
             const period = parseInt(ma.params || "0");
             if (period > 0) {
                 this.state.ema![period] = { prevEma: ma.value };
             }
          }
      });

      // Reconstruct RSI State
      // This is harder. RSI = 100 - 100 / (1 + RS). RS = AvgGain / AvgLoss.
      // We know RSI value. We don't know AvgGain/AvgLoss magnitude, only their ratio.
      // However, correct incremental update requires true AvgGain/AvgLoss.
      // Solution: We must run a small "warmup" or trace back to calculate true AvgGain/AvgLoss.
      // Or, we accept a small error by inferring AvgGain/Loss from RSI assuming a normalized magnitude? No, that drifts.
      // Robust Solution: Calculate RSI separately here on history to get the state.
      // It costs O(N) once at init, which is fine.
      this.state.rsi = {};
      if (this.enabled("rsi")) {
          const rsiLen = this.settings?.rsi?.length || 14;
          const closes = history.map(k => k.close.toNumber());
          // We need to calculate full RSI series to get the final Average Gain/Loss.
          // JSIndicators.rsi doesn't return state.
          // We will use a helper that does, or just "warm up" manually.

          // Fast "Warmup" of state:
          let avgGain = 0;
          let avgLoss = 0;
          // Initial SMA
          for(let i=1; i<=rsiLen; i++) {
             const diff = closes[i] - closes[i-1];
             if (diff > 0) avgGain += diff;
             else avgLoss -= diff;
          }
          avgGain /= rsiLen;
          avgLoss /= rsiLen;

          // Wilder Smoothing
          for(let i=rsiLen+1; i<closes.length; i++) {
              const diff = closes[i] - closes[i-1];
              const gain = diff > 0 ? diff : 0;
              const loss = diff < 0 ? -diff : 0;
              avgGain = (avgGain * (rsiLen - 1) + gain) / rsiLen;
              avgLoss = (avgLoss * (rsiLen - 1) + loss) / rsiLen;
          }

          this.state.rsi[rsiLen] = {
              avgGain,
              avgLoss,
              prevPrice: closes[closes.length - 1]
          };
      }

      // Reconstruct SMA State
      // We need 'prevSum'. SMA = Sum / N. So prevSum = SMA * N.
      this.state.sma = {};
      // Iterate MAs, if SMA found
      // Actually SMA is not in default MAs list (only EMA 1/2/3).
      // But user can config. Let's support it if it appears.
      // Currently `technicalsCalculator` outputs EMAs primarily.
      // If we add SMA support to the app later, this logic is ready.
      // For now, let's enable it if we see "SMA".
      // But typically standard MAs in this app are EMAs.
      // Bollinger Bands use SMA.

      // Bollinger Support
      if (this.enabled("bb") && result.volatility?.bb) {
          // BB uses SMA(20).
          // We need to store the SUM of the last 20 closes.
          // result.volatility.bb.middle is the SMA value.
          const len = this.settings?.bb?.length || 20;
          const smaVal = result.volatility.bb.middle;
          // State: Sum = SMA * len
          // We store it under a specific key "BB" or generic "SMA:20"?
          // Let's use generic "SMA:length".
          // We need to know which indicator uses it during update.
          // For now, let's just store it for BB.

          // Optimization: Calculate initial SumSq for O(1) Variance updates
          let sumSq = 0;
          const histLen = history.length;
          const startIdx = Math.max(0, histLen - len);
          for (let i = startIdx; i < histLen; i++) {
              const val = history[i].close.toNumber();
              sumSq += val * val;
          }
          this.state.sma[len] = { prevSum: smaVal * len, prevSumSq: sumSq };
      }
  }

  private initHistoryBuffers(history: Kline[]) {
      // Fill circular buffer with historical closes
      const len = history.length;
      const start = Math.max(0, len - this.MAX_HISTORY_SIZE);
      
      for (let i = start; i < len; i++) {
          this.priceHistory.push(history[i].close.toNumber());
      }
  }

  private updateEmaGroup(result: TechnicalsData, price: number) {
      // Iterate over MAs in result
      result.movingAverages.forEach(ma => {
          if (ma.name === "EMA") {
              const period = parseInt(ma.params || "0");
              const state = this.state.ema?.[period];
              if (state) {
                  const newVal = JSIndicators.updateEma(state.prevEma, price, period);
                  ma.value = newVal;
                  // Note: In a real incremental system (streaming), we update the state.
                  // But here 'update' is called repeatedly for the SAME candle (intra-candle updates).
                  // So we do NOT overwrite 'state.prevEma'. 'state.prevEma' is the value at the *start* of the candle (or end of previous).
                  // Wait. 'initialize' sets state to the END of the last CLOSED candle?
                  // Scenario:
                  // 1. Init with 1000 closed candles. Last Close = 100. EMA = 90.
                  // 2. State.prevEma = 90.
                  // 3. New Tick (Candle 1001 forming). Price = 101.
                  // 4. Update: EMA = updateEma(90, 101).
                  // 5. Next Tick (Candle 1001 update). Price = 102.
                  // 6. Update: EMA = updateEma(90, 102).
                  // This assumes 'prevEma' is the confirmed EMA of the previous candle.
                  // Correct.
              }
          }
      });
  }

  private updateRsiGroup(result: TechnicalsData, price: number, prevClosedPrice: number) {
      const rsiLen = this.settings?.rsi?.length || 14;
      const state = this.state.rsi?.[rsiLen];
      if (state) {
          // prevAvgGain/Loss are from the *previous closed candle*.
          // prevPrice is the Close of the *previous closed candle*.

          const { rsi } = JSIndicators.updateRsi(
              state.avgGain,
              state.avgLoss,
              price,
              state.prevPrice,
              rsiLen
          );

          // Update result
          const rsiInd = result.oscillators.find(o => o.name === "RSI");
          if (rsiInd) {
              rsiInd.value = rsi;
              // Action logic could be duplicated here or extracted.
              // For now, minimal update.
          }
      }
  }

  private updateSmaGroup(result: TechnicalsData, price: number) {
      // Bollinger Bands Update
      if (this.state.sma && this.enabled("bb") && result.volatility?.bb) {
          const len = this.settings?.bb?.length || 20;
          const stdDev = this.settings?.bb?.stdDev || 2;
          const state = this.state.sma[len];

          if (state && this.priceHistory.getSize() >= len) {
              // Retrieve the OLD value that is falling out of the window
              // CircularBuffer: index 0 = oldest, getSize()-1 = newest
              // Window of length 'len' includes the current price
              // So we need the value at position (currentSize - len)
              const oldestInWindow = this.priceHistory.getSize() - len;
              const oldVal = this.priceHistory.get(oldestInWindow);

              if (oldVal !== undefined) {
                  // Calc new SMA
                  // SMA_new = (Sum_prev - Old + New) / N
                  const newSum = state.prevSum - oldVal + price;
                  const newSma = newSum / len;

                  // Update BB
                  // Optimization: Incremental Variance (O(1))
                  // Update SumSq: Remove old^2, Add new^2
                  // Note: state.prevSumSq is from the PREVIOUS closed candle.
                  const prevSumSq = state.prevSumSq || 0;
                  const newSumSq = prevSumSq - (oldVal * oldVal) + (price * price);

                  // Var = E[X^2] - (E[X])^2
                  const variance = Math.max(0, (newSumSq / len) - (newSma * newSma));
                  const std = Math.sqrt(variance);

                  result.volatility.bb = {
                      middle: newSma,
                      upper: newSma + std * stdDev,
                      lower: newSma - std * stdDev,
                      percentP: (result.volatility.bb.upper - result.volatility.bb.lower) === 0 ? 0.5 : (price - (newSma - std*stdDev)) / ((newSma + std*stdDev) - (newSma - std*stdDev))
                  };
              }
          }
      }
  }

  private updateMfiGroup(result: TechnicalsData, tick: Kline) {
      if (!this.state.mfi || !result.advanced) return;
      const mfi = this.state.mfi;

      // Compute the forming candle's contribution (not committed to state, just for the view)
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

      let action: string = "Neutral";
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

      // Build window from the last (period+1) candles of history
      // We need period+1 candles to compute period flows (each flow needs prev TP)
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
          const tr = Math.max(h - l, Math.abs(h - state.prevClose), Math.abs(l - state.prevClose));
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

      const startIndex = Math.max(1, history.length - len * 2); 
      let atr = 0;
      
      // Calculate initial SMA of TR for first ATR value
      for (let i = 1; i <= len; i++) {
          const h = history[i].high.toNumber();
          const l = history[i].low.toNumber();
          const pc = history[i-1].close.toNumber();
          const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
          atr += tr;
      }
      atr /= len;

      // Apply Wilder's Smoothing (RMA) for the rest
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

      // We need effectively the full RSI array first to build the Stoch window.
      const closes = history.map(k => k.close.toNumber());
      const rsiArray = new Float64Array(closes.length);
      JSIndicators.rsi(closes, rsiLen, rsiArray);

      // We only need the last 'len' RSI values for the history window
      const rsiWindow = Array.from(rsiArray.slice(-len));
      
      // We also need the RSI state (avgGain/Loss)
      let avgGain = 0;
      let avgLoss = 0;
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
