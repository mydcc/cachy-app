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
 * FEAT-0391 -- the alert template library.
 *
 * A template is data, not code: a timeframe and a condition tree, which
 * `templateDocument` lays over a draft to make a complete `RuleDocument`. That
 * document goes through the same `validate()` and the same content hash as a
 * hand-built rule, so an unedited template and a second trader's unedited copy
 * of it hash identically -- which is what lets the register in FEAT-0304 tell a
 * template from a variant of it.
 *
 * A template carries no `action` and no `provenance`. `templateDocument`
 * writes `notify` and `human` itself, so a template cannot arrive with an
 * order attached.
 *
 * `enabled` and the lifecycle fields come from the base, so the guarantee that
 * a loaded rule is not half-armed belongs to the caller: `loadTemplate` lays a
 * template over a fresh `blankDraft` rather than over whatever the trader
 * abandoned, and a draft with `enabled: true` is not armed until `arm()`
 * persists it.
 *
 * Every condition is one the Combo builder (FEAT-0030) can open: an indicator
 * on the left, a number, a price or another indicator on the right, at most
 * five legs, joined by `all`. A template the builder could not read would load
 * into a locked tab, which is the opposite of "a starting point for editing".
 * `templateLibrary.test.ts` round-trips every template through the builder to
 * hold that.
 *
 * Class A (ADR-0001): a loaded template is the trader's draft strategy from the
 * first frame and never leaves the device.
 */

import type {
    CompareOp,
    Condition,
    CrossDirection,
    IndicatorRef,
    Operand,
    RuleDocument,
    TimeframeString,
} from "../rules/types";

/**
 * How the tab groups the library. Editorial, like the indicator groups.
 *
 * No "risk" category although FEAT-0391 names one: a risk template needs a
 * position or account condition, and the Combo builder does not open those.
 */
export type TemplateCategory = "classic" | "trend" | "reversal" | "range" | "breakout";

export const TEMPLATE_CATEGORY_ORDER: readonly TemplateCategory[] = [
    "classic",
    "trend",
    "reversal",
    "range",
    "breakout",
];

export interface AlertTemplate {
    /** Stable identity, and the i18n key segment for the name and description. */
    readonly id: string;
    readonly category: TemplateCategory;
    /** The trigger timeframe. Every condition reads this timeframe too. */
    readonly timeframe: TimeframeString;
    readonly conditions: Condition;
}

/*
 * Indicator references, spelled the way the Combo builder writes them: every
 * parameter present and the output line named, even `value`. A template spelled
 * any other way would be rewritten the moment the Combo tab opened it, and the
 * trader's "unedited" copy would stop being the template.
 */

const rsi: IndicatorRef = { id: "rsi", params: { period: 14 }, output: "value" };

const macd = (output: "macd" | "signal"): IndicatorRef => ({
    id: "macd",
    params: { fast_period: 12, slow_period: 26, signal_period: 9 },
    output,
});

const movingAverage = (id: "ema" | "sma" | "volume_ma", period: number): IndicatorRef => ({
    id,
    params: { period },
    output: "value",
});

const adx = (output: "adx" | "plus_di" | "minus_di"): IndicatorRef => ({
    id: "adx",
    params: { period: 14 },
    output,
});

const choppiness: IndicatorRef = { id: "choppiness", params: { period: 14 }, output: "value" };

const indicator = (ref: IndicatorRef): Operand => ({ kind: "indicator", indicator: ref });
const constant = (value: string): Operand => ({ kind: "constant", value });

const crosses = (
    left: IndicatorRef,
    direction: CrossDirection,
    right: Operand,
    timeframe: TimeframeString,
): Condition => ({ kind: "cross", left: indicator(left), direction, right, timeframe });

const compares = (
    left: IndicatorRef,
    op: CompareOp,
    right: Operand,
    timeframe: TimeframeString,
): Condition => ({ kind: "compare", left: indicator(left), op, right, timeframe });

/** A template whose legs all read its own trigger timeframe. */
function template(
    id: string,
    category: TemplateCategory,
    timeframe: TimeframeString,
    legs: (timeframe: TimeframeString) => Condition[],
): AlertTemplate {
    return {
        id,
        category,
        timeframe,
        conditions: { kind: "group", op: "all", of: legs(timeframe) },
    };
}

/**
 * The shipped library, in the order the tab lists it.
 *
 * FEAT-0391 proposed "TEMA cross above VWAP" as well. Neither indicator is in
 * the core's registry, so that template could never pass `validate()`; the
 * trend-strength and range templates stand in its place.
 */
export const ALERT_TEMPLATES: readonly AlertTemplate[] = [
    template("golden_cross_volume", "classic", "1d", (tf) => [
        crosses(movingAverage("sma", 50), "above", indicator(movingAverage("sma", 200)), tf),
        compares(movingAverage("volume_ma", 5), "gt", indicator(movingAverage("volume_ma", 20)), tf),
    ]),
    template("vegas_tunnel_continuation", "trend", "1h", (tf) => [
        compares(movingAverage("ema", 144), "gt", indicator(movingAverage("ema", 169)), tf),
        crosses(movingAverage("ema", 12), "above", indicator(movingAverage("ema", 144)), tf),
    ]),
    template("macd_golden_cross_rsi_oversold", "reversal", "4h", (tf) => [
        crosses(macd("macd"), "above", indicator(macd("signal")), tf),
        compares(rsi, "lt", constant("30"), tf),
    ]),
    template("macd_death_cross_rsi_overbought", "reversal", "4h", (tf) => [
        crosses(macd("macd"), "below", indicator(macd("signal")), tf),
        compares(rsi, "gt", constant("70"), tf),
    ]),
    template("rsi_range_reversion", "range", "1h", (tf) => [
        crosses(rsi, "above", constant("30"), tf),
        compares(choppiness, "gt", constant("61.8"), tf),
    ]),
    template("adx_trend_breakout", "breakout", "4h", (tf) => [
        crosses(adx("adx"), "above", constant("25"), tf),
        compares(adx("plus_di"), "gt", indicator(adx("minus_di")), tf),
    ]),
];

/** The templates of one category, or every template for `null`, in library order. */
export function templatesIn(category: TemplateCategory | null): readonly AlertTemplate[] {
    return category === null
        ? ALERT_TEMPLATES
        : ALERT_TEMPLATES.filter((entry) => entry.category === category);
}

/** The categories that have at least one template, in display order. */
export function offeredCategories(): readonly TemplateCategory[] {
    return TEMPLATE_CATEGORY_ORDER.filter((category) => templatesIn(category).length > 0);
}

/**
 * Every indicator id a template reads, in first-use order, without repeats.
 *
 * Derived from the conditions rather than listed beside them, so the card can
 * never name an indicator the rule does not use.
 */
export function templateIndicators(entry: AlertTemplate): readonly string[] {
    const ids: string[] = [];
    const visit = (operand: Operand) => {
        if (operand.kind === "window") return visit(operand.of);
        if (operand.kind === "indicator" && !ids.includes(operand.indicator.id)) {
            ids.push(operand.indicator.id);
        }
    };
    const walk = (condition: Condition) => {
        if (condition.kind === "group") return condition.of.forEach(walk);
        if (condition.kind === "compare" || condition.kind === "cross") {
            visit(condition.left);
            visit(condition.right);
        }
    };
    walk(entry.conditions);
    return ids;
}

/**
 * The document a template becomes, laid over `base`.
 *
 * `base` supplies what a template has no opinion on: the symbol, the local
 * identity, the schema version and the lifecycle defaults. The template
 * supplies the strategy. The action and provenance are fixed here, whatever
 * `base` carried, and `veto` is dropped -- a template's meaning must not depend
 * on the draft it happened to replace.
 *
 * The conditions are copied, so editing the loaded rule can never reach the
 * shipped library.
 */
export function templateDocument(
    entry: AlertTemplate,
    base: RuleDocument,
    name: string,
): RuleDocument {
    const { veto: _veto, ...rest } = base;
    return {
        ...rest,
        name,
        trigger_timeframe: entry.timeframe,
        conditions: structuredClone(entry.conditions),
        action: { consequence_level: "notify" },
        provenance: { source: "human", created_at_ms: base.provenance.created_at_ms },
    };
}

/* i18n keys. Built at runtime, so `templateLibrary.test.ts` resolves each one. */

export const templateNameKey = (id: string): string => `dashboard.alerts.templates.name.${id}`;
export const templateDescriptionKey = (id: string): string =>
    `dashboard.alerts.templates.description.${id}`;
export const templateCategoryKey = (category: TemplateCategory): string =>
    `dashboard.alerts.templates.category.${category}`;
