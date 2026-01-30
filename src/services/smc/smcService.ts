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

import { type Pivot, type Structure, type OrderBlock, type FairValueGap, type SMCResult, TrendBias } from './types';

export interface SMCCandle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

export class SMCService {
    private length: number = 50; // Swing length from Pine inputs (default 50)

    constructor(length: number = 50) {
        this.length = length;
    }

    public analyze(candles: SMCCandle[]): SMCResult {
        const result: SMCResult = {
            swings: [],
            structures: [],
            orderBlocks: [],
            fairValueGaps: [],
            currentTrend: TrendBias.NEUTRAL
        };

        if (candles.length < this.length * 2) {
            return result;
        }

        // State variables (simulating Pine's 'var')
        let swingHigh: Pivot | null = null;
        let swingLow: Pivot | null = null;
        let trend = TrendBias.NEUTRAL;

        // We simulate the Pine script execution bar by bar
        // Ideally we only process the last N bars if performance is an issue,
        // but for pattern detection we often need history.
        // We start from 'length' to allow lookback.

        for (let i = this.length; i < candles.length; i++) {
            const currentCandle = candles[i];
            const prevCandle = candles[i - 1];

            // 1. Swing Detection (High/Low)
            // Pine: high[size] > ta.highest(size) -> checks if the high 'size' bars ago was the highest
            // To detect a swing point at index (i - length), we check if it was the highest in its neighborhood.
            // This is a simplified Pivot High/Low check.

            // Note: Pine's logic `newLegHigh = high[size] > ta.highest(size)` usually implies looking at the *current* bar
            // relative to the *previous* range. But for Swing Points (Fractals), we usually check left/right neighbors.
            // The Pine script provided uses a specific "Leg" logic.
            // `leg(size)` function:
            // newLegHigh = high[size] > ta.highest(size)  <-- This means high at i-size > highest of (current i back to i-size+1 ?)
            // Actually ta.highest(size) in Pine is highest of *last* size bars including current.
            // if high[size] > highest(size), it effectively means the high 'size' bars ago is higher than anything SINCE then.

            // Let's implement the specific logic:
            // At bar `i`, we look back `length` bars.
            // The candidate for swing is at `i - length`.
            const swingIndex = i - this.length;
            if (swingIndex < 0) continue;

            const swingCandle = candles[swingIndex];

            // Check if swingCandle.high is highest in the range [i - length + 1 ... i]
            // This confirms it's a local high relative to the *right* side (most recent bars).
            // We usually also need to check the *left* side, but the Pine script `leg` logic seems to focus on "start of new leg" via breakouts.

            // Let's adopt a standard Pivot High/Low logic compatible with SMC:
            // Pivot High: High[i-length] is highest in [i-2*length ... i]
            // This is computationally expensive O(N*M). Optimized:

            // Implemented "Leg" logic from Pine:
            // leg(size) =>
            //   newLegHigh = high[size] > ta.highest(size) (in current context, high[size] refers to candle at i-length)
            //   If current High (at i) is NOT higher than High(i-length), then High(i-length) MIGHT be a swing?
            //   Actually the Pine code `high[size] > ta.highest(size)` looks for a breakout.

            // Let's use a robust Fractal/Pivot detection which is standard for SMC conversion:
            // A point is a Swing High if it is the highest point in a window of +/- length.
            // Here, at index `i`, we can confirm `i - length` is a swing if it's highest in [i-2*length ... i].

            const candidateIndex = i - this.length;
            const isSwingHigh = this.isHighest(candles, candidateIndex, this.length);
            const isSwingLow = this.isLowest(candles, candidateIndex, this.length);

            // Handle Swing High
            if (isSwingHigh) {
                // If we found a new local high
                // Check if it's higher than previous HH? Or just mark it.
                // In SMC we usually track Strong/Weak highs.

                // If this is a valid swing point, we update our "last swing high".
                // But wait, structure breaks happen when PRICE crosses these, not when we find new ones.

                // If we confirm a Swing High at candidateIndex:
                if (!swingHigh || candles[candidateIndex].high > swingHigh.price) {
                    // Update current working swing high?
                    // Actually, usually we just push to list.
                }

                // Store detected swing
                // Only store if it's significant? For now store all detected pivots.
                // Check if we already added this index (avoid duplicates if sliding window re-confirms? No, i increments).
                result.swings.push({
                    price: candles[candidateIndex].high,
                    index: candidateIndex,
                    time: candles[candidateIndex].time,
                    type: 'HH', // Logic to determine HH/LH requires comparison with previous
                    crossed: false
                });

                // Update Types (HH/LH)
                const lastHigh = result.swings.filter(s => s.type === 'HH' || s.type === 'LH').slice(-2)[0];
                const currentSwing = result.swings[result.swings.length - 1];
                if (lastHigh) {
                    currentSwing.type = currentSwing.price > lastHigh.price ? 'HH' : 'LH';
                } else {
                    currentSwing.type = 'HH'; // First one
                }

                swingHigh = currentSwing; // Update active swing high
            }

            // Handle Swing Low
            if (isSwingLow) {
                result.swings.push({
                    price: candles[candidateIndex].low,
                    index: candidateIndex,
                    time: candles[candidateIndex].time,
                    type: 'LL',
                    crossed: false
                });

                const lastLow = result.swings.filter(s => s.type === 'LL' || s.type === 'HL').slice(-2)[0];
                const currentSwing = result.swings[result.swings.length - 1];
                if (lastLow) {
                    currentSwing.type = currentSwing.price < lastLow.price ? 'LL' : 'HL';
                } else {
                    currentSwing.type = 'LL';
                }

                swingLow = currentSwing;
            }

            // 2. Structure Breaks (BOS / CHoCH)
            // We check if the *current* candle (i) breaks the active swing levels.
            // BOS: Break of Structure (Continuation)
            // CHoCH: Change of Character (Reversal)

            if (swingHigh && !swingHigh.crossed) {
                if (currentCandle.close > swingHigh.price) {
                    // Breakout Up
                    swingHigh.crossed = true;
                    const isChoch = trend === TrendBias.BEARISH;
                    trend = TrendBias.BULLISH;

                    result.structures.push({
                        type: isChoch ? 'CHOCH' : 'BOS',
                        bias: TrendBias.BULLISH,
                        price: swingHigh.price,
                        index: i,
                        time: currentCandle.time,
                        relatedPivot: swingHigh
                    });

                    // Order Block Detection (Bullish)
                    // The candle that initiated the move that broke structure.
                    // Usually the lowest down-candle before the up-move.
                    // Simplified: Look back from 'i' to 'swingHigh.index' for the lowest candle.
                    this.detectOrderBlock(candles, i, swingHigh.index, TrendBias.BULLISH, result.orderBlocks);
                }
            }

            if (swingLow && !swingLow.crossed) {
                if (currentCandle.close < swingLow.price) {
                    // Breakout Down
                    swingLow.crossed = true;
                    const isChoch = trend === TrendBias.BULLISH;
                    trend = TrendBias.BEARISH;

                    result.structures.push({
                        type: isChoch ? 'CHOCH' : 'BOS',
                        bias: TrendBias.BEARISH,
                        price: swingLow.price,
                        index: i,
                        time: currentCandle.time,
                        relatedPivot: swingLow
                    });

                    // Order Block Detection (Bearish)
                    this.detectOrderBlock(candles, i, swingLow.index, TrendBias.BEARISH, result.orderBlocks);
                }
            }

            // 3. Fair Value Gaps (FVG)
            // Look at i, i-1, i-2
            // Need at least 3 candles
            if (i >= 2) {
                const c0 = candles[i];     // Current
                const c1 = candles[i - 1]; // Middle
                const c2 = candles[i - 2]; // Left

                // Bullish FVG: Low(0) > High(2) and massive move
                if (c0.low > c2.high && c1.close > c1.open) { // Green middle candle usually
                    // Check magnitude/threshold if needed
                    result.fairValueGaps.push({
                        top: c0.low,
                        bottom: c2.high,
                        bias: TrendBias.BULLISH,
                        startIndex: i - 2,
                        startTime: c2.time,
                        mitigated: false
                    });
                }

                // Bearish FVG: High(0) < Low(2)
                if (c0.high < c2.low && c1.close < c1.open) {
                    result.fairValueGaps.push({
                        top: c2.low,
                        bottom: c0.high,
                        bias: TrendBias.BEARISH,
                        startIndex: i - 2,
                        startTime: c2.time,
                        mitigated: false
                    });
                }
            }
        }

        // Post-processing: Check FVG mitigation
        this.checkMitigation(candles, result.fairValueGaps);
        this.checkMitigationOB(candles, result.orderBlocks);

        result.currentTrend = trend;
        return result;
    }

    private isHighest(candles: SMCCandle[], index: number, length: number): boolean {
        const val = candles[index].high;
        const start = Math.max(0, index - length);
        const end = Math.min(candles.length - 1, index + length);

        for (let k = start; k <= end; k++) {
            if (k === index) continue;
            if (candles[k].high >= val) return false;
        }
        return true;
    }

    private isLowest(candles: SMCCandle[], index: number, length: number): boolean {
        const val = candles[index].low;
        const start = Math.max(0, index - length);
        const end = Math.min(candles.length - 1, index + length);

        for (let k = start; k <= end; k++) {
            if (k === index) continue;
            if (candles[k].low <= val) return false;
        }
        return true;
    }

    private detectOrderBlock(candles: SMCCandle[], breakIndex: number, pivotIndex: number, bias: TrendBias, storage: OrderBlock[]) {
        // Search range: from Pivot to Break
        // Bullish OB: Lowest red candle before the move up
        // Bearish OB: Highest green candle before the move down

        let bestCandle: SMCCandle | null = null;
        let extremeVal = bias === TrendBias.BULLISH ? Infinity : -Infinity;
        let bestIndex = -1;

        for (let k = pivotIndex; k < breakIndex; k++) {
            const c = candles[k];
            if (bias === TrendBias.BULLISH) {
                // Looking for lowest down-candle (red)
                if (c.close < c.open) { // Red
                    if (c.low < extremeVal) {
                        extremeVal = c.low;
                        bestCandle = c;
                        bestIndex = k;
                    }
                }
            } else {
                // Looking for highest up-candle (green)
                if (c.close > c.open) { // Green
                    if (c.high > extremeVal) {
                        extremeVal = c.high;
                        bestCandle = c;
                        bestIndex = k;
                    }
                }
            }
        }

        if (bestCandle) {
            storage.push({
                top: bestCandle.high,
                bottom: bestCandle.low,
                bias: bias,
                startIndex: bestIndex,
                startTime: bestCandle.time,
                mitigated: false
            });
        }
    }

    private checkMitigation(candles: SMCCandle[], fvgs: FairValueGap[]) {
        for (const fvg of fvgs) {
            // Check candles after the FVG was formed (index + 3)
            // Using a simple loop for now; in optimized version we'd do this during the main loop
            // But since we need to know if FUTURE price hits it...
            const startCheck = fvg.startIndex + 3;
            for (let k = startCheck; k < candles.length; k++) {
                const c = candles[k];
                if (fvg.bias === TrendBias.BULLISH) {
                    if (c.low <= fvg.top) { // Price dips into the gap
                        fvg.mitigated = true;
                        break;
                    }
                } else {
                    if (c.high >= fvg.bottom) { // Price rises into the gap
                        fvg.mitigated = true;
                        break;
                    }
                }
            }
        }
    }

    private checkMitigationOB(candles: SMCCandle[], obs: OrderBlock[]) {
        for (const ob of obs) {
            const startCheck = ob.startIndex + 1;
            for (let k = startCheck; k < candles.length; k++) {
                const c = candles[k];
                // Simple touch mitigation
                if (ob.bias === TrendBias.BULLISH) {
                    if (c.low <= ob.top && c.high >= ob.bottom) { // Overlap
                         ob.mitigated = true;
                         break;
                    }
                } else {
                    if (c.high >= ob.bottom && c.low <= ob.top) {
                        ob.mitigated = true;
                        break;
                    }
                }
            }
        }
    }
}

export const smcService = new SMCService();
