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

  it('should filter patterns based on trend requirements', () => {
      // Hammer requires a downtrend.
      // Create a Hammer candle
      const hammerCandle: CandleData = {
          open: 100,
          close: 102,
          high: 103,
          low: 80 // Long lower wick
      };

      // 1. Create an UPTREND history (5 candles) + Hammer
      // 10, 20, 30, 40, 50 -> Uptrend
      const uptrendHistory: CandleData[] = [
          { open: 10, close: 15, high: 20, low: 5 },
          { open: 20, close: 25, high: 30, low: 15 },
          { open: 30, close: 35, high: 40, low: 25 },
          { open: 40, close: 45, high: 50, low: 35 },
          { open: 50, close: 55, high: 60, low: 45 },
          hammerCandle
      ];

      const detectedUptrend = patternDetector.detect(uptrendHistory);
      // Should NOT contain hammer because it requires downtrend
      expect(detectedUptrend).not.toContain('hammer');

      // 2. Create a DOWNTREND history (5 candles) + Hammer
      // 100, 90, 80, 70, 60 -> Downtrend
      const downtrendHistory: CandleData[] = [
          { open: 100, close: 95, high: 105, low: 90 },
          { open: 90, close: 85, high: 95, low: 80 },
          { open: 80, close: 75, high: 85, low: 70 },
          { open: 70, close: 65, high: 75, low: 60 },
          { open: 60, close: 55, high: 65, low: 50 },
          hammerCandle
      ];

      const detectedDowntrend = patternDetector.detect(downtrendHistory);
      expect(detectedDowntrend).toContain('hammer');
  });

  it('should match legacy behavior for insufficient history (skip trend check)', () => {
      // Hammer requires downtrend.
      // If we only provide the hammer candle (history = 1), we can't check trend (needs 5+1).
      // Old behavior: Skip trend check -> Match based on shape.
      const hammerCandle: CandleData = {
          open: 100,
          close: 102,
          high: 103,
          low: 80,
          trend: 'downtrend' // The pattern definition has this
      };

      // We need to use a pattern that actually HAS a trend requirement.
      // 'hammer' has trend: 'downtrend'.

      // Test using the public 'detect' method which we optimized
      const detected = patternDetector.detect([hammerCandle]);

      // If we preserve legacy behavior, it should MATCH (ignore missing trend).
      // If we followed reviewer suggestion, it would NOT match.
      expect(detected).toContain('hammer');
  });
});
