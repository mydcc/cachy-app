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
 * FEAT-0765 — the mc.pine structure read, ported as a pure function.
 *
 * The Academy's previous structure layer (FEAT-0686) marked N-bar fractals and
 * close breaks. The PineScript the trader actually reads from adds the parts
 * that make the read teachable: a swing only counts when it clears a minimum
 * ATR distance, a BOS only counts after the inducement (the last sub-swing in
 * the pullback direction) has been crossed, a wick through the running
 * extreme that closes back inside is a sweep, and the Fibonacci levels hang on
 * the current structure range instead of arbitrary pivots.
 *
 * Deliberately a *semantic* port, not a line-by-line translation: only the
 * parts the three lessons use are here (no order blocks, no FVGs, no
 * Alligator). Every decision is made on confirmed bars — an event fires on
 * the bar whose close (or wick, when `breakOnClose` is false) crosses the
 * level, and never moves afterwards. That is the one deliberate difference
 * from the TradingView indicator, which may move markers on the forming bar.
 *
 * Pure TypeScript over plain arrays: no stores, no runes, no DOM.
 */

import type { Swing } from "./structureSignals";

/** One candle, in the units the chart and the structure rules already use. */
export interface StructureBar {
    time: number;
    open?: number;
    high: number;
    low: number;
    close: number;
}

export type StructureEventKind =
    | "CHOCH-up"
    | "CHOCH-down"
    | "BOS-up"
    | "BOS-down"
    | "Sweep-up"
    | "Sweep-down";

export interface StructureEvent {
    /** Index of the candle that confirmed the event. */
    index: number;
    /** The level the event happened at (the broken swing, or the swept extreme). */
    price: number;
    kind: StructureEventKind;
}

/** The inducement the trend currently requires before a BOS counts. */
export interface InducementLine {
    /** Index of the sub-swing that formed it. */
    index: number;
    price: number;
    side: "high" | "low";
}

/** The structure range the Fibonacci levels are drawn on. */
export interface StructureRange {
    low: number;
    high: number;
    /** 1 in an uptrend, -1 in a downtrend. */
    direction: 1 | -1;
}

export interface StructureRead {
    swings: Swing[];
    events: StructureEvent[];
    inducement: InducementLine | null;
    range: StructureRange | null;
}

export interface StructureReadOptions {
    /** Pivot window in bars: a swing needs this many bars on each side. */
    swingLength?: number;
    /** Sub-swing window for the inducement (mc.pine `shortLen`). */
    inducementLength?: number;
    /** ATR period for the minimum-swing filter (mc.pine `atr_period`). */
    atrPeriod?: number;
    /** A swing must clear this many ATRs beyond the previous one. */
    atrMinMult?: number;
    /**
     * `true` (default) breaks on the candle body, like the PineScript default;
     * `false` breaks on the wick.
     */
    breakOnClose?: boolean;
}

const DEFAULTS = {
    swingLength: 4,
    inducementLength: 3,
    atrPeriod: 10,
    atrMinMult: 0.5,
    breakOnClose: true,
} as const;

/** True range, with the previous close as the reference when available. */
function trueRange(bars: readonly StructureBar[], index: number): number {
    const bar = bars[index];
    if (index === 0) return bar.high - bar.low;
    const previousClose = bars[index - 1].close;
    return Math.max(
        bar.high - bar.low,
        Math.abs(bar.high - previousClose),
        Math.abs(bar.low - previousClose),
    );
}

/**
 * Wilder's RMA of the true range — the PineScript's `my_atr`.
 *
 * `ta.rma` seeds with the SMA of the first `period` true ranges. PineScript
 * yields `na` before that; the Academy keeps the provisional true range for
 * those bars instead, so the first swings still have a size reference (the
 * difference decays within the window and no lesson reads the warmup bars).
 */
function atrSeries(bars: readonly StructureBar[], period: number): number[] {
    const out: number[] = [];
    let value = Number.NaN;
    let seedSum = 0;
    let seedCount = 0;
    for (let i = 0; i < bars.length; i++) {
        const tr = trueRange(bars, i);
        if (!Number.isFinite(value)) {
            seedSum += tr;
            seedCount++;
            if (seedCount === period) {
                value = seedSum / period;
            } else {
                out.push(tr);
                continue;
            }
        } else {
            value = (value * (period - 1) + tr) / period;
        }
        out.push(value);
    }
    return out;
}

/**
 * Is the bar `at` a confirmed pivot of `length` on the given side?
 *
 * A pivot high is at least the highest high of the `length` bars before it
 * and strictly above every bar up to `at + length` — so it is only known
 * `length` bars later, and the read never uses a candle before it closed.
 * Ties on the left are allowed (a plateau still has one turning point), ties
 * on the right are not (that would double-mark the same top).
 *
 * The ATR filter is an *amplitude* test (mc.pine `SWING_MIN_ATR_MULT`): the
 * swing must stand at least that many ATRs off the opposite extreme of its
 * own window. Comparing against the previous swing instead would reject
 * every higher low of a healthy uptrend — the opposite of what the filter is
 * for.
 */
function isPivotHigh(bars: readonly StructureBar[], at: number, length: number): boolean {
    const candidate = bars[at].high;
    for (let k = 1; k <= length; k++) {
        if (candidate < bars[at - k].high) return false;
    }
    for (let k = 1; k <= length; k++) {
        if (candidate <= bars[at + k].high) return false;
    }
    return true;
}

function isPivotLow(bars: readonly StructureBar[], at: number, length: number): boolean {
    const candidate = bars[at].low;
    for (let k = 1; k <= length; k++) {
        if (candidate > bars[at - k].low) return false;
    }
    for (let k = 1; k <= length; k++) {
        if (candidate >= bars[at + k].low) return false;
    }
    return true;
}

/**
 * Read the market structure of `bars` the way the trader's PineScript does,
 * reduced to what the three Academy lessons teach.
 */
export function computeStructureRead(
    bars: readonly StructureBar[],
    options: StructureReadOptions = {},
): StructureRead {
    const swingLength = options.swingLength ?? DEFAULTS.swingLength;
    const inducementLength = options.inducementLength ?? DEFAULTS.inducementLength;
    const atrPeriod = options.atrPeriod ?? DEFAULTS.atrPeriod;
    const atrMinMult = options.atrMinMult ?? DEFAULTS.atrMinMult;
    const breakOnClose = options.breakOnClose ?? DEFAULTS.breakOnClose;

    const swings: Swing[] = [];
    const events: StructureEvent[] = [];
    const atr = atrSeries(bars, atrPeriod);

    let os: 1 | -1 | 0 = 0;
    let lastHigh = Number.NaN;
    let lastLow = Number.NaN;
    // Running extremes of the current structure (mc.pine ms_max/ms_min).
    let chainHigh = Number.NaN;
    let chainLow = Number.NaN;
    let chainHighX = -1;
    let chainLowX = -1;
    // Anchors of the structure range (ms_btmy / ms_topy at the last flip).
    let rangeLowAnchor = Number.NaN;
    let rangeHighAnchor = Number.NaN;
    // Most recent sub-swing on each side (the inducement candidates).
    let shortHigh = Number.NaN;
    let shortHighX = -1;
    let shortLow = Number.NaN;
    let shortLowX = -1;
    // Has price traded back through the inducement since the last BOS?
    let inducementCrossed = false;
    // One break per reference (review follow-up): a spent level needs a new
    // swing on its side before it can be broken again.
    let highSpent = false;
    let lowSpent = false;

    const resetInducement = (): void => {
        shortHigh = Number.NaN;
        shortHighX = -1;
        shortLow = Number.NaN;
        shortLowX = -1;
        inducementCrossed = false;
    };

    const push = (index: number, price: number, kind: StructureEventKind): void => {
        events.push({ index, price, kind });
    };

    for (let i = 0; i < bars.length; i++) {
        const bar = bars[i];

        // 1. Confirm pivots that finished `swingLength` bars ago. They become
        //    the break references from this bar on, never earlier.
        const majorAt = i - swingLength;
        if (majorAt >= swingLength) {
            if (isPivotHigh(bars, majorAt, swingLength)) {
                const price = bars[majorAt].high;
                let windowLow = Infinity;
                for (let k = majorAt - swingLength; k <= majorAt + swingLength; k++) {
                    windowLow = Math.min(windowLow, bars[k].low);
                }
                if (price - windowLow >= atrMinMult * atr[majorAt]) {
                    swings.push({ index: majorAt, price, side: "high" });
                    // Trailing reference: the most recent confirmed swing is
                    // what a CHoCH breaks, whether it is a new extreme or not.
                    lastHigh = price;
                    highSpent = false;
                }
            }
            if (isPivotLow(bars, majorAt, swingLength)) {
                const price = bars[majorAt].low;
                let windowHigh = -Infinity;
                for (let k = majorAt - swingLength; k <= majorAt + swingLength; k++) {
                    windowHigh = Math.max(windowHigh, bars[k].high);
                }
                if (windowHigh - price >= atrMinMult * atr[majorAt]) {
                    swings.push({ index: majorAt, price, side: "low" });
                    lastLow = price;
                    lowSpent = false;
                }
            }
        }

        // 2. Sub-swings for the inducement (mc.pine shortLen).
        const shortAt = i - inducementLength;
        if (shortAt >= inducementLength) {
            if (isPivotHigh(bars, shortAt, inducementLength)) {
                shortHigh = bars[shortAt].high;
                shortHighX = shortAt;
            }
            if (isPivotLow(bars, shortAt, inducementLength)) {
                shortLow = bars[shortAt].low;
                shortLowX = shortAt;
            }
        }

        // 3. Breaks. Both references must exist; without a confirmed swing on
        //    each side the first close would always "break" against infinity.
        if (!Number.isFinite(lastHigh) || !Number.isFinite(lastLow)) continue;

        if (!Number.isFinite(chainHigh)) {
            chainHigh = lastHigh;
            chainHighX = i;
        }
        if (!Number.isFinite(chainLow)) {
            chainLow = lastLow;
            chainLowX = i;
        }

        const breakUp = breakOnClose ? bar.close : bar.high;
        const breakDown = breakOnClose ? bar.close : bar.low;

        if (os === 0) {
            if (breakUp > lastHigh && !highSpent) {
                push(i, lastHigh, "BOS-up");
                os = 1;
                rangeLowAnchor = lastLow;
                highSpent = true;
                lowSpent = false;
                resetInducement();
            } else if (breakDown < lastLow && !lowSpent) {
                push(i, lastLow, "BOS-down");
                os = -1;
                rangeHighAnchor = lastHigh;
                lowSpent = true;
                highSpent = false;
                resetInducement();
            }
        } else if (os === 1) {
            // A sweep is a wick beyond the running extreme that closes back
            // inside it — liquidity taken, structure unchanged.
            if (bar.high > chainHigh && bar.close < chainHigh && i - chainHighX >= 1) {
                push(i, chainHigh, "Sweep-up");
            }
            if (breakDown < lastLow && !lowSpent) {
                push(i, lastLow, "CHOCH-down");
                os = -1;
                rangeHighAnchor = lastHigh;
                chainLow = bar.low;
                chainLowX = i;
                lowSpent = true;
                highSpent = false;
                resetInducement();
            } else {
                if (breakUp > lastHigh && !highSpent && inducementCrossed) {
                    push(i, lastHigh, "BOS-up");
                    highSpent = true;
                    inducementCrossed = false;
                }
                if (bar.high > chainHigh) {
                    chainHigh = bar.high;
                    chainHighX = i;
                }
                // A pullback through the last sub-swing arms the next BOS.
                if (Number.isFinite(shortLow) && breakDown < shortLow) {
                    inducementCrossed = true;
                }
            }
        } else {
            if (bar.low < chainLow && bar.close > chainLow && i - chainLowX >= 1) {
                push(i, chainLow, "Sweep-down");
            }
            if (breakUp > lastHigh && !highSpent) {
                push(i, lastHigh, "CHOCH-up");
                os = 1;
                rangeLowAnchor = lastLow;
                chainHigh = bar.high;
                chainHighX = i;
                highSpent = true;
                lowSpent = false;
                resetInducement();
            } else {
                if (breakDown < lastLow && !lowSpent && inducementCrossed) {
                    push(i, lastLow, "BOS-down");
                    lowSpent = true;
                    inducementCrossed = false;
                }
                if (bar.low < chainLow) {
                    chainLow = bar.low;
                    chainLowX = i;
                }
                if (Number.isFinite(shortHigh) && breakUp > shortHigh) {
                    inducementCrossed = true;
                }
            }
        }
    }

    const range: StructureRange | null =
        os === 1 && Number.isFinite(rangeLowAnchor) && Number.isFinite(chainHigh)
            ? { low: rangeLowAnchor, high: chainHigh, direction: 1 }
            : os === -1 && Number.isFinite(chainLow) && Number.isFinite(rangeHighAnchor)
              ? { low: chainLow, high: rangeHighAnchor, direction: -1 }
              : null;

    const inducement: InducementLine | null =
        os === 1 && Number.isFinite(shortLow)
            ? { index: shortLowX, price: shortLow, side: "low" }
            : os === -1 && Number.isFinite(shortHigh)
              ? { index: shortHighX, price: shortHigh, side: "high" }
              : null;

    return { swings, events, inducement, range };
}
