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
    time: number;
}

export type TrendBias = 'bullish' | 'bearish';
export type StructureType = 'BOS' | 'CHoCH';

export interface Pivot {
    level: number;
    index: number;
    time: number;
    type: 'high' | 'low';
}

export interface Structure {
    type: StructureType;
    bias: TrendBias;
    level: number;
    index: number;
    time: number;
    brokenIndex: number; // The index where the break happened
}

export interface OrderBlock {
    top: number;
    bottom: number;
    bias: TrendBias;
    index: number;
    time: number;
    mitigated: boolean;
}

export interface FairValueGap {
    top: number;
    bottom: number;
    bias: TrendBias;
    index: number;
    time: number;
    mitigated: boolean;
}

export interface EqualLevel {
    level: number;
    indices: number[]; // Indices of the bars forming the equal level
    type: 'EQH' | 'EQL';
}

export interface SMCResult {
    swingHighs: Pivot[];
    swingLows: Pivot[];
    structures: Structure[];
    orderBlocks: OrderBlock[];
    fairValueGaps: FairValueGap[];
    equalHighs: EqualLevel[];
    equalLows: EqualLevel[];
}

export class SMCPatternDetector {
    private candles: Candle[];
    private swingLength: number;
    private internalLength: number;

    constructor(candles: Candle[], swingLength: number = 50, internalLength: number = 5) {
        this.candles = candles;
        this.swingLength = swingLength;
        this.internalLength = internalLength;
    }

    public detectAll(): SMCResult {
        const result: SMCResult = {
            swingHighs: [],
            swingLows: [],
            structures: [],
            orderBlocks: [],
            fairValueGaps: [],
            equalHighs: [],
            equalLows: []
        };

        // We simulate the PineScript iteration
        // State variables for Swing Structure
        let swingHigh: Pivot = { level: NaN, index: -1, time: 0, type: 'high' };
        let swingLow: Pivot = { level: NaN, index: -1, time: 0, type: 'low' };
        let swingTrend: TrendBias | null = null;
        let swingHighCrossed = false;
        let swingLowCrossed = false;

        // State for legs
        let prevLegSwing = 0; // 0 = Bearish, 1 = Bullish
        let prevLegInternal = 0;

        // Order Blocks list (to check for mitigation)
        const activeOrderBlocks: OrderBlock[] = [];
        const activeFVGs: FairValueGap[] = [];

        // Helper to get max/min in range [start, end] inclusive
        const getMax = (start: number, end: number) => {
            let val = -Infinity;
            for (let k = start; k <= end; k++) {
                if (k >= 0 && k < this.candles.length) val = Math.max(val, this.candles[k].high);
            }
            return val;
        };
        const getMin = (start: number, end: number) => {
            let val = Infinity;
            for (let k = start; k <= end; k++) {
                if (k >= 0 && k < this.candles.length) val = Math.min(val, this.candles[k].low);
            }
            return val;
        };

        for (let i = 0; i < this.candles.length; i++) {
            const current = this.candles[i];
            const close = current.close;
            const high = current.high;
            const low = current.low;

            // --- FVG Detection ---
            // Needs at least 3 bars (0, 1, 2) -> i, i-1, i-2
            if (i >= 2) {
                const c0 = this.candles[i];
                const c1 = this.candles[i - 1];
                const c2 = this.candles[i - 2];

                // Pine: threshold logic omitted for simplicity or can be added.
                // Basic FVG:
                // Bullish: Low[0] > High[2] and Close[1] > High[2]
                if (c0.low > c2.high && c1.close > c2.high) {
                    const fvg: FairValueGap = {
                        top: c0.low,
                        bottom: c2.high,
                        bias: 'bullish',
                        index: i - 1, // The gap is formed by the middle candle
                        time: c1.time,
                        mitigated: false
                    };
                    result.fairValueGaps.push(fvg);
                    activeFVGs.push(fvg);
                }
                // Bearish: High[0] < Low[2] and Close[1] < Low[2]
                if (c0.high < c2.low && c1.close < c2.low) {
                    const fvg: FairValueGap = {
                        top: c2.low,
                        bottom: c0.high,
                        bias: 'bearish',
                        index: i - 1,
                        time: c1.time,
                        mitigated: false
                    };
                    result.fairValueGaps.push(fvg);
                    activeFVGs.push(fvg);
                }
            }

            // Mitigation check for FVGs
            // Note: This is simplified. Pine script deletes them. Here we mark mitigated.
            // Iterating backwards to allow removal if needed, or just status update
            for (const fvg of activeFVGs) {
                if (fvg.mitigated) continue;
                if (fvg.bias === 'bullish' && low < fvg.bottom) fvg.mitigated = true;
                if (fvg.bias === 'bearish' && high > fvg.top) fvg.mitigated = true;
            }

            // --- Swing Detection ---
            // Pine logic: leg(size)
            // newLegHigh = high[size] > ta.highest(size)
            // This compares high[i-size] with max(high[i]...high[i-size+1])?
            // Actually ta.highest(size) includes current bar i.
            // So high[i-size] > max(high[i]...high[i-size+1]) effectively means:
            // The bar at 'i-size' is higher than all subsequent bars up to 'i'.
            // Combined with the fact that it was likely higher than bars BEFORE it (implicit in previous iterations), it's a fractal.
            // But we need to check the condition explicitly here.

            const size = this.swingLength;
            if (i >= size) {
                const candleAtSize = this.candles[i - size];
                // Check if candleAtSize.high > max of (i-size+1 ... i)
                // Note: Pine 'ta.highest(size)' looks back 'size' bars from 'i'.
                // Range is [i-size+1, i].
                // We want to check if high[i-size] > max(high[i-size+1]...high[i])

                const rangeMax = getMax(i - size + 1, i);
                const rangeMin = getMin(i - size + 1, i);

                const isNewLegHigh = candleAtSize.high > rangeMax;
                const isNewLegLow = candleAtSize.low < rangeMin;

                let currentLegSwing = prevLegSwing;
                if (isNewLegHigh) currentLegSwing = 0; // Bearish leg starts (found a high)
                else if (isNewLegLow) currentLegSwing = 1; // Bullish leg starts (found a low)

                // Check for change
                if (currentLegSwing !== prevLegSwing) {
                    // Pivot Detected
                     if (currentLegSwing === 1) {
                        // Changed to Bullish Leg -> Previous leg was Bearish, so we just finished a LOW pivot?
                        // "startOfBullishLeg" means we found a LOW that turned the leg bullish.
                        // Wait, if isNewLegLow is true, we found a low at i-size.
                        // That low is lower than recent bars. It marks the bottom.
                        // So we found a Swing Low.

                        // In Pine:
                        // pivotLow = startOfBullishLeg(currentLeg)
                        // if pivotLow -> update swingLow

                        // We found a Swing Low at i-size
                        const pLow: Pivot = {
                            level: candleAtSize.low,
                            index: i - size,
                            time: candleAtSize.time,
                            type: 'low'
                        };
                        swingLow = pLow;
                        swingLowCrossed = false;
                        result.swingLows.push(pLow);

                        // Order Block Logic (Simplified)
                        // If we form a swing low, we might check for OBs around here
                        // Pine: storeOrderBlock(pivot, internal, BULLISH)
                        // Finds min of lows from pivot to current.
                        // Actually it takes the lowest candle in the swing?
                        // We'll skip complex OB logic for now and focus on Structure.

                     } else {
                        // Changed to Bearish Leg -> Found a HIGH pivot at i-size
                        const pHigh: Pivot = {
                            level: candleAtSize.high,
                            index: i - size,
                            time: candleAtSize.time,
                            type: 'high'
                        };
                        swingHigh = pHigh;
                        swingHighCrossed = false;
                        result.swingHighs.push(pHigh);
                     }
                }
                prevLegSwing = currentLegSwing;
            }

            // --- Structure Breaks (BOS / CHoCH) ---
            // If close crosses swingHigh/Low

            // Bullish Break
            if (!isNaN(swingHigh.level) && close > swingHigh.level && !swingHighCrossed) {
                // Determine type: BOS or CHoCH
                // If trend was bearish, breaking high is CHoCH (reversal to bullish)
                // If trend was bullish, breaking high is BOS (continuation)

                const type = (swingTrend === 'bearish') ? 'CHoCH' : 'BOS';
                if (swingTrend === null) swingTrend = 'bullish'; // Initial

                // Update trend
                swingTrend = 'bullish';

                result.structures.push({
                    type,
                    bias: 'bullish',
                    level: swingHigh.level,
                    index: i,
                    time: current.time,
                    brokenIndex: swingHigh.index
                });

                swingHighCrossed = true; // Mark this pivot as broken
            }

            // Bearish Break
            if (!isNaN(swingLow.level) && close < swingLow.level && !swingLowCrossed) {
                const type = (swingTrend === 'bullish') ? 'CHoCH' : 'BOS';
                if (swingTrend === null) swingTrend = 'bearish';

                swingTrend = 'bearish';

                result.structures.push({
                    type,
                    bias: 'bearish',
                    level: swingLow.level,
                    index: i,
                    time: current.time,
                    brokenIndex: swingLow.index
                });

                swingLowCrossed = true;
            }

            // --- Equal Highs / Lows (EQH/EQL) ---
            // Pine: math.abs(pivot.currentLevel - high[size]) < threshold * atr
            // This checks if a NEW pivot is close to the OLD pivot.
            // Logic handled inside the pivot detection block usually.
            // We can check it when `swingHigh` updates.
            // Since we update `swingHigh` above, we can check against the PREVIOUS swingHigh in the results list.

            // Note: The loop updates `swingHigh` variable. If we just pushed a new one, we check the one before it.
            // But we need to be careful not to check every bar, only when a new pivot confirms.
            // The "change" logic above handles "new pivot".
        }

        return result;
    }
}
