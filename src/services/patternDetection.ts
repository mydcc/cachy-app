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
  // Flattened normalized templates (Open, High, Low, Close sequence)
  private normalizedTemplates: Map<string, Float64Array> = new Map();
  private patternsByLength: Map<number, PatternDefinition[]> = new Map();
  // Shared buffer for input normalization to avoid allocation
  // Max pattern length is small (e.g. 7), so 128 doubles is enough (32 candles)
  private sharedBuffer: Float64Array = new Float64Array(128);

  constructor() {
    this.precomputeTemplates();
  }

  private precomputeTemplates() {
    for (const pattern of CANDLESTICK_PATTERNS) {
      this.normalizedTemplates.set(pattern.id, this.normalizeSequenceToBuffer(pattern.candles));

      const len = pattern.candles.length;
      if (!this.patternsByLength.has(len)) {
        this.patternsByLength.set(len, []);
      }
      this.patternsByLength.get(len)!.push(pattern);
    }
  }

  /**
   * Main entry point to detect patterns.
   * @param candles The list of candles to analyze (most recent last).
   * @returns List of detected pattern IDs.
   */
  public detect(candles: CandleData[]): string[] {
    const detected: string[] = [];
    const lookbackForTrend = 5;

    // Iterate over unique pattern lengths (e.g., 1, 2, 3, 5)
    for (const [length, patterns] of this.patternsByLength) {
        if (candles.length < length) continue;

        const startIndex = candles.length - length;

        // Optimization: Check trend once per length, without slicing
        let isUptrend: boolean | undefined;
        let isDowntrend: boolean | undefined;

        // Check if we have enough history for trend detection
        if (candles.length >= length + lookbackForTrend) {
            // Trend candles are from index (end - length - lookback) to (end - length)
            const trendStartIndex = candles.length - length - lookbackForTrend;
            const trendEndIndex = candles.length - length - 1; // Last candle of the trend period

            // Inline trend check logic
            isUptrend = candles[trendEndIndex].close > candles[trendStartIndex].close;
            isDowntrend = candles[trendEndIndex].close < candles[trendStartIndex].close;
        }

        // Optimization: Normalize input candles once per length, without allocating
        let min = Infinity;
        let max = -Infinity;
        // Only scan the relevant candles
        for (let i = startIndex; i < candles.length; i++) {
          const c = candles[i];
          if (c.low < min) min = c.low;
          if (c.high > max) max = c.high;
        }
        const range = max - min;
        const invRange = range === 0 ? 0 : 1 / range;

        // Fill sharedBuffer with normalized values
        for (let i = 0; i < length; i++) {
          const c = candles[startIndex + i];
          const offset = i * 4;
          if (invRange === 0) {
            this.sharedBuffer[offset] = 0.5;
            this.sharedBuffer[offset + 1] = 0.5;
            this.sharedBuffer[offset + 2] = 0.5;
            this.sharedBuffer[offset + 3] = 0.5;
          } else {
            this.sharedBuffer[offset] = (c.open - min) * invRange;
            this.sharedBuffer[offset + 1] = (c.high - min) * invRange;
            this.sharedBuffer[offset + 2] = (c.low - min) * invRange;
            this.sharedBuffer[offset + 3] = (c.close - min) * invRange;
          }
        }

        for (const pattern of patterns) {
            // 1. Trend Check
            if (pattern.candles[0].trend && isUptrend !== undefined) {
                const requiredTrend = pattern.candles[0].trend;

                if (requiredTrend === 'downtrend' && !isDowntrend) continue;
                if ((requiredTrend === 'uptrend' || requiredTrend === 'uptrend_peak') && !isUptrend) continue;
            }

            // 2. Specific Logic overrides (for "Formula" accuracy)
            const specificMatch = this.checkSpecificLogicNoAlloc(pattern.id, candles, startIndex);
            if (specificMatch !== null) {
                if (specificMatch) detected.push(pattern.id);
                continue;
            }

            // 3. Fallback: Geometric / Template Matcher (Fast Path)
            if (this.geometricMatchFast(pattern.id, length)) {
                detected.push(pattern.id);
            }
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
    const lookbackForTrend = 5;
    if (candles.length >= patternLen + lookbackForTrend) {
        const trendCandles = candles.slice(-(patternLen + lookbackForTrend), -patternLen);
        const requiredTrend = pattern.candles[0].trend;

        if (requiredTrend === 'downtrend' && !this.isDowntrend(trendCandles)) return false;
        if ((requiredTrend === 'uptrend' || requiredTrend === 'uptrend_peak') && !this.isUptrend(trendCandles)) return false;
    }

    // 2. Specific Logic overrides
    const specific = this.checkSpecificLogic(pattern.id, currentCandles);
    if (specific !== null) return specific;

    // 3. Fallback: Geometric / Template Matcher
    // Normalize to sharedBuffer and use fast path
    let min = Infinity;
    let max = -Infinity;
    for (const c of currentCandles) {
        if (c.low < min) min = c.low;
        if (c.high > max) max = c.high;
    }
    const range = max - min;
    const invRange = range === 0 ? 0 : 1 / range;

    for (let i = 0; i < patternLen; i++) {
        const c = currentCandles[i];
        const offset = i * 4;
        if (invRange === 0) {
            this.sharedBuffer[offset] = 0.5;
            this.sharedBuffer[offset+1] = 0.5;
            this.sharedBuffer[offset+2] = 0.5;
            this.sharedBuffer[offset+3] = 0.5;
        } else {
            this.sharedBuffer[offset] = (c.open - min) * invRange;
            this.sharedBuffer[offset+1] = (c.high - min) * invRange;
            this.sharedBuffer[offset+2] = (c.low - min) * invRange;
            this.sharedBuffer[offset+3] = (c.close - min) * invRange;
        }
    }

    return this.geometricMatchFast(pattern.id, patternLen);
  }

  private checkSpecificLogicNoAlloc(patternId: string, candles: CandleData[], startIndex: number): boolean | null {
    switch (patternId) {
        case 'hammer':
            return this.isHammer(candles[startIndex]);
        case 'inverted_hammer':
            return this.isInvertedHammer(candles[startIndex]);
        case 'hanging_man':
            // Hanging Man is morphologically a Hammer, but at the top of a trend
            return this.isHammer(candles[startIndex]);
        case 'shooting_star':
            // Shooting Star is morphologically an Inverted Hammer, but at the top of a trend
            return this.isInvertedHammer(candles[startIndex]);
        case 'bullish_engulfing':
            return this.isBullishEngulfing(candles[startIndex], candles[startIndex+1]);
        case 'bearish_engulfing':
            return this.isBearishEngulfing(candles[startIndex], candles[startIndex+1]);
        case 'morning_star':
            return this.isMorningStar(candles[startIndex], candles[startIndex+1], candles[startIndex+2]);
        case 'evening_star':
            return this.isEveningStar(candles[startIndex], candles[startIndex+1], candles[startIndex+2]);
        default:
            return null;
    }
  }

  private checkSpecificLogic(patternId: string, currentCandles: CandleData[]): boolean | null {
    switch (patternId) {
        case 'hammer':
            return this.isHammer(currentCandles[0]);
        case 'inverted_hammer':
            return this.isInvertedHammer(currentCandles[0]);
        case 'hanging_man':
            return this.isHammer(currentCandles[0]);
        case 'shooting_star':
            return this.isInvertedHammer(currentCandles[0]);
        case 'bullish_engulfing':
            return this.isBullishEngulfing(currentCandles[0], currentCandles[1]);
        case 'bearish_engulfing':
            return this.isBearishEngulfing(currentCandles[0], currentCandles[1]);
        case 'morning_star':
            return this.isMorningStar(currentCandles[0], currentCandles[1], currentCandles[2]);
        case 'evening_star':
            return this.isEveningStar(currentCandles[0], currentCandles[1], currentCandles[2]);
        default:
            return null;
    }
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
      if (prev.close >= prev.open) return false;
      if (curr.close <= curr.open) return false;
      return curr.open <= prev.close && curr.close >= prev.open;
  }

  private isBearishEngulfing(prev: CandleData, curr: CandleData): boolean {
      if (prev.close <= prev.open) return false;
      if (curr.close >= curr.open) return false;
      return curr.open >= prev.close && curr.close <= prev.open;
  }

  private isMorningStar(c1: CandleData, c2: CandleData, c3: CandleData): boolean {
      if (c1.close >= c1.open) return false;
      const body1 = Math.abs(c1.open - c1.close);
      const range1 = c1.high - c1.low;
      if (body1 < range1 * 0.5) return false;

      const body2 = Math.abs(c2.open - c2.close);
      if (body2 >= body1 * 0.5) return false;

      if (c3.close <= c3.open) return false;

      const midpoint1 = (c1.open + c1.close) / 2;
      return c3.close > midpoint1;
  }

  private isEveningStar(c1: CandleData, c2: CandleData, c3: CandleData): boolean {
      if (c1.close <= c1.open) return false;
      const body1 = Math.abs(c1.open - c1.close);
      const range1 = c1.high - c1.low;
      if (body1 < range1 * 0.5) return false;

      const body2 = Math.abs(c2.open - c2.close);
      if (body2 >= body1 * 0.5) return false;

      if (c3.close >= c3.open) return false;

      const midpoint1 = (c1.open + c1.close) / 2;
      return c3.close < midpoint1;
  }

  private isUptrend(candles: CandleData[]): boolean {
      if (candles.length < 2) return false;
      return candles[candles.length - 1].close > candles[0].close;
  }

  private isDowntrend(candles: CandleData[]): boolean {
      if (candles.length < 2) return false;
      return candles[candles.length - 1].close < candles[0].close;
  }

  // --- Geometric Matcher ---

  private geometricMatchFast(patternId: string, length: number): boolean {
      const normTemplate = this.normalizedTemplates.get(patternId);
      if (!normTemplate) return false;

      let totalDiff = 0;
      const tolerance = 0.05 * length;

      // normTemplate is Float64Array of size length * 4
      const count = length * 4;

      for (let i = 0; i < count; i++) {
          const diff = normTemplate[i] - this.sharedBuffer[i];
          totalDiff += diff * diff;

          if (totalDiff >= tolerance) return false;
      }

      return true;
  }

  private normalizeSequenceToBuffer(candles: CandleData[]): Float64Array {
      let min = Infinity;
      let max = -Infinity;
      candles.forEach(c => {
          min = Math.min(min, c.low);
          max = Math.max(max, c.high);
      });

      const range = max - min;
      const invRange = range === 0 ? 0 : 1 / range;
      const len = candles.length;
      const buffer = new Float64Array(len * 4);

      for (let i = 0; i < len; i++) {
          const c = candles[i];
          const offset = i * 4;
          if (invRange === 0) {
              buffer[offset] = 0.5;
              buffer[offset+1] = 0.5;
              buffer[offset+2] = 0.5;
              buffer[offset+3] = 0.5;
          } else {
              buffer[offset] = (c.open - min) * invRange;
              buffer[offset+1] = (c.high - min) * invRange;
              buffer[offset+2] = (c.low - min) * invRange;
              buffer[offset+3] = (c.close - min) * invRange;
          }
      }
      return buffer;
  }
}

export const patternDetector = new PatternDetector();
