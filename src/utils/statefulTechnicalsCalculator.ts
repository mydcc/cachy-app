
/*
 * Copyright (C) 2026 MYDCT
 *
 * Stateful Technicals Calculator
 * Manages the state of technical indicators to allow for O(1) incremental updates.
 */

import { Decimal } from "decimal.js";
import { JSIndicators, type Kline } from "./indicators";
import { calculateAllIndicators } from "./technicalsCalculator";
import type { TechnicalsData, TechnicalsState, EmaState, RsiState } from "../services/technicalsTypes";

export class StatefulTechnicalsCalculator {
  private state: TechnicalsState = {
    lastCandle: null,
    ema: {},
    rsi: {}
  };

  private settings: any;
  private enabledIndicators: Partial<Record<string, boolean>> | undefined;

  // History Buffers for SMA/Bollinger (Sliding Window)
  // Key: "close", "high", "low" -> Ring Buffer
  private historyBuffers: Record<string, Float64Array> = {};
  private historyIndex: number = 0;
  private historySize: number = 200; // Sufficient for standard MAs. Can be dynamic.

  constructor() {}

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

    // 3. Update SMA
    // For SMA, we need the value falling out of the window.
    // The current window ends at 'lastCandle'. The value dropping out is at (index - period).
    // In our ring buffer, we store historical closes.
    // 'historyIndex' points to the NEXT write slot (which corresponds to 'lastCandle' position in abstract).
    // Actually, let's keep it simple: RingBuffer stores CLOSED candles.
    // 'currentPrice' is the forming candle.
    if (this.state.sma && this.enabled("sma")) {
        this.updateSmaGroup(newResult, currentPrice);
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

      const lastClose = this.state.lastCandle.close.toNumber();

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

      // 2. Shift History
      // Push the finalized lastClose to ring buffer
      if (this.historyBuffers["close"]) {
          this.historyBuffers["close"][this.historyIndex] = lastClose;
          this.historyIndex = (this.historyIndex + 1) % this.historySize;
      }

      this.state.lastCandle = newCandle;

      // Note: 'lastResult' is not updated here.
      // The first 'update()' call on the new candle will generate the new result based on this shifted state.
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
          this.state.sma[len] = { prevSum: smaVal * len };
      }
  }

  private initHistoryBuffers(history: Kline[]) {
      // Fill ring buffer with last N closes
      const len = history.length;
      this.historyBuffers["close"] = new Float64Array(this.historySize);

      const start = Math.max(0, len - this.historySize);
      let writeIdx = 0;
      for(let i=start; i<len; i++) {
          this.historyBuffers["close"][writeIdx] = history[i].close.toNumber();
          writeIdx++;
      }
      this.historyIndex = writeIdx % this.historySize;
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

          if (state && this.historyBuffers["close"]) {
              // Retrieve the OLD value that is falling out of the window.
              // The window is length 'len'.
              // The 'current' window includes 'price'.
              // So we need the value at index (now - len).
              // 'historyIndex' points to next write (which is effectively T).
              // So T-1 is at historyIndex-1.
              // T-len is at historyIndex - len.

              let oldIdx = this.historyIndex - len;
              if (oldIdx < 0) oldIdx += this.historySize;

              const oldVal = this.historyBuffers["close"][oldIdx];

              // Calc new SMA
              // SMA_new = (Sum_prev - Old + New) / N
              // Wait, 'state.prevSum' is sum of [T-N .. T-1].
              // New Sum = prevSum - Val[T-N] + Price.
              // This is correct.

              const newSum = state.prevSum - oldVal + price;
              const newSma = newSum / len;

              // Update BB
              // We need StdDev for BB.
              // Incremental StdDev is hard (requires sum of squares).
              // For now, we can iterate the ring buffer for StdDev (O(N) but small N=20).
              // This is much faster than iterating 1000 candles.

              let sumSqDiff = 0;
              // Iterate window to calc Variance
              for(let i=0; i<len-1; i++) {
                  // Reconstruct index
                  let idx = this.historyIndex - 1 - i;
                  if (idx < 0) idx += this.historySize;
                  const val = this.historyBuffers["close"][idx];
                  sumSqDiff += Math.pow(val - newSma, 2);
              }
              // Add current price
              sumSqDiff += Math.pow(price - newSma, 2);

              const std = Math.sqrt(sumSqDiff / len);

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
