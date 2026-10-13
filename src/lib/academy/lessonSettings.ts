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
 * The settings-card → engine-parameter mapping already exists and is tested:
 * `indicatorSettingsSeed` maps each settings card to its catalogue id, reads
 * every parameter out of the card, and falls back to the catalogue default for
 * anything the card cannot supply. A lesson that re-derived that table could
 * disagree with the chart window and the alert seed about the same indicator —
 * the drift that cost BUG-0457/BUG-0460 in `subPaneContent`.
 *
 * So this module adds only the direction a lesson needs — catalogue id →
 * settings card — and reads the parameters through the seed's own
 * `mappedIndicatorRefs`, which keeps the fallback semantics the seed's.
 *
 * Pure TypeScript, no runes and no store import: the caller passes the settings
 * object, so this stays a function of its arguments and a test needs no store.
 */

import { mappedIndicatorKeys, mappedIndicatorRefs } from "../alerts/indicatorSettingsSeed";
import type { CatalogueEntry } from "../alerts/indicatorCatalogue";
import type { ParamValue } from "../rules/types";

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
 * The parameters `entry` should be computed with: the user's own settings,
 * falling back to the catalogue default per parameter the card cannot supply.
 *
 * `settings` is the indicator settings object (`indicatorState`) or any object
 * keyed the same way. It is read, never stored — called inside a `$derived`,
 * the card's own `$state` fields are what make the lesson follow a settings
 * change.
 *
 * An unknown indicator, or one whose card is missing or unreadable, returns an
 * empty map: the caller then computes on the catalogue defaults, which is the
 * pre-FEAT-0681 behaviour rather than an error.
 */
export function lessonParams(
    entry: CatalogueEntry,
    settings: object,
): Readonly<Record<string, ParamValue>> {
    const settingsKey = settingsCardFor(entry.id);
    if (settingsKey === null) return {};

    const card = (settings as Record<string, unknown>)[settingsKey];
    if (card === null || typeof card !== "object") return {};

    const ref = mappedIndicatorRefs(settingsKey, card as SettingsCard).find(
        (candidate) => candidate.id === entry.id,
    );
    return ref?.params ?? {};
}

/** The timeframe a lesson draws on when the user's own list offers none of ours. */
export const LESSON_TIMEFRAME_FALLBACK = "1h";

/**
 * The timeframes a lesson may be drawn on.
 *
 * Mirrors the options the analysis-timeframe setting itself offers
 * (`CalculationSettings`), so a lesson cannot be switched to a timeframe the
 * rest of the app does not analyse. The setting decides *which* of these a
 * given user gets; this list is only the ceiling, and it is intersected rather
 * than trusted because settings come back out of `localStorage` and a migrated
 * or hand-edited store is a boundary.
 */
const SUPPORTED_LESSON_TIMEFRAMES = ["5m", "15m", "1h", "4h", "1d"] as const;

/** The lesson timeframes `analysisTimeframes` allows, or the fallback alone. */
export function lessonTimeframeOptions(
    analysisTimeframes: readonly string[],
): readonly string[] {
    const offered = SUPPORTED_LESSON_TIMEFRAMES.filter((timeframe) =>
        analysisTimeframes.includes(timeframe),
    );
    return offered.length > 0 ? offered : [LESSON_TIMEFRAME_FALLBACK];
}
