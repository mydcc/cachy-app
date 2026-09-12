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

/**
 * FEAT-0395 — the indicator entry point: panel settings to a rule operand.
 *
 * Two lists name the same indicators and neither can own both. The settings
 * panel has camelCase keys a trader edits (`rsi.length`, `bollingerBands.stdDev`)
 * and the rule core has registry identities with its own parameter names
 * (`rsi`/`period`, `bollinger`/`std_dev`). This module is the one translation
 * between them, and `indicatorSettingsSeed.test.ts` runs every entry of it
 * through the real core so a misspelled parameter fails CI rather than
 * arming an alert on a period the trader never chose.
 *
 * **Copying, not inheriting.** `IndicatorRef.params` says a rule never
 * inherits panel settings, and that still holds: this reads the configured
 * values once, at the moment the trader presses the action, and writes them
 * into the draft document. Retuning RSI in settings afterwards does not
 * retune an armed alert — the document owns its parameters from then on.
 *
 * Class A throughout (ADR-0001): panel settings and draft rules are both
 * strategy and never leave the device.
 */

import { Decimal } from "decimal.js";

import {
    catalogueEntry,
    type CatalogueEntry,
} from "./indicatorCatalogue";
import { buildIndicatorCondition, defaultForm } from "./indicatorConditionForm";
import type { IndicatorRef, ParamValue } from "../rules/types";
import {
    DEFAULT_RULE_TIMEFRAME,
    type AlertPanelSeed,
} from "../../stores/alertPanel.svelte";

/** A settings card, as it comes out of the store. */
type SettingsCard = Record<string, unknown>;

/**
 * Reads one core parameter out of a settings card, or `null` when the card
 * cannot supply it.
 *
 * `null` rather than a guess: the caller falls back to the catalogue default,
 * which is the value the panel itself would be showing for an unreadable
 * setting. Panel settings come back out of `localStorage`, so a migrated or
 * hand-edited store is a boundary and is validated like one.
 */
type ParamReader = (card: SettingsCard) => ParamValue | null;

/** Walks a dotted path into a card, e.g. `ema1` then `length`. */
function at(card: SettingsCard, path: readonly string[]): unknown {
    let cursor: unknown = card;
    for (const step of path) {
        if (cursor === null || typeof cursor !== "object") return null;
        cursor = (cursor as Record<string, unknown>)[step];
    }
    return cursor;
}

/** A whole number of candles: at least one, and never a fraction. */
function period(...path: readonly string[]): ParamReader {
    return (card) => {
        const raw = at(card, path);
        const value = typeof raw === "string" ? Number(raw) : raw;
        if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
            return null;
        }
        return value;
    };
}

/**
 * A multiplier, as the decimal string the core takes.
 *
 * Through `Decimal` rather than `String(n)` because these values reach a
 * comparison against a price: a std-dev of `2.1` typed into a number input is
 * already a float, and `0.1 + 0.2` is why this project does not let one
 * become a canonical form by way of `toString`.
 */
function factor(...path: readonly string[]): ParamReader {
    return (card) => {
        const raw = at(card, path);
        if (typeof raw !== "number" && typeof raw !== "string") return null;
        try {
            const decimal = new Decimal(raw);
            if (!decimal.isFinite() || decimal.lte(0)) return null;
            return decimal.toString();
        } catch {
            return null;
        }
    };
}

/** One `IndicatorRef` a card produces: a core identity and how to fill it. */
interface LineMapping {
    /** A registry identity from `INDICATOR_CATALOGUE`. */
    readonly id: string;
    /** Core parameter name to the settings field that supplies it. */
    readonly params: Readonly<Record<string, ParamReader>>;
}

/**
 * Every settings card a trader can arm an alert from.
 *
 * A card absent from this table simply has no action — the button is derived
 * from the table rather than placed by hand, so a card the rule core cannot
 * express (Pivots, VWAP, Volume Profile, the ATR trailing stop) cannot grow a
 * button that leads nowhere.
 *
 * Cards carrying several configured lines produce several refs, in the order
 * the panel shows them. EMA and SMA are the reason this is a list: one card
 * there is three moving averages, not one.
 */
const SETTINGS_MAPPINGS: Readonly<Record<string, readonly LineMapping[]>> = {
    // -- Oscillators
    rsi: [{ id: "rsi", params: { period: period("length") } }],
    stochRsi: [
        {
            id: "stoch_rsi",
            params: {
                rsi_period: period("rsiLength"),
                stoch_period: period("length"),
                k_period: period("kPeriod"),
                d_period: period("dPeriod"),
            },
        },
    ],
    stochastic: [
        {
            id: "stochastic",
            params: {
                k_period: period("kPeriod"),
                k_smoothing: period("kSmoothing"),
                d_period: period("dPeriod"),
            },
        },
    ],
    williamsR: [{ id: "williams_r", params: { period: period("length") } }],
    cci: [{ id: "cci", params: { period: period("length") } }],
    mfi: [{ id: "mfi", params: { period: period("length") } }],
    ao: [
        {
            id: "ao",
            params: {
                fast_period: period("fastLength"),
                slow_period: period("slowLength"),
            },
        },
    ],
    momentum: [{ id: "momentum", params: { period: period("length") } }],

    // -- Trend
    ema: [
        { id: "ema", params: { period: period("ema1", "length") } },
        { id: "ema", params: { period: period("ema2", "length") } },
        { id: "ema", params: { period: period("ema3", "length") } },
    ],
    sma: [
        { id: "sma", params: { period: period("sma1", "length") } },
        { id: "sma", params: { period: period("sma2", "length") } },
        { id: "sma", params: { period: period("sma3", "length") } },
    ],
    wma: [{ id: "wma", params: { period: period("length") } }],
    vwma: [{ id: "vwma", params: { period: period("length") } }],
    hma: [{ id: "hma", params: { period: period("length") } }],
    macd: [
        {
            id: "macd",
            params: {
                fast_period: period("fastLength"),
                slow_period: period("slowLength"),
                signal_period: period("signalLength"),
            },
        },
    ],
    /*
     * The core takes one ADX period; the panel has two smoothings.
     * `adxSmoothing` is the one that governs the ADX line itself, which is the
     * series a condition reads, so that is the one carried. `diLength` has no
     * counterpart in the registry and is dropped rather than guessed at.
     */
    adx: [{ id: "adx", params: { period: period("adxSmoothing") } }],
    superTrend: [
        {
            id: "super_trend",
            params: { period: period("period"), factor: factor("factor") },
        },
    ],
    parabolicSar: [
        {
            id: "parabolic_sar",
            params: {
                start: factor("start"),
                increment: factor("increment"),
                max: factor("max"),
            },
        },
    ],
    ichimoku: [
        {
            id: "ichimoku",
            params: {
                conversion_period: period("conversionPeriod"),
                base_period: period("basePeriod"),
                span_b_period: period("spanBPeriod"),
            },
        },
    ],

    // -- Volatility
    bollingerBands: [
        {
            id: "bollinger",
            params: { period: period("length"), std_dev: factor("stdDev") },
        },
    ],
    atr: [{ id: "atr", params: { period: period("length") } }],
    choppiness: [{ id: "choppiness", params: { period: period("length") } }],

    // -- Volume
    /* OBV takes no parameters; the panel's smoothing has no counterpart. */
    obv: [{ id: "obv", params: {} }],
    volumeMa: [{ id: "volume_ma", params: { period: period("length") } }],
};

/** Whether a settings card can arm an alert at all. */
export function isAlertableIndicator(settingsKey: string): boolean {
    return settingsKey in SETTINGS_MAPPINGS;
}

/** Every settings key with an alert action, for the mapping's own tests. */
export function alertableIndicatorKeys(): readonly string[] {
    return Object.keys(SETTINGS_MAPPINGS);
}

/**
 * What each line of a card's mapping claims to fill, for the mapping's tests.
 *
 * Exposed because a misspelled *core* parameter name is otherwise invisible:
 * `refFor` walks the registry's parameter list and looks a reader up by the
 * core's own name, so a mapping key the core never declares is simply never
 * consulted. The registry default takes over, the document stays valid, and
 * `rule_validate` has nothing to complain about — the alarm just runs on a
 * period the trader did not choose. Only comparing the declared names against
 * the registry catches it, which is what
 * `names exactly the parameters the core declares` does.
 */
export function mappingLines(
    settingsKey: string,
): readonly { readonly id: string; readonly params: readonly string[] }[] {
    return (SETTINGS_MAPPINGS[settingsKey] ?? []).map((mapping) => ({
        id: mapping.id,
        params: Object.keys(mapping.params),
    }));
}

/** Fills one line's parameters, falling back to the registry's defaults. */
function refFor(mapping: LineMapping, entry: CatalogueEntry, card: SettingsCard): IndicatorRef {
    const params: Record<string, ParamValue> = {};
    for (const declared of entry.params) {
        const read = mapping.params[declared.name];
        params[declared.name] = read?.(card) ?? declared.default;
    }
    return { id: entry.id, params, output: entry.outputs[0].name };
}

/**
 * The refs a settings card configures, in the order the panel shows them.
 *
 * Empty when the card has no alert action. Never partially filled: a
 * parameter the card cannot supply takes the registry default, so the result
 * is always a document the core accepts.
 */
export function indicatorRefsFrom(
    settingsKey: string,
    card: SettingsCard,
): readonly IndicatorRef[] {
    const mappings = SETTINGS_MAPPINGS[settingsKey];
    if (!mappings) return [];
    const refs: IndicatorRef[] = [];
    for (const mapping of mappings) {
        const entry = catalogueEntry(mapping.id);
        if (!entry) continue;
        refs.push(refFor(mapping, entry, card));
    }
    return refs;
}

/**
 * The seed the indicator entry point hands to `openAlertPanelWith`.
 *
 * `null` when the card has no alert action, which is what keeps the button
 * and the seed from disagreeing about which cards are armable.
 *
 * The condition is the tab's own default shape with the configured indicator
 * substituted for the default one: `> 0` against a constant, left for the
 * trader to complete. The threshold is deliberately not guessed — it is the
 * one number that is not on screen, and a plausible-looking default is the
 * kind that gets armed unread (ADR-0012 decision 5).
 */
export function seedFromIndicatorSettings(
    settingsKey: string,
    card: SettingsCard,
    symbol: string,
): AlertPanelSeed | null {
    const refs = indicatorRefsFrom(settingsKey, card);
    if (refs.length === 0) return null;
    const entry = catalogueEntry(refs[0].id);
    if (!entry) return null;
    const form = { ...defaultForm(entry), subject: refs[0] };
    return {
        symbol,
        tab: "indicators",
        condition: buildIndicatorCondition(form, DEFAULT_RULE_TIMEFRAME),
        timeframe: DEFAULT_RULE_TIMEFRAME,
    };
}
