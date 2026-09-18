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
 * FEAT-0480 — what a chart drawing is.
 *
 * ## Class A, without exception
 *
 * A drawing is a trader's read of the market: where they think support sits,
 * which swing highs they consider one trend. ADR-0001 puts that on the device
 * and nowhere else — `localStorage` only, never a server, "not even as
 * telemetry/debug logs". Nothing in this subsystem takes a network call.
 *
 * ## Prices are strings, not numbers
 *
 * Every price crosses `localStorage` as a decimal string and lives in
 * `Decimal` while it is being used. `number` for a price is forbidden
 * repo-wide, and a drawing is not an exception just because it is also a
 * picture: FEAT-0029 hangs an alert off these levels, and an alert that fires
 * on a float-rounded threshold fires on a number the trader never wrote.
 *
 * ## Time is milliseconds
 *
 * Candles carry `open_time_ms`, the rule engine anchors firings in
 * `anchorMs`, and `lightweight-charts` wants seconds. Storing milliseconds
 * keeps the one conversion at the chart boundary, where it is a rendering
 * detail, rather than in the alert path, where a rounding step would decide
 * which candle a trend line is worth.
 */

/** Which drawings exist. New kinds extend the union, never the fields of one. */
export type DrawingKind = "horizontal" | "trend";

interface DrawingBase {
    /**
     * Stable across reloads and symbol switches — this is the handle FEAT-0029
     * hangs an alert on, so it outlives the chart that drew it and may never
     * be an array index or a render-time counter.
     */
    id: string;
    /**
     * Normalized symbol. A drawing belongs to exactly one market: a level read
     * off BTCUSDT means nothing on ETHUSDT, and showing it there would invite
     * exactly the wrong trade.
     */
    symbol: string;
    createdAtMs: number;
    /** Theme-aware CSS variable name, resolved at render time. */
    color?: string;
    label?: string;
}

/** A price level that holds at every timestamp. */
export interface HorizontalDrawing extends DrawingBase {
    kind: "horizontal";
    /** Decimal string. */
    price: string;
}

/** A straight line through two anchors, in (time, price) space. */
export interface TrendDrawing extends DrawingBase {
    kind: "trend";
    fromMs: number;
    /** Decimal string. */
    fromPrice: string;
    toMs: number;
    /** Decimal string. */
    toPrice: string;
}

export type ChartDrawing = HorizontalDrawing | TrendDrawing;

/** The `localStorage` key. Versioned, so a shape change is a migration and not a surprise. */
export const DRAWINGS_STORAGE_KEY = "cachy_drawings_v1";

/** The persisted document. */
export interface DrawingsDocument {
    schema_version: 1;
    drawings: ChartDrawing[];
}
