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
  private normalizedTemplates: Map<string, CandleData[]> = new Map();

  constructor() {
    this.precomputeTemplates();
  }

  private precomputeTemplates() {
    for (const pattern of CANDLESTICK_PATTERNS) {
      this.normalizedTemplates.set(pattern.id, this.normalizeSequence(pattern.candles));
    }
  }

  /**
   * Main entry point to detect patterns.
   * @param candles The list of candles to analyze (most recent last).
   * @returns List of detected pattern IDs.
   */
  public detect(candles: CandleData[]): string[] {
    const detected: string[] = [];
    const cache = new Map<number, CandleData[]>();

    // We only check for patterns ending at the last candle
    // Loop through all defined patterns
    for (const pattern of CANDLESTICK_PATTERNS) {
      if (this.checkPattern(pattern, candles, cache)) {
        detected.push(pattern.id);
      }
    }

    return detected;
  }

  public checkPattern(pattern: PatternDefinition, candles: CandleData[], cache?: Map<number, CandleData[]>): boolean {
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
    // We utilize strict formulas derived from LuxAlgo PineScript where possible.
    switch (pattern.id) {
        case 'hammer':
            return this.isHammer(currentCandles[0]);
        case 'inverted_hammer':
            return this.isInvertedHammer(currentCandles[0]);
        case 'hanging_man':
            // Hanging Man is morphologically a Hammer, but at the top of a trend (Trend check handled above)
            return this.isHammer(currentCandles[0]);
        case 'shooting_star':
            // Shooting Star is morphologically an Inverted Hammer, but at the top of a trend
            return this.isInvertedHammer(currentCandles[0]);
        case 'bullish_engulfing':
            return this.isBullishEngulfing(currentCandles[0], currentCandles[1]);
        case 'bearish_engulfing':
            return this.isBearishEngulfing(currentCandles[0], currentCandles[1]);
        case 'morning_star':
            return this.isMorningStar(currentCandles[0], currentCandles[1], currentCandles[2]);
        case 'evening_star':
            return this.isEveningStar(currentCandles[0], currentCandles[1], currentCandles[2]);
    }

    // 3. Fallback: Geometric / Template Matcher
    return this.geometricMatch(pattern.id, pattern.candles, currentCandles, cache);
  }

  // --- Specific Pattern Logic (Formulas) ---

  /**
   * Hammer / Hanging Man:
   * - Lower shadow >= 2x body
   * - Upper shadow <= 10% of range
   */
  private isHammer(candle: CandleData): boolean {
    const body = Math.abs(candle.open - candle.close);
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const totalRange = candle.high - candle.low;

    if (totalRange === 0) return false;

    // LuxAlgo: Lower Wick > 2 * Body
    const cond1 = lowerShadow >= body * 2;
    // LuxAlgo: Upper Wick < 2% (We use 10% for slight tolerance)
    const cond2 = upperShadow <= totalRange * 0.1;

    return cond1 && cond2;
  }

  /**
   * Inverted Hammer / Shooting Star:
   * - Upper shadow >= 2x body
   * - Lower shadow <= 10% of range
   */
  private isInvertedHammer(candle: CandleData): boolean {
      const body = Math.abs(candle.open - candle.close);
      const upperShadow = candle.high - Math.max(candle.open, candle.close);
      const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
      const totalRange = candle.high - candle.low;

      if (totalRange === 0) return false;

      const cond1 = upperShadow >= body * 2;
      const cond2 = lowerShadow <= totalRange * 0.1;

      return cond1 && cond2;
  }

  private isBullishEngulfing(prev: CandleData, curr: CandleData): boolean {
      // 1. Prev is Bearish
      if (prev.close >= prev.open) return false;
      // 2. Curr is Bullish
      if (curr.close <= curr.open) return false;

      // 3. Engulfing: Curr Body > Prev Body (and wraps it)
      return curr.open <= prev.close && curr.close >= prev.open;
  }

  private isBearishEngulfing(prev: CandleData, curr: CandleData): boolean {
      // 1. Prev is Bullish
      if (prev.close <= prev.open) return false;
      // 2. Curr is Bearish
      if (curr.close >= curr.open) return false;

      // 3. Engulfing
      return curr.open >= prev.close && curr.close <= prev.open;
  }

  private isMorningStar(c1: CandleData, c2: CandleData, c3: CandleData): boolean {
      // 1. Long Bearish
      if (c1.close >= c1.open) return false;
      const body1 = Math.abs(c1.open - c1.close);
      const range1 = c1.high - c1.low;
      if (body1 < range1 * 0.5) return false;

      // 2. Small Body (Star)
      const body2 = Math.abs(c2.open - c2.close);
      if (body2 >= body1 * 0.5) return false;

      // 3. Long Bullish
      if (c3.close <= c3.open) return false;

      // 4. Position: C3 closes above midpoint of C1
      const midpoint1 = (c1.open + c1.close) / 2;
      return c3.close > midpoint1;
  }

  private isEveningStar(c1: CandleData, c2: CandleData, c3: CandleData): boolean {
      // 1. Long Bullish
      if (c1.close <= c1.open) return false;
      const body1 = Math.abs(c1.open - c1.close);
      const range1 = c1.high - c1.low;
      if (body1 < range1 * 0.5) return false;

      // 2. Small Body (Star)
      const body2 = Math.abs(c2.open - c2.close);
      if (body2 >= body1 * 0.5) return false;

      // 3. Long Bearish
      if (c3.close >= c3.open) return false;

      // 4. Position: C3 closes below midpoint of C1
      const midpoint1 = (c1.open + c1.close) / 2;
      return c3.close < midpoint1;
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

  private geometricMatch(patternId: string, template: CandleData[], input: CandleData[], cache?: Map<number, CandleData[]>): boolean {
      // Normalize both to 0..1 range based on their own min/max
      let normTemplate = this.normalizedTemplates.get(patternId);
      if (!normTemplate) {
        // Fallback for unknown patterns or if precomputation failed/was skipped
        normTemplate = this.normalizeSequence(template);
      }

      let normInput = cache?.get(input.length);
      if (!normInput) {
        normInput = this.normalizeSequence(input);
        cache?.set(input.length, normInput);
      }

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
