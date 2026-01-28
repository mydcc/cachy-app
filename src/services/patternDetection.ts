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


import { CANDLESTICK_PATTERNS, type CandleData, type PatternDefinition } from './candlestickPatterns';

export class PatternDetector {

  /**
   * Main entry point to detect patterns.
   * @param candles The list of candles to analyze (most recent last).
   * @returns List of detected pattern IDs.
   */
  public detect(candles: CandleData[]): string[] {
    const detected: string[] = [];

    // We only check for patterns ending at the last candle
    // Loop through all defined patterns
    for (const pattern of CANDLESTICK_PATTERNS) {
      if (this.checkPattern(pattern, candles)) {
        detected.push(pattern.id);
      }
    }

    return detected;
  }

  public checkPattern(pattern: PatternDefinition, candles: CandleData[]): boolean {
    const patternLen = pattern.candles.length;
    if (candles.length < patternLen) return false;

    // Slice the relevant candles (last N)
    const currentCandles = candles.slice(-patternLen);

    // 1. Trend Check (if required)
    // We look at candles *before* the pattern to determine trend.
    // Example: if pattern needs downtrend, we check the N candles before the pattern start.
    const lookbackForTrend = 5;
    if (candles.length >= patternLen + lookbackForTrend) {
        const trendCandles = candles.slice(-(patternLen + lookbackForTrend), -patternLen);
        const requiredTrend = pattern.candles[0].trend;

        if (requiredTrend === 'downtrend' && !this.isDowntrend(trendCandles)) return false;
        if ((requiredTrend === 'uptrend' || requiredTrend === 'uptrend_peak') && !this.isUptrend(trendCandles)) return false;
    }

    // 2. Specific Logic overrides (for "Formula" accuracy)
    // We can add switch cases here for "Hardcoded" formulas like Hammer
    if (pattern.id === 'hammer') {
       return this.isHammer(currentCandles[0]);
    }
    if (pattern.id === 'bullish_engulfing') {
       return this.isBullishEngulfing(currentCandles[0], currentCandles[1]);
    }

    // 3. Fallback: Geometric / Template Matcher
    return this.geometricMatch(pattern.candles, currentCandles);
  }

  // --- Specific Pattern Logic (Formulas) ---

  /**
   * Hammer:
   * - Small body at top
   * - Lower shadow >= 2x body
   * - Very small upper shadow
   */
  private isHammer(candle: CandleData): boolean {
    const open = candle.open;
    const close = candle.close;
    const high = candle.high;
    const low = candle.low;

    const body = Math.abs(open - close);
    const upperShadow = high - Math.max(open, close);
    const lowerShadow = Math.min(open, close) - low;
    const totalRange = high - low;

    // Formula 1: Lower Shadow >= 2 * Body
    const condition1 = lowerShadow >= body * 2;

    // Formula 2: Upper Shadow very small (e.g. <= 10% of range or <= body)
    // The prompt says "Upper Shadow <= 0.1 * Range"
    const condition2 = upperShadow <= totalRange * 0.1;

    // Formula 3: Body in upper third (implied by shadows, but let's check)
    // Actually condition1+2 largely covers it.

    return condition1 && condition2;
  }

  private isBullishEngulfing(prev: CandleData, curr: CandleData): boolean {
      // 1. Prev is Bearish
      if (prev.close >= prev.open) return false;
      // 2. Curr is Bullish
      if (curr.close <= curr.open) return false;

      // 3. Engulfing: Curr Body > Prev Body (and wraps it)
      // Curr Open <= Prev Close (gap down or equal)
      // Curr Close >= Prev Open (gap up or equal)
      // Strict definition: body overlaps completely
      return curr.open <= prev.close && curr.close >= prev.open;
  }

  private isUptrend(candles: CandleData[]): boolean {
      // Simple heuristic: Start < End
      if (candles.length < 2) return false;
      return candles[candles.length - 1].close > candles[0].close;
  }

  private isDowntrend(candles: CandleData[]): boolean {
      if (candles.length < 2) return false;
      return candles[candles.length - 1].close < candles[0].close;
  }

  // --- Geometric Matcher ---

  private geometricMatch(template: CandleData[], input: CandleData[]): boolean {
      // Normalize both to 0..1 range based on their own min/max
      const normTemplate = this.normalizeSequence(template);
      const normInput = this.normalizeSequence(input);

      let totalDiff = 0;

      for (let i = 0; i < template.length; i++) {
          const t = normTemplate[i];
          const m = normInput[i];

          // Compare O, H, L, C relative positions
          // We assume 'trend' is handled outside, so we ignore absolute price levels
          // EXCEPT relative to the sequence range.

          totalDiff += Math.pow(t.open - m.open, 2);
          totalDiff += Math.pow(t.high - m.high, 2);
          totalDiff += Math.pow(t.low - m.low, 2);
          totalDiff += Math.pow(t.close - m.close, 2);
      }

      // Threshold: Heuristic.
      // If sum of squared errors is low, it's a match.
      // For 1 candle, max diff per point is 1. Max SSE is 4.
      // We want ~10% tolerance? 0.1^2 * 4 = 0.04 per candle.
      const tolerance = 0.05 * template.length;

      return totalDiff < tolerance;
  }

  private normalizeSequence(candles: CandleData[]): CandleData[] {
      let min = Infinity;
      let max = -Infinity;
      candles.forEach(c => {
          min = Math.min(min, c.low);
          max = Math.max(max, c.high);
      });

      const range = max - min;
      if (range === 0) return candles.map(c => ({ ...c, open: 0.5, high: 0.5, low: 0.5, close: 0.5 }));

      return candles.map(c => ({
          open: (c.open - min) / range,
          high: (c.high - min) / range,
          low: (c.low - min) / range,
          close: (c.close - min) / range,
          trend: c.trend
      }));
  }
}

export const patternDetector = new PatternDetector();
