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
 * FEAT-0028 -- what the Indicators tab needs to draw a condition builder.
 *
 * Indicator maths is not here and must never be. The registry that decides
 * which indicators a rule may name lives in
 * `technicals-wasm/src/rule/indicator.rs`; this module carries what that
 * registry deliberately does not: grouping, the parameter values a trader
 * starts from, and the i18n keys for names a human reads.
 *
 * ## Why this is a second list at all
 *
 * The registry has every fact the picker needs -- ids, parameter bounds,
 * output lines and their dimensions -- and none of them are reachable from
 * TypeScript: the core exports `validate`, `evaluate` and `content_hash`, not
 * itself. The choice was between generating this from Rust and writing it
 * beside Rust:
 *
 * - Generating it would put editorial decisions -- which group an indicator
 *   belongs to, what a sensible default period is -- into the crate that
 *   computes money, and would make every label change a WASM rebuild.
 * - Writing it by hand risks the drift that makes a second list worthless: an
 *   indicator added in Rust that silently never appears in the picker.
 *
 * So it is written by hand and held to the registry by a test.
 * `rule_indicator_registry()` exports the registry as JSON for
 * `indicatorCatalogue.test.ts` alone, and that test fails when an id, a
 * parameter name, a parameter kind or an output dimension differs between the
 * two. The drift class is closed by a mechanism; it does not depend on anyone
 * remembering to update this file.
 */

import type { DecimalString, IndicatorRef, ParamValue } from "../rules/types";

/**
 * What an operand's numbers are denominated in. Mirrors `Dimension` in
 * `technicals-wasm/src/rule/condition.rs`.
 *
 * The panel needs it for the reason the core has it: `Condition::validate`
 * refuses a comparison whose sides disagree, and a picker that ignores
 * dimensions lets a trader assemble `rsi > bollinger.upper` and discover the
 * refusal only after pressing "arm". Offering only compatible right-hand sides
 * turns a refusal into an option that was never there.
 */
export type OperandDimension = "price" | "percent" | "volume" | "unitless";

/** How the tab groups the picker. Editorial, and so not in the registry. */
export type IndicatorGroup = "oscillator" | "trend" | "volatility" | "volume";

/**
 * One parameter, with the value a trader starts from.
 *
 * `kind` mirrors `ParamKind`: a period is a whole number of candles, a factor
 * is a multiplier. A factor's default is a **string**, the way every other
 * decimal in this project is carried -- these values reach a comparison
 * against a price, and `0.1 + 0.2` is why.
 */
export interface CatalogueParam {
    readonly name: string;
    readonly kind: "period" | "factor";
    readonly default: ParamValue;
}

/** One output line a condition may read, with what its numbers mean. */
export interface CatalogueOutput {
    readonly name: string;
    readonly dimension: OperandDimension;
}

export interface CatalogueEntry {
    readonly id: string;
    readonly group: IndicatorGroup;
    readonly params: readonly CatalogueParam[];
    readonly outputs: readonly CatalogueOutput[];
}

const period = (name: string, value: number): CatalogueParam => ({
    name,
    kind: "period",
    default: value,
});
const factor = (name: string, value: DecimalString): CatalogueParam => ({
    name,
    kind: "factor",
    default: value,
});
/** The single-line shape: one output called `value`, never optional-by-omission. */
const value = (dimension: OperandDimension): readonly CatalogueOutput[] => [
    { name: "value", dimension },
];

/**
 * Every indicator a rule may name, in the order the tab shows them.
 *
 * Defaults are the conventional ones a trader expects to see already filled
 * in -- RSI 14, MACD 12/26/9, Bollinger 20/2 -- not the widest legal value.
 * A default outside the registry's bounds fails `indicatorCatalogue.test.ts`.
 */
export const INDICATOR_CATALOGUE: readonly CatalogueEntry[] = [
    // Oscillators: bounded, and so the family where a plain threshold is the
    // condition a trader actually wants.
    { id: "rsi", group: "oscillator", params: [period("period", 14)], outputs: value("percent") },
    {
        id: "stoch_rsi",
        group: "oscillator",
        params: [
            period("rsi_period", 14),
            period("stoch_period", 14),
            period("k_period", 3),
            period("d_period", 3),
        ],
        outputs: [
            { name: "k", dimension: "percent" },
            { name: "d", dimension: "percent" },
        ],
    },
    {
        id: "stochastic",
        group: "oscillator",
        params: [period("k_period", 14), period("k_smoothing", 3), period("d_period", 3)],
        outputs: [
            { name: "k", dimension: "percent" },
            { name: "d", dimension: "percent" },
        ],
    },
    {
        id: "williams_r",
        group: "oscillator",
        params: [period("period", 14)],
        outputs: value("percent"),
    },
    { id: "cci", group: "oscillator", params: [period("period", 20)], outputs: value("unitless") },
    {
        id: "mfi",
        group: "oscillator",
        params: [period("period", 14)],
        outputs: value("percent"),
    },
    {
        id: "ao",
        group: "oscillator",
        params: [period("fast_period", 5), period("slow_period", 34)],
        outputs: value("price"),
    },
    {
        id: "momentum",
        group: "oscillator",
        params: [period("period", 10)],
        outputs: value("price"),
    },

    // Trend: moving averages and the crosses built from them.
    { id: "ema", group: "trend", params: [period("period", 20)], outputs: value("price") },
    { id: "sma", group: "trend", params: [period("period", 20)], outputs: value("price") },
    { id: "wma", group: "trend", params: [period("period", 20)], outputs: value("price") },
    { id: "vwma", group: "trend", params: [period("period", 20)], outputs: value("price") },
    { id: "hma", group: "trend", params: [period("period", 20)], outputs: value("price") },
    {
        id: "macd",
        group: "trend",
        params: [period("fast_period", 12), period("slow_period", 26), period("signal_period", 9)],
        outputs: [
            { name: "macd", dimension: "price" },
            { name: "signal", dimension: "price" },
            { name: "histogram", dimension: "price" },
        ],
    },
    {
        id: "adx",
        group: "trend",
        params: [period("period", 14)],
        outputs: [
            { name: "adx", dimension: "percent" },
            { name: "plus_di", dimension: "percent" },
            { name: "minus_di", dimension: "percent" },
        ],
    },
    {
        id: "super_trend",
        group: "trend",
        params: [period("period", 10), factor("factor", "3")],
        outputs: [
            { name: "value", dimension: "price" },
            { name: "upper", dimension: "price" },
            { name: "lower", dimension: "price" },
        ],
    },
    {
        id: "parabolic_sar",
        group: "trend",
        params: [factor("start", "0.02"), factor("increment", "0.02"), factor("max", "0.2")],
        outputs: value("price"),
    },
    {
        id: "ichimoku",
        group: "trend",
        params: [
            period("conversion_period", 9),
            period("base_period", 26),
            period("span_b_period", 52),
        ],
        outputs: [
            { name: "conversion", dimension: "price" },
            { name: "base", dimension: "price" },
            { name: "span_a", dimension: "price" },
            { name: "span_b", dimension: "price" },
        ],
    },

    // Volatility.
    {
        id: "bollinger",
        group: "volatility",
        params: [period("period", 20), factor("std_dev", "2")],
        outputs: [
            { name: "upper", dimension: "price" },
            { name: "middle", dimension: "price" },
            { name: "lower", dimension: "price" },
            // Not prices, and this is the entry that forced the dimension onto
            // the output rather than onto the indicator.
            { name: "percent_b", dimension: "unitless" },
            { name: "bandwidth", dimension: "percent" },
        ],
    },
    { id: "atr", group: "volatility", params: [period("period", 14)], outputs: value("price") },
    {
        id: "choppiness",
        group: "volatility",
        params: [period("period", 14)],
        outputs: value("percent"),
    },

    // Volume. Both are denominated in size, so the core refuses either against
    // a price and the picker never offers the pairing.
    { id: "obv", group: "volume", params: [], outputs: value("volume") },
    {
        id: "volume_ma",
        group: "volume",
        params: [period("period", 20)],
        outputs: value("volume"),
    },
];

export const INDICATOR_GROUP_ORDER: readonly IndicatorGroup[] = [
    "oscillator",
    "trend",
    "volatility",
    "volume",
];

const BY_ID = new Map(INDICATOR_CATALOGUE.map((entry) => [entry.id, entry]));

/** The catalogue entry for a registry id, or `null` for one this build cannot name. */
export function catalogueEntry(id: string): CatalogueEntry | null {
    return BY_ID.get(id) ?? null;
}

/** The entries of one group, in catalogue order. */
export function indicatorsInGroup(group: IndicatorGroup): readonly CatalogueEntry[] {
    return INDICATOR_CATALOGUE.filter((entry) => entry.group === group);
}

/**
 * A fresh `IndicatorRef` for an entry: every parameter at its default, and the
 * first output line.
 *
 * Every parameter, always -- `IndicatorRef.params` is not a patch over the
 * panel's indicator settings, and a rule that inherited a period from whatever
 * the chart happened to show would mean something different tomorrow.
 */
export function defaultRef(entry: CatalogueEntry): IndicatorRef {
    const params: Record<string, ParamValue> = {};
    for (const param of entry.params) params[param.name] = param.default;
    return { id: entry.id, params, output: entry.outputs[0].name };
}

/** What an entry's chosen output line is denominated in. */
export function dimensionOf(entry: CatalogueEntry, output: string): OperandDimension {
    return entry.outputs.find((line) => line.name === output)?.dimension ?? "unitless";
}

/** i18n key for an indicator's display name. */
export const nameKey = (id: string): string => `alerts.indicators.${id}.name`;
/** i18n key for an output line's display name. */
export const outputKey = (id: string, output: string): string =>
    `alerts.indicators.${id}.outputs.${output}`;
/** i18n key for a parameter's display name. */
export const paramKey = (id: string, param: string): string =>
    `alerts.indicators.${id}.params.${param}`;
/** i18n key for a group heading. */
export const groupKey = (group: IndicatorGroup): string => `alerts.indicators.groups.${group}`;
