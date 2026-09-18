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
 * FEAT-0480 — what price a drawing sits at, at one moment in time.
 *
 * ## The one definition
 *
 * This is the only place that answers the question. The chart's renderer calls
 * it to decide where to put pixels, and FEAT-0029's alerts call it to decide
 * whether a candle crossed. That is deliberate: a picture that disagreed with
 * the threshold it represents would be a trap, and the cheapest way to keep
 * them identical is to give them one function rather than two that are meant
 * to match.
 *
 * It follows that the renderer draws a *sampled* line rather than a segment
 * between two screen points — see `drawingPrimitive.ts`. The extra samples are
 * what buys the guarantee.
 *
 * ## Why the interpolation is linear in price
 *
 * The chart defaults to a logarithmic price scale, so a line that is straight
 * on screen is not straight in prices, and the two readings differ. This picks
 * prices, for two reasons that outrank how the line looks:
 *
 * 1. **An alert has no scale.** The rule engine evaluates candles in a worker
 *    with no chart attached, and often with no chart open at all. A level that
 *    could only be computed from pixel coordinates could not be evaluated
 *    there at all.
 * 2. **A threshold may not depend on a view setting.** Interpolating in screen
 *    space would move every alert level the moment the trader toggled
 *    logarithmic to linear — an unverifiable trigger of exactly the kind the
 *    rule system refuses everywhere else.
 *
 * On a log scale the drawn line therefore bows slightly. That is not a
 * rendering bug; it is the honest picture of the level that will actually
 * fire.
 *
 * ## Why it extrapolates
 *
 * A trend line's whole purpose is the part that has not happened yet: the
 * trader anchors it on two swings and wants to know when price meets it next
 * week. So the two anchors define an infinite straight line, not a segment,
 * and `levelAt` answers for any timestamp. Clipping to the anchors would make
 * every forward-looking alert unarmable, which is the only kind worth having.
 */

import { Decimal } from "decimal.js";

import type { ChartDrawing } from "./types";

/**
 * The drawing's price at `atMs`, or `null` when it has none.
 *
 * `null` means "this drawing does not define a level here", and every caller
 * must treat it as "do not fire" rather than as zero. Today the only such case
 * is a trend line whose anchors share a timestamp — a vertical line, which is
 * not a function of time and cannot be crossed at a price. The UI prevents
 * drawing one; this returns `null` rather than trusting that it did.
 */
export function levelAt(drawing: ChartDrawing, atMs: number): Decimal | null {
    if (drawing.kind === "horizontal") return new Decimal(drawing.price);

    const spanMs = drawing.toMs - drawing.fromMs;
    if (spanMs === 0) return null;

    const from = new Decimal(drawing.fromPrice);
    const slope = new Decimal(drawing.toPrice).minus(from).div(spanMs);
    return from.plus(slope.times(atMs - drawing.fromMs));
}

/**
 * Whether a candle's range touched the drawing's level.
 *
 * Touch counts, matching the core's crossing semantics (BUG-0464): a wick that
 * reaches the line exactly has met it, and a trader who drew support at 50 000
 * means 50 000.
 */
export function candleTouches(
    drawing: ChartDrawing,
    candle: { open_time_ms: number; high: string | number; low: string | number },
): boolean {
    const level = levelAt(drawing, candle.open_time_ms);
    if (!level) return false;
    return new Decimal(candle.low).lte(level) && new Decimal(candle.high).gte(level);
}
