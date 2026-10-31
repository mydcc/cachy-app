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
 * FEAT-0686 — the chart's annotation contract, in one place.
 *
 * A parent (the market-structure cockpit) draws swings, break markers and
 * level lines on a lesson chart. Both sides must agree on the shape, so the
 * types live here rather than being re-declared by each caller: a field
 * added on one side only is a silent no-op at runtime and a duplicate-type
 * error at compile time.
 *
 * The units are the chart library's own: marker `time` is Unix **seconds**,
 * matching the candle series, and `price` is a plain number, matching
 * `createPriceLine`.
 */

export interface LessonChartMarker {
    /** Unix seconds, like the candle data. */
    time: number;
    position: "aboveBar" | "belowBar";
    color: string;
    shape: "arrowUp" | "arrowDown" | "circle";
    text?: string;
}

/** A horizontal level on the candle series. */
export interface LessonChartLine {
    price: number;
    color: string;
    title?: string;
    /**
     * `dashed` (default) keeps the cockpit's level look; `dotted` marks the
     * inducement, `solid` is available for anchors that should not read as a
     * zone edge.
     */
    lineStyle?: "solid" | "dashed" | "dotted";
}