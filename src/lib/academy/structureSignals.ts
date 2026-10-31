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
