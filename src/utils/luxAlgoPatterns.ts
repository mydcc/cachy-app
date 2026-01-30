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

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  time?: number;
}

export interface PatternResult {
  name: string;
  code: string; // e.g., 'H', 'EG'
  signal: 'bullish' | 'bearish';
  index: number;
  description: string;
}

/**
 * Utility class to detect candlestick patterns based on LuxAlgo's logic.
 * Ported from static/lux_algo.pine
 */
export class LuxAlgoPatternDetector {
  private candles: Candle[];

  constructor(candles: Candle[]) {
    this.candles = candles;
  }

  /**
   * Main entry point to detect all patterns for the entire dataset.
   * Returns an array of detected patterns.
   */
  public detectAll(): PatternResult[] {
    const results: PatternResult[] = [];
    const len = this.candles.length;
    // We need at least a few candles to detect trends and patterns
    // PineScript runs on every bar. We iterate from start to end.

    // Donchian Channel State for Minor Trend
    const minorDCLength = 10;
    let minorDir = 0; // 1 = bull, -1 = bear

    // Helper to get slice for DC
    const getSlice = (endIdx: number, length: number) => {
        const start = Math.max(0, endIdx - length + 1);
        return this.candles.slice(start, endIdx + 1);
    };

    for (let i = 0; i < len; i++) {
        const current = this.candles[i];

        // --- Trend Detection (Donchian Channel) ---
        // Pine: upper = ta.highest(length), lower = ta.lowest(length)
        // Note: Pine's highest includes the current bar.
        const dcSlice = getSlice(i, minorDCLength);
        if (dcSlice.length > 0) {
            const upper = Math.max(...dcSlice.map(c => c.high));
            const lower = Math.min(...dcSlice.map(c => c.low));

            if (current.high === upper && minorDir !== 1) minorDir = 1;
            if (current.low === lower && minorDir !== -1) minorDir = -1;
        }

        const minorBull = minorDir === 1;
        const minorBear = minorDir === -1;

        // --- Candle Calculations ---
        // We pass 'i' to helper functions which will look back in 'this.candles'

        // Bullish Patterns (Require minorBear filter usually)
        if (minorBear) {
             if (this.isHammer(i)) results.push({ name: 'Hammer', code: 'H', signal: 'bullish', index: i, description: 'Hammer pattern: Small body, long lower wick.' });
             if (this.isInvertedHammer(i)) results.push({ name: 'Inverted Hammer', code: 'IH', signal: 'bullish', index: i, description: 'Inverted Hammer: Small body, long upper wick.' });
             if (this.isBullishEngulfing(i)) results.push({ name: 'Bullish Engulfing', code: 'EG▲', signal: 'bullish', index: i, description: 'Bullish candle engulfing previous bearish candle.' });
             // Rising 3 requires complex check, often continuation, but LuxAlgo checks it
             if (this.isRisingThree(i)) results.push({ name: 'Rising 3', code: 'R3', signal: 'bullish', index: i, description: 'Bullish continuation pattern.' });
             if (this.isThreeWhiteSoldiers(i)) results.push({ name: '3 White Soldiers', code: '3WS', signal: 'bullish', index: i, description: 'Three consecutive strong bullish candles.' });
             if (this.isMorningStar(i)) results.push({ name: 'Morning Star', code: 'MS', signal: 'bullish', index: i, description: 'Bullish reversal: Bearish, small body, Bullish.' });
             if (this.isBullishHarami(i)) results.push({ name: 'Bullish Harami', code: 'H▲', signal: 'bullish', index: i, description: 'Small bullish candle inside previous bearish candle.' });
             if (this.isTweezerBottom(i)) results.push({ name: 'Tweezer Bottom', code: 'TB', signal: 'bullish', index: i, description: 'Two candles with matching lows.' });
        }

        // Bearish Patterns (Require minorBull filter usually)
        if (minorBull) {
            if (this.isShootingStar(i)) results.push({ name: 'Shooting Star', code: 'SS', signal: 'bearish', index: i, description: 'Shooting Star: Small body, long upper wick.' });
            if (this.isHangingMan(i)) results.push({ name: 'Hanging Man', code: 'HM', signal: 'bearish', index: i, description: 'Hanging Man: Small body, long lower wick.' });
            if (this.isBearishEngulfing(i)) results.push({ name: 'Bearish Engulfing', code: 'EG▼', signal: 'bearish', index: i, description: 'Bearish candle engulfing previous bullish candle.' });
            if (this.isFallingThree(i)) results.push({ name: 'Falling 3', code: 'F3', signal: 'bearish', index: i, description: 'Bearish continuation pattern.' });
            if (this.isThreeBlackCrows(i)) results.push({ name: '3 Black Crows', code: '3BC', signal: 'bearish', index: i, description: 'Three consecutive strong bearish candles.' });
            if (this.isEveningStar(i)) results.push({ name: 'Evening Star', code: 'ES', signal: 'bearish', index: i, description: 'Bearish reversal: Bullish, small body, Bearish.' });
            if (this.isBearishHarami(i)) results.push({ name: 'Bearish Harami', code: 'H▼', signal: 'bearish', index: i, description: 'Small bearish candle inside previous bullish candle.' });
            if (this.isTweezerTop(i)) results.push({ name: 'Tweezer Top', code: 'TT', signal: 'bearish', index: i, description: 'Two candles with matching highs.' });
        }
    }

    return results;
  }

  // --- Helpers ---
  private get(i: number): Candle | undefined {
      return this.candles[i];
  }

  private props(i: number) {
      const c = this.candles[i];
      if (!c) return null;
      const close = c.close;
      const open = c.open;
      const high = c.high;
      const low = c.low;

      const rc = close < open;
      const gc = close > open;
      const c_top = Math.max(open, close);
      const c_bot = Math.min(open, close);
      const hl_width = high - low;
      const bod_width = c_top - c_bot;

      // Avoid division by zero
      const safe_hl = hl_width === 0 ? 0.0000001 : hl_width;

      const hw_per = ((high - c_top) / safe_hl) * 100;
      const lw_per = ((c_bot - low) / safe_hl) * 100;
      const b_per = (bod_width / safe_hl) * 100;

      // LuxAlgo doji definition: round_to_mintick(close) == round_to_mintick(open)
      // We will approximate with a very small epsilon or exact equality if inputs are numbers
      const doji = Math.abs(close - open) < (high - low) * 0.05; // Approximation if tick size unknown, or use exact

      return { rc, gc, c_top, c_bot, hl_width, bod_width, hw_per, lw_per, b_per, doji, high, low, close, open };
  }

  // --- Pattern Logic ---

  // Hammer: lw_per > (b_per*2) and b_per < 50 and hw_per < 2 and not doji
  private isHammer(i: number): boolean {
      const p = this.props(i);
      if (!p) return false;
      return p.lw_per > (p.b_per * 2) && p.b_per < 50 && p.hw_per < 2 && !p.doji;
  }

  // Inverted Hammer: hw_per > (b_per*2) and b_per < 50 and lw_per < 2 and not doji
  private isInvertedHammer(i: number): boolean {
      const p = this.props(i);
      if (!p) return false;
      return p.hw_per > (p.b_per * 2) && p.b_per < 50 && p.lw_per < 2 && !p.doji;
  }

  // Rising 3
  private isRisingThree(i: number): boolean {
      if (i < 4) return false;
      const p0 = this.props(i);     // Current
      const p1 = this.props(i - 1);
      const p2 = this.props(i - 2);
      const p3 = this.props(i - 3);
      const p4 = this.props(i - 4);
      if (!p0 || !p1 || !p2 || !p3 || !p4) return false;

      // (gc[4] and b_per[4] > 50)
      const cond1 = p4.gc && p4.b_per > 50;
      // (rc[3] and c_top[3] <= high[4] and c_bot[3] >= low[4])
      const cond2 = p3.rc && p3.c_top <= p4.high && p3.c_bot >= p4.low;
      // (rc[2] and c_top[2] <= high[4] and c_bot[2] >= low[4])
      const cond3 = p2.rc && p2.c_top <= p4.high && p2.c_bot >= p4.low;
      // (rc[1] and c_top[1] <= high[4] and c_bot[1] >= low[4])
      const cond4 = p1.rc && p1.c_top <= p4.high && p1.c_bot >= p4.low;
      // (gc and close > high[4] and b_per > 50)
      const cond5 = p0.gc && p0.close > p4.high && p0.b_per > 50;

      return cond1 && cond2 && cond3 && cond4 && cond5;
  }

  // Bullish Engulfing
  private isBullishEngulfing(i: number): boolean {
      if (i < 1) return false;
      const p0 = this.props(i);
      const p1 = this.props(i - 1);
      if (!p0 || !p1) return false;

      // rc[1] and gc and (bod_width > (bod_width[1]/2)) and (open < close[1]) and c_top > c_top[1] and (not rising_3) and (not doji[1])
      // Note: Rising 3 check omitted here to avoid recursion loop, but strictly per script it checks "not rising_3" which refers to the variable.
      // Since Rising 3 is 5 bars, checking it here (2 bars) is safe if we computed it previously or recompute.
      // Assuming 'rising_3' variable in Pine refers to the CURRENT bar being a Rising 3. If current is R3, it takes precedence?
      // Actually Pine calculates all vars per bar. If isRisingThree(i) is true, then Engulfing should be false.

      const basicCond = p1.rc && p0.gc &&
                        (p0.bod_width > (p1.bod_width / 2)) &&
                        (p0.open < p1.close) &&
                        (p0.c_top > p1.c_top) &&
                        !p1.doji;

      if (!basicCond) return false;
      return !this.isRisingThree(i);
  }

  // Three White Soldiers
  private isThreeWhiteSoldiers(i: number): boolean {
      if (i < 2) return false;
      const p0 = this.props(i);
      const p1 = this.props(i - 1);
      const p2 = this.props(i - 2);
      if (!p0 || !p1 || !p2) return false;

      // (gc[2] and b_per[2]>70)
      const cond1 = p2.gc && p2.b_per > 70;
      // (gc[1] and b_per[1]>70 and c_bot[1] >= c_bot[2] and c_bot[1] <= c_top[2] and close[1] > high[2])
      const cond2 = p1.gc && p1.b_per > 70 && p1.c_bot >= p2.c_bot && p1.c_bot <= p2.c_top && p1.close > p2.high;
      // (gc and b_per>70 and c_bot >= c_bot[1] and c_bot <= c_top[1] and close > high[1])
      const cond3 = p0.gc && p0.b_per > 70 && p0.c_bot >= p1.c_bot && p0.c_bot <= p1.c_top && p0.close > p1.high;

      return cond1 && cond2 && cond3;
  }

  // Morning Star
  private isMorningStar(i: number): boolean {
      if (i < 2) return false;
      const p0 = this.props(i);
      const p1 = this.props(i - 1);
      const p2 = this.props(i - 2);
      if (!p0 || !p1 || !p2) return false;

      const hl2_2 = (p2.high + p2.low) / 2;

      // (rc[2] and b_per[2] > 80)
      const cond1 = p2.rc && p2.b_per > 80;
      // (rc[1] and bod_width[1] < (bod_width[2]/2) and open[1] < close[2])
      // Note: Pine logic uses rc[1] but Morning Star middle candle can be green or red? LuxAlgo specifies rc[1].
      const cond2 = p1.rc && p1.bod_width < (p2.bod_width / 2) && p1.open < p2.close;
      // (gc and close > hl2[2])
      const cond3 = p0.gc && p0.close > hl2_2;

      return cond1 && cond2 && cond3;
  }

  // Bullish Harami
  private isBullishHarami(i: number): boolean {
      if (i < 1) return false;
      const p0 = this.props(i);
      const p1 = this.props(i - 1);
      if (!p0 || !p1) return false;

      // gc and (high <= c_top[1] and low >= c_bot[1]) and rc[1]
      return p0.gc && (p0.high <= p1.c_top && p0.low >= p1.c_bot) && p1.rc;
  }

  // Tweezer Bottom
  private isTweezerBottom(i: number): boolean {
      if (i < 1) return false;
      const p0 = this.props(i);
      const p1 = this.props(i - 1);
      if (!p0 || !p1) return false;

      // math.round_to_mintick(low) - math.round_to_mintick(low[1]) == 0 and gc and rc[1]
      // Using slight tolerance for floats
      const epsilon = (p0.high + p0.low) * 0.0001;
      const matchLow = Math.abs(p0.low - p1.low) < epsilon;

      return matchLow && p0.gc && p1.rc;
  }

  // Shooting Star
  private isShootingStar(i: number): boolean {
      const p = this.props(i);
      if (!p) return false;
      // (hw_per > (b_per*2) and b_per < 50 and lw_per < 2 and not doji)
      return p.hw_per > (p.b_per * 2) && p.b_per < 50 && p.lw_per < 2 && !p.doji;
  }

  // Hanging Man
  private isHangingMan(i: number): boolean {
      const p = this.props(i);
      if (!p) return false;
      // (lw_per > (b_per*2) and b_per < 50 and hw_per < 2 and not doji)
      return p.lw_per > (p.b_per * 2) && p.b_per < 50 && p.hw_per < 2 && !p.doji;
  }

  // Falling 3
  private isFallingThree(i: number): boolean {
      if (i < 4) return false;
      const p0 = this.props(i);
      const p1 = this.props(i - 1);
      const p2 = this.props(i - 2);
      const p3 = this.props(i - 3);
      const p4 = this.props(i - 4);
      if (!p0 || !p1 || !p2 || !p3 || !p4) return false;

      // (rc[4] and b_per[4] > 50)
      const cond1 = p4.rc && p4.b_per > 50;
      // (gc[3] and c_top[3] <= high[4] and c_bot[3] >= low[4])
      const cond2 = p3.gc && p3.c_top <= p4.high && p3.c_bot >= p4.low;
      // (gc[2] and c_top[2] <= high[4] and c_bot[2] >= low[4])
      const cond3 = p2.gc && p2.c_top <= p4.high && p2.c_bot >= p4.low;
      // (gc[1] and c_top[1] <= high[4] and c_bot[1] >= low[4])
      const cond4 = p1.gc && p1.c_top <= p4.high && p1.c_bot >= p4.low;
      // (rc and close < low[4] and b_per > 50)
      const cond5 = p0.rc && p0.close < p4.low && p0.b_per > 50;

      return cond1 && cond2 && cond3 && cond4 && cond5;
  }

  // Bearish Engulfing
  private isBearishEngulfing(i: number): boolean {
      if (i < 1) return false;
      const p0 = this.props(i);
      const p1 = this.props(i - 1);
      if (!p0 || !p1) return false;

      // gc[1] and rc and (bod_width > (bod_width[1]/2)) and (open > close[1]) and c_bot < c_bot[1] and (not falling_3 )and (not doji[1])
      const basicCond = p1.gc && p0.rc &&
                        (p0.bod_width > (p1.bod_width / 2)) &&
                        (p0.open > p1.close) &&
                        (p0.c_bot < p1.c_bot) &&
                        !p1.doji;

      if (!basicCond) return false;
      return !this.isFallingThree(i);
  }

  // Three Black Crows
  private isThreeBlackCrows(i: number): boolean {
      if (i < 2) return false;
      const p0 = this.props(i);
      const p1 = this.props(i - 1);
      const p2 = this.props(i - 2);
      if (!p0 || !p1 || !p2) return false;

      // (rc[2] and b_per[2]>70)
      const cond1 = p2.rc && p2.b_per > 70;
      // (rc[1] and b_per[1]>70 and c_top[1] <= c_top[2] and c_top[1] >= c_bot[2] and close[1] < low[2])
      const cond2 = p1.rc && p1.b_per > 70 && p1.c_top <= p2.c_top && p1.c_top >= p2.c_bot && p1.close < p2.low;
      // (rc and b_per>70 and c_top <= c_top[1] and c_top >= c_bot[1] and close < low[1])
      const cond3 = p0.rc && p0.b_per > 70 && p0.c_top <= p1.c_top && p0.c_top >= p1.c_bot && p0.close < p1.low;

      return cond1 && cond2 && cond3;
  }

  // Evening Star
  private isEveningStar(i: number): boolean {
      if (i < 2) return false;
      const p0 = this.props(i);
      const p1 = this.props(i - 1);
      const p2 = this.props(i - 2);
      if (!p0 || !p1 || !p2) return false;

      const hl2_2 = (p2.high + p2.low) / 2;

      // (gc[2] and b_per[2] > 80)
      const cond1 = p2.gc && p2.b_per > 80;
      // (gc[1] and bod_width[1] < (bod_width[2]/2) and open[1] > close[2])
      const cond2 = p1.gc && p1.bod_width < (p2.bod_width / 2) && p1.open > p2.close;
      // (rc and close < hl2[2])
      const cond3 = p0.rc && p0.close < hl2_2;

      return cond1 && cond2 && cond3;
  }

  // Bearish Harami
  private isBearishHarami(i: number): boolean {
      if (i < 1) return false;
      const p0 = this.props(i);
      const p1 = this.props(i - 1);
      if (!p0 || !p1) return false;

      // rc and (high <= c_top[1] and low >= c_bot[1]) and gc[1]
      return p0.rc && (p0.high <= p1.c_top && p0.low >= p1.c_bot) && p1.gc;
  }

  // Tweezer Top
  private isTweezerTop(i: number): boolean {
      if (i < 1) return false;
      const p0 = this.props(i);
      const p1 = this.props(i - 1);
      if (!p0 || !p1) return false;

      // math.round_to_mintick(high) - math.round_to_mintick(high[1]) == 0 and rc and gc[1]
      const epsilon = (p0.high + p0.low) * 0.0001;
      const matchHigh = Math.abs(p0.high - p1.high) < epsilon;

      return matchHigh && p0.rc && p1.gc;
  }
}
