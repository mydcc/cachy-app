
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

  // We keep a small history buffer for indicators that need "Old Value" removal (like SMA)
  // For this MVP (EMA/RSI focus), we mainly need the previous calculated values.

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
}
