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

/*
 * FEAT-0686 — the computed half of the market-structure cockpit.
 *
 * The reference tab (FEAT-0679) teaches bias, breaks, levels and regime in
 * words; this module computes the same four readings from candle history so
 * the tab can show them live. Pure functions over plain arrays — no stores,
 * no runes, no DOM — so every rule below is unit-testable with synthetic
 * candles.
 *
 * Deliberately descriptive, never classificatory: the outputs are swings,
 * break events and prices. Whether the market "is trending" stays with the
 * reader, exactly as the prose teaches it.
 */

import { TIMEFRAME_QUICK_PICKS } from "../constants";
import { timeframeDurationMs } from "../../utils/chartDisplay";

export interface PriceBar {
    high: number;
    low: number;
    close: number;
}

export interface Swing {
    /** Index into the input bars. */
    index: number;
    price: number;
    side: "high" | "low";
}

export type BreakKind = "BOS-up" | "BOS-down" | "CHOCH-up" | "CHOCH-down";

export interface StructureBreak {
    /** Index of the candle whose close made the break. */
    index: number;
    price: number;
    kind: BreakKind;
}

export interface LevelLine {
    price: number;
    side: "resistance" | "support";
}

/**
 * The next timeframe up the ladder, roughly four times slower (Elder's
 * triple-screen factor), chosen from the drawable quick picks. Unknown input
 * and the top of the ladder return the input unchanged, so callers always
 * get a channel that carries candles.
 */
export function higherTimeframe(
    tf: string,
    picks: readonly string[] = TIMEFRAME_QUICK_PICKS,
): string {
    const base = timeframeDurationMs(tf);
    if (base === null || picks.length === 0) return tf;
    for (const pick of picks) {
        const ms = timeframeDurationMs(pick);
        if (ms !== null && ms >= 4 * base) return pick;
    }
    return tf;
}

/**
 * N-bar fractal swings: a high strictly greater than the `strength` bars on
 * each side, a low strictly lower. Strictness keeps flat tops unmarked rather
 * than double-marked — a tied extreme is indecision, not a swing.
 */
export function findSwings(bars: readonly PriceBar[], strength = 2): Swing[] {
    const out: Swing[] = [];
    for (let i = strength; i + strength < bars.length; i++) {
        let isHigh = true;
        let isLow = true;
        for (let k = 1; k <= strength; k++) {
            if (bars[i].high <= bars[i - k].high || bars[i].high <= bars[i + k].high) {
                isHigh = false;
            }
            if (bars[i].low >= bars[i - k].low || bars[i].low >= bars[i + k].low) {
                isLow = false;
            }
            if (!isHigh && !isLow) break;
        }
        if (isHigh) out.push({ index: i, price: bars[i].high, side: "high" });
        if (isLow) out.push({ index: i, price: bars[i].low, side: "low" });
    }
    return out;
}

/**
 * Breaks of structure over closes, read against confirmed past swings only.
 *
 * No trend yet: the first break in either direction names the trend (BOS).
 * In an uptrend a close above the last swing high extends it (BOS-up); a
 * close below the last swing low breaks character first (CHOCH-down) and the
 * trend flips — further closes below keep breaking structure downward.
 * Mirrored in a downtrend. Equal closes never break: a tie holds the level.
 *
 * One event per level: a break marks its reference as spent, so a steady run
 * of closes beyond the same swing emits exactly one event instead of one per
 * bar. A new swing on that side re-arms its reference.
 */
export function detectBreaks(
    closes: readonly number[],
    swings: readonly Swing[],
): StructureBreak[] {
    const out: StructureBreak[] = [];
    let trend: 1 | -1 | 0 = 0;
    let lastHigh = -Infinity;
    let lastLow = Infinity;
    let highSpent = false;
    let lowSpent = false;
    let swingCursor = 0;
    for (let i = 0; i < closes.length; i++) {
        while (swingCursor < swings.length && swings[swingCursor].index < i) {
            const swing = swings[swingCursor];
            if (swing.side === "high") {
                lastHigh = swing.price;
                highSpent = false;
            } else {
                lastLow = swing.price;
                lowSpent = false;
            }
            swingCursor++;
        }
        const close = closes[i];
        // Both bounds must be known: without a confirmed high and low the
        // first close would always "break" against infinity.
        if (!Number.isFinite(lastHigh) || !Number.isFinite(lastLow)) continue;
        if (trend >= 0 && close > lastHigh && !highSpent) {
            out.push({ index: i, price: close, kind: "BOS-up" });
            trend = 1;
            highSpent = true;
        } else if (trend <= 0 && close < lastLow && !lowSpent) {
            out.push({ index: i, price: close, kind: "BOS-down" });
            trend = -1;
            lowSpent = true;
        } else if (trend === 1 && close < lastLow && !lowSpent) {
            out.push({ index: i, price: close, kind: "CHOCH-down" });
            trend = -1;
            lowSpent = true;
        } else if (trend === -1 && close > lastHigh && !highSpent) {
            out.push({ index: i, price: close, kind: "CHOCH-up" });
            trend = 1;
            highSpent = true;
        }
    }
    return out;
}

/**
 * Nearest swing-implied levels around the current price: swing highs above
 * read as resistance, swing lows below as support, nearest first, at most
 * `count` per side. Lines, not zones — the chart draws them as price lines.
 */
export function recentLevels(
    swings: readonly Swing[],
    close: number,
    count = 3,
): LevelLine[] {
    const resistance = swings
        .filter((swing) => swing.side === "high" && swing.price > close)
        .sort((a, b) => a.price - b.price)
        .slice(0, count)
        .map((swing) => ({ price: swing.price, side: "resistance" as const }));
    const support = swings
        .filter((swing) => swing.side === "low" && swing.price < close)
        .sort((a, b) => b.price - a.price)
        .slice(0, count)
        .map((swing) => ({ price: swing.price, side: "support" as const }));
    return [...resistance, ...support];
}
