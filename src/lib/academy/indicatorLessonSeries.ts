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
 * FEAT-0677, AC 9 — the lines a lesson chart has to draw.
 *
 * `SeriesResult` carries one line, so "render every line the catalogue declares"
 * is one `computeIndicatorSeries` call per declared output. This module owns
 * that fan-out, which keeps the count a tested property of the data rather than
 * something a canvas remembers to loop over.
 *
 * Pure TypeScript, no runes: the UI half decides *where* a line goes (from
 * `CatalogueEntry.placement`) and this half only says *what* the engine
 * produced, so the two can be reasoned about — and tested — apart.
 */

import { defaultRef, type CatalogueEntry } from "../alerts/indicatorCatalogue";
import type { IndicatorRequest } from "../rules/indicatorRequests";
import { computeIndicatorSeries, type SeriesResult } from "../rules/indicatorSeries";
import type { EvaluationCandle, IndicatorRef, ParamValue, PriceField } from "../rules/types";

/** One declared output line, in the engine's own arithmetic. */
export interface LessonLine {
    /** The catalogue's output name, e.g. `value`, `histogram`, `upper`. */
    readonly name: string;
    /** One entry per candle, `null` where the engine is indeterminate. */
    readonly values: Extract<SeriesResult, { supported: true }>["values"];
}

export interface LessonSeries {
    readonly lines: readonly LessonLine[];
    /**
     * Declared outputs this build's engine refuses, with its reason. Empty for a
     * healthy catalogue — a lesson that declares a line the chart cannot draw is
     * a defect, not a rounding error, so the caller is told rather than shown a
     * silently short legend.
     */
    readonly refused: readonly { readonly name: string; readonly reason: string }[];
}

/**
 * Every line `entry` declares, computed over `candles`.
 *
 * The parameters default to `defaultRef`, the same starting point the alert
 * builder uses. `params` overrides them per name: FEAT-0681 passes the user's
 * own Technicals settings here, so a lesson draws the indicator the trader
 * actually runs rather than the one the catalogue ships. `field` is the price
 * those settings draw it over — the engine reads `field ?? defaultFieldOf(id)`,
 * so omitting it reproduces the catalogue's own source.
 *
 * A name the caller omits keeps its catalogue default, so this fan-out stays
 * total. A name the entry does not declare is inert: the engine reads only the
 * names an entry declares, and `lessonParams`, the one producer of `params`,
 * derives its keys from them.
 */
export function computeLessonSeries(
    entry: CatalogueEntry,
    candles: readonly EvaluationCandle[],
    timeframe: IndicatorRequest["timeframe"],
    params?: Readonly<Record<string, ParamValue>>,
    field?: PriceField,
): LessonSeries {
    const defaults = defaultRef(entry);
    const withParams: IndicatorRef =
        params === undefined
            ? defaults
            : { ...defaults, params: { ...defaults.params, ...params } };
    // An absent field is not "the close": it is the indicator's own default,
    // which is the catalogue's answer and the pre-FEAT-0681 behaviour.
    const base: IndicatorRef = field === undefined ? withParams : { ...withParams, field };
    const lines: LessonLine[] = [];
    const refused: { name: string; reason: string }[] = [];

    for (const output of entry.outputs) {
        const result = computeIndicatorSeries(
            { indicator: { ...base, output: output.name }, timeframe },
            candles,
        );

        if (result.supported) {
            lines.push({ name: output.name, values: result.values });
        } else {
            refused.push({ name: output.name, reason: result.reason });
        }
    }

    return { lines, refused };
}
