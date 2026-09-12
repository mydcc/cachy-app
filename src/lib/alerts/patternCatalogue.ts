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

/**
 * FEAT-0394 -- what the Candlesticks tab needs to draw a pattern picker.
 *
 * Detection is not here and must never be. The one implementation lives in
 * `technicals-wasm/src/rule/pattern.rs`; this module only names the patterns,
 * groups them, and carries a glyph small enough to draw on a tile.
 *
 * ## Why the glyphs are not imported from the Academy library
 *
 * `src/services/candlestickPatterns.ts` holds idealised candles for all 66
 * patterns it teaches, plus `keyFeatures` -- colours, radii, line widths --
 * for the lesson chart's renderer. That is 49 KB, of which the engine can
 * detect 14 patterns and the tile needs none of the drawing instructions.
 * Pulling it in would put the whole teaching corpus into a chunk that is
 * code-split precisely to stay small.
 *
 * So the two files share the pattern *ids* and nothing else, exactly as
 * FEAT-0394 specifies. The ids are the coupling that matters, and
 * `patternCatalogue.test.ts` holds them together: every name here must exist
 * in the Academy library, so a rename on either side fails a test rather than
 * silently costing the alert UI its illustration.
 */

import type { CandlePatternName, Condition, TimeframeString } from "../rules/types";
import { conditionInSlot } from "./conditionSlots";

/**
 * How many candles the pattern spans -- which is also how the tab groups them.
 *
 * FEAT-0394 asks for three groups called Single, Multiple and Structural.
 * They are not an editorial choice laid alongside the engine: they are the
 * arity, and `CandlePattern::candles_spanned()` in Rust returns exactly 1, 2
 * and 3 for these same three sets. Deriving the grouping from the span keeps
 * one fact in one place; a hand-kept second list would be free to disagree.
 */
export type PatternGroup = "single" | "multiple" | "structural";

/** Candles a pattern of this group spans. Mirrors `candles_spanned()`. */
export const CANDLES_SPANNED: Record<PatternGroup, 1 | 2 | 3> = {
    single: 1,
    multiple: 2,
    structural: 3,
};

/**
 * The patterns of each group, in the order the tab shows them.
 *
 * Ordered so that a pattern and its mirror sit next to each other: hammer
 * beside hanging man, bullish engulfing beside bearish. A trader picking the
 * wrong one of a pair is the expensive mistake this tab can make, and two
 * tiles side by side make the difference visible at the moment of choosing.
 */
export const PATTERN_GROUPS: Record<PatternGroup, readonly CandlePatternName[]> = {
    single: ["hammer", "hanging_man", "inverted_hammer", "shooting_star"],
    multiple: [
        "bullish_engulfing",
        "bearish_engulfing",
        "piercing_line",
        "dark_cloud_cover",
        "bullish_harami",
        "bearish_harami",
    ],
    structural: [
        "morning_star",
        "evening_star",
        "three_white_soldiers",
        "three_black_crows",
    ],
};

export const PATTERN_GROUP_ORDER: readonly PatternGroup[] = [
    "single",
    "multiple",
    "structural",
];

/** Every pattern the core can detect, grouped order preserved. */
export const ALL_PATTERNS: readonly CandlePatternName[] = PATTERN_GROUP_ORDER.flatMap(
    (group) => [...PATTERN_GROUPS[group]],
);

/**
 * Which patterns the core reads a preceding trend for.
 *
 * Mirrors `CandlePattern::needs_trend_context()`. The tab shows it as a hint,
 * because it is the difference between "needs 1 closed candle" and "needs 6",
 * and a trader who arms a hammer on a fresh symbol should know why nothing
 * happens for the first five candles.
 */
export const NEEDS_TREND_CONTEXT: readonly CandlePatternName[] = [
    "hammer",
    "hanging_man",
    "inverted_hammer",
    "shooting_star",
];

/** Candles the trend check looks back over. Mirrors `TREND_LOOKBACK`. */
export const TREND_LOOKBACK = 5;

/**
 * Closed candles a rule on `pattern` needs before it can be evaluated at all.
 *
 * Mirrors `CandlePattern::warmup_candles()`. Shown, not computed for the
 * document: the core is still the authority via `rule_warmup_candles`. This is
 * the number the tab can put on screen without a round trip through WASM on
 * every hover.
 */
export function warmupCandles(pattern: CandlePatternName): number {
    return (
        CANDLES_SPANNED[groupOf(pattern)] +
        (NEEDS_TREND_CONTEXT.includes(pattern) ? TREND_LOOKBACK : 0)
    );
}

export function groupOf(pattern: CandlePatternName): PatternGroup {
    for (const group of PATTERN_GROUP_ORDER) {
        if (PATTERN_GROUPS[group].includes(pattern)) return group;
    }
    // Unreachable while the union and the groups agree, which the test pins.
    throw new Error(`pattern '${pattern}' is in no group`);
}

/** One candle of a tile glyph, on an arbitrary 0-100 price scale. */
export interface GlyphCandle {
    open: number;
    high: number;
    low: number;
    close: number;
}

/**
 * The idealised shape drawn on each tile.
 *
 * Illustration only -- these numbers are never evaluated, and a tile is not a
 * claim about what the detector accepts. They are drawn to satisfy the same
 * thresholds the detector uses (a hammer's body inside 30% of its range, its
 * lower shadow past 55%) so the picture does not teach a shape the engine
 * would reject.
 */
export const PATTERN_GLYPHS: Record<CandlePatternName, readonly GlyphCandle[]> = {
    // Small body at the top, long lower shadow. Hammer and hanging man are the
    // same silhouette; only the body colour and the trend before it differ.
    hammer: [{ open: 70, high: 80, low: 20, close: 78 }],
    hanging_man: [{ open: 78, high: 80, low: 20, close: 70 }],
    // The mirror pair: body at the bottom, long upper shadow.
    inverted_hammer: [{ open: 22, high: 80, low: 20, close: 30 }],
    shooting_star: [{ open: 30, high: 80, low: 20, close: 22 }],

    bullish_engulfing: [
        { open: 60, high: 65, low: 40, close: 45 },
        { open: 40, high: 72, low: 35, close: 68 },
    ],
    bearish_engulfing: [
        { open: 45, high: 65, low: 40, close: 60 },
        { open: 68, high: 72, low: 35, close: 40 },
    ],
    // Opens below the prior low and closes back above its midpoint -- but not
    // past its open, which would make it an engulfing instead.
    piercing_line: [
        { open: 75, high: 80, low: 35, close: 40 },
        { open: 33, high: 66, low: 30, close: 62 },
    ],
    dark_cloud_cover: [
        { open: 40, high: 80, low: 35, close: 75 },
        { open: 82, high: 86, low: 48, close: 52 },
    ],
    // The second body sits inside the first: the market stopped going.
    bullish_harami: [
        { open: 78, high: 82, low: 30, close: 35 },
        { open: 45, high: 64, low: 42, close: 60 },
    ],
    bearish_harami: [
        { open: 35, high: 82, low: 30, close: 78 },
        { open: 60, high: 64, low: 42, close: 45 },
    ],

    morning_star: [
        { open: 80, high: 84, low: 42, close: 45 },
        { open: 38, high: 42, low: 30, close: 35 },
        { open: 45, high: 76, low: 42, close: 72 },
    ],
    evening_star: [
        { open: 45, high: 84, low: 42, close: 80 },
        { open: 86, high: 92, low: 84, close: 88 },
        { open: 80, high: 84, low: 44, close: 48 },
    ],
    three_white_soldiers: [
        { open: 25, high: 48, low: 22, close: 45 },
        { open: 42, high: 65, low: 39, close: 62 },
        { open: 59, high: 83, low: 56, close: 80 },
    ],
    three_black_crows: [
        { open: 80, high: 83, low: 56, close: 59 },
        { open: 62, high: 65, low: 39, close: 42 },
        { open: 45, high: 48, low: 22, close: 25 },
    ],
};

/**
 * The pattern a draft already carries, or null when it carries something else.
 *
 * Takes the draft's whole `conditions`, wrapper and all.
 *
 * The form starts from the draft rather than from blank (FEAT-0395), so
 * switching tabs and back does not discard a chosen pattern. Anything that is
 * not a pattern condition reads as "nothing chosen" rather than throwing: the
 * trader may have arrived from the Price tab, and the draft is theirs.
 */
export function readPatternForm(conditions: Condition | null | undefined): {
    pattern: CandlePatternName | null;
} {
    // Through `conditionInSlot`, never off `conditions.kind` directly: the
    // panel hands back a group, and reading the wrapper as "not a pattern" is
    // how a seeded pattern would silently disappear. The slot is fixed here, so
    // this reader sees only the pattern this builder authored and can never
    // overwrite another tab's condition (BUG-0443).
    const condition = conditionInSlot(conditions, "candlesticks");
    if (condition?.kind === "pattern") {
        return { pattern: condition.pattern };
    }
    return { pattern: null };
}

/** The condition a chosen pattern becomes. */
export function buildPatternCondition(
    pattern: CandlePatternName,
    timeframe: TimeframeString,
): Condition {
    return { kind: "pattern", pattern, timeframe };
}
