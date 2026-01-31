/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */


import { describe, it, expect } from 'vitest';
import { patternDetector } from './patternDetection';
import type { CandleData } from './candlestickPatterns';

describe('PatternDetector', () => {
  it('should detect a spinning top pattern via geometric match', () => {
    // Spinning top template: Open 50, High 65, Low 35, Close 52.
    // Normalized (roughly): Range=30. Min=35.
    // Open=(50-35)/30=0.5. High=(65-35)/30=1. Low=0. Close=(52-35)/30=0.566.

    // Let's create a candle that closely matches this geometry.
    // Using 100 as base. Range 10.
    // Open=105. High=110. Low=100. Close=105.66.
    const candle: CandleData = {
      open: 50,
      high: 65,
      low: 35,
      close: 52
    };

    const detected = patternDetector.detect([candle]);
    expect(detected).toContain('spinning_top');
  });

  it('should detect a doji pattern', () => {
      const candle: CandleData = {
          open: 100,
          high: 110,
          low: 90,
          close: 100.1 // Very small body
      };

      const detected = patternDetector.detect([candle]);
      expect(detected).toContain('doji');
  });

  it('should detect complex patterns (Bullish Engulfing) via formula override', () => {
      const prev: CandleData = {
          open: 100,
          high: 105,
          low: 95,
          close: 96 // Bearish
      };
      const curr: CandleData = {
          open: 95, // Opens below prev close
          high: 106,
          low: 94,
          close: 101 // Closes above prev open
      };

      const detected = patternDetector.detect([prev, curr]);
      expect(detected).toContain('bullish_engulfing');
  });
});
