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
 * FEAT-0681 — how a lesson reads the user's own settings.
 *
 * The settings-card → engine-input mapping already exists and is tested:
 * `indicatorSettingsSeed` maps each settings card to its catalogue id, reads
 * every parameter out of the card, names the price it is drawn over, and falls
 * back to the catalogue default for anything the card cannot supply. A lesson
 * that re-derived that table could disagree with the chart window and the alert
 * seed about the same indicator — the drift that cost BUG-0457/BUG-0460 in
 * `subPaneContent`.
 *
 * So this module adds only the direction a lesson needs — catalogue id →
 * settings card — and reads through the seed's own `mappedIndicatorRefs`, which
 * keeps the fallback semantics the seed's.
 *
 * Pure TypeScript, no runes and no store import: the caller passes the settings
 * object, so this stays a function of its arguments and a test needs no store.
 */

import { mappedIndicatorKeys, mappedIndicatorRefs } from "../alerts/indicatorSettingsSeed";
import { parseTimeframe } from "../../utils/chartDisplay";
import { normalizeTimeframeInput } from "../../utils/utils";
import { safeLocalStorage } from "../../utils/storageWrapper";
import { CONSTANTS } from "../constants";
import type { CatalogueEntry } from "../alerts/indicatorCatalogue";
import type { IndicatorRef, ParamValue, PriceField } from "../rules/types";
import type { Kline } from "../../services/technicalsTypes";

/** A settings card, the shape `indicatorSettingsSeed` reads. */
type SettingsCard = Record<string, unknown>;

/**
 * Catalogue id → the settings card that configures it.
 *
 * Built once from the seed's own table, so a card added there is reachable from
 * a lesson with no edit here. The first line wins where a card maps several of
 * them: `ema` and `sma` map three moving averages each, and the first is the
 * one the panel leads with.
 */
const CARD_BY_INDICATOR: ReadonlyMap<string, string> = buildCardIndex();

function buildCardIndex(): ReadonlyMap<string, string> {
    const index = new Map<string, string>();
    for (const settingsKey of mappedIndicatorKeys()) {
        for (const ref of mappedIndicatorRefs(settingsKey, {})) {
            if (!index.has(ref.id)) index.set(ref.id, settingsKey);
        }
    }
    return index;
}

/** The settings card a catalogue indicator is configured on, or `null`. */
export function settingsCardFor(indicatorId: string): string | null {
    return CARD_BY_INDICATOR.get(indicatorId) ?? null;
}

/**
 * What a lesson computes with, and how much of it is the trader's own.
 *
 * `modified` is provenance rather than value inequality. The Technicals store
 * ships its own defaults — its first EMA length is 21 where the catalogue's
 * alert default is 20 — so comparing the shown value against the *catalogue*
 * default would label four untouched indicators (`ema`, `sma`, `wma`, `hma`) as
 * the trader's own configuration. Comparing against a baseline store instead
 * asks the question the marker means: "did you change this from how it
 * arrived?".
 */
export interface LessonParameters {
    /** What the chart computes with: the trader's settings, defaults filled in. */
    readonly values: Readonly<Record<string, ParamValue>>;
    /**
     * The price the card draws the indicator over, when that is not the
     * indicator's own default — the seed drops a default field, so this is
     * `undefined` in the common case.
     *
     * A lesson has to carry it. The chart window computes over the card's
     * `source` (`indicatorLayer`), so a lesson that ignored it would draw RSI
     * over the close while the trader's own chart draws RSI over `hl2` — the
     * same "lesson does not match the chart I trade from" gap this feature
     * exists to close.
     */
    readonly field: PriceField | undefined;
    /** Parameter names whose value differs from `baseline`'s. */
    readonly modified: ReadonlySet<string>;
}

/**
 * The inputs `entry` should be computed with: the user's own settings, falling
 * back to the catalogue default per parameter their card cannot supply.
 *
 * `settings` is the indicator settings object (`indicatorState`) or any object
 * keyed the same way; `baseline` is a store the trader has never configured (a
 * copy of the shipped defaults), which is what makes `modified` mean "you
 * changed this" rather than "this differs from the catalogue". Pass `{}` for a
 * baseline to compare against the catalogue defaults instead.
 *
 * Both objects are read, never stored — called inside a `$derived`, the card's
 * own `$state` fields are what make the lesson follow a settings change.
 *
 * An unknown indicator, or one whose card is missing or unreadable, yields
 * nothing: the caller then computes on the catalogue defaults, which is the
 * pre-FEAT-0681 behaviour rather than an error.
 */
export function lessonParams(
    entry: CatalogueEntry,
    settings: object,
    baseline: object,
): LessonParameters {
    const live = refFrom(entry, settings);
    const shipped = refFrom(entry, baseline);
    const values = live?.params ?? {};

    const modified = new Set<string>();
    for (const param of entry.params) {
        const shown = values[param.name] ?? param.default;
        const arrived = shipped?.params[param.name] ?? param.default;
        if (String(shown) !== String(arrived)) modified.add(param.name);
    }
    return { values, field: live?.field, modified };
}

/** The ref the card configures for `entry`, or `null` when there is no card. */
function refFrom(entry: CatalogueEntry, settings: object): IndicatorRef | null {
    const settingsKey = settingsCardFor(entry.id);
    if (settingsKey === null) return null;

    const card = (settings as Record<string, unknown>)[settingsKey];
    if (card === null || typeof card !== "object") return null;

    return (
        mappedIndicatorRefs(settingsKey, card as SettingsCard).find(
            (candidate) => candidate.id === entry.id,
        ) ?? null
    );
}

/** The timeframe a lesson draws on when the stored or submitted one is unusable. */
export const LESSON_TIMEFRAME_FALLBACK = "1h";

/**
 * Whether `value` is a timeframe the app can draw a candle for.
 *
 * Delegates to the app's own parser rather than repeating its notation: the
 * first hand-rolled version accepted `0m`, which `parseTimeframe` refuses (a
 * zero-length candle) and which reached the wire as a channel the exchange does
 * not serve — the lesson then drew nothing, on every reload, because the stored
 * value still passed. One parser, so the two cannot drift again (FEAT-0684
 * review).
 */
export function isDrawableTimeframe(value: string): boolean {
    return parseTimeframe(value) !== null;
}

/**
 * The timeframe lessons and structure demos draw on: the stored choice when
 * usable, the fallback otherwise. One reader so the lesson chart and the
 * cockpit cannot disagree about what was stored.
 */
export function readStoredLessonTimeframe(): string {
    const stored = safeLocalStorage.getItem(CONSTANTS.LOCAL_STORAGE_LESSON_TIMEFRAME_KEY);
    if (stored === null) return LESSON_TIMEFRAME_FALLBACK;
    const canonical = normalizeTimeframeInput(stored);
    return isDrawableTimeframe(canonical) ? canonical : LESSON_TIMEFRAME_FALLBACK;
}

/**
 * FEAT-0763 — how much history a lesson chart draws and warms.
 *
 * 600 one-hour candles are roughly 25 days: enough for the catalogue's widest
 * warmup (Ichimoku's 52-bar span plus its displacement) and, more importantly,
 * for a readable swing picture — a "4h is bearish" reading needs weeks of
 * structure behind it, not days. One number for the indicator chart and the
 * structure cockpit, so the two cannot disagree about how much history a
 * lesson shows.
 */
export const LESSON_CANDLE_WINDOW = 600;

/**
 * How many candles the charts ask the history pager for. The exchange serves
 * about 200 per request; `ensureHistory` fans out across ranges (ADR-0022) and
 * the store keeps the merged result, so asking for the draw window up front is
 * what keeps the first render from arriving short.
 */
export const LESSON_HISTORY_TARGET = LESSON_CANDLE_WINDOW;

/**
 * The newest `window` candles of `klines`, oldest first, with the series-API
 * guards applied: a non-finite or non-ascending candle makes the chart library
 * throw from inside an `$effect`, and such a throw bubbles to
 * `handleGlobalError` (BUG-0213) and can freeze the chart (BUG-0248). Dropping
 * it here means neither caller has to remember the guard.
 */
export function lessonKlines(
    klines: readonly Kline[] | undefined,
    window: number = LESSON_CANDLE_WINDOW,
): Kline[] {
    if (!klines || klines.length === 0) return [];
    const out: Kline[] = [];
    let lastTime = -Infinity;
    for (const kline of klines.slice(-window)) {
        const time = Number(kline.time); // audit: safe — epoch-ms timestamp
        if (!Number.isFinite(time) || time <= 0 || time <= lastTime) continue;
        lastTime = time;
        out.push(kline);
    }
    return out;
}
