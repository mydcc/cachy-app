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
 * FEAT-0480 — turning a drawing into screen points, and back.
 *
 * ## Sampled, not projected
 *
 * A sloped line is drawn as a polyline through one point per sample time,
 * each one obtained by asking `levelAt()` for a price and the chart for that
 * price's pixel. It is not drawn as a segment between two endpoint pixels.
 *
 * That is the whole trick behind "the line you see is the line that fires".
 * Two endpoints joined by a straight stroke would be correct only on a linear
 * price scale; the chart defaults to logarithmic, where the same level curves.
 * Sampling delegates every scale question back to the chart's own transform,
 * so the picture follows whatever scale is active without this file knowing
 * which one it is — the criterion's "without duplicating the chart's scale
 * maths", met by construction rather than by care.
 *
 * Sampling at candle times is not an approximation either: those are exactly
 * the timestamps FEAT-0029 evaluates, so the polyline's vertices are the
 * points that can actually trigger.
 *
 * ## Pixels are numbers
 *
 * Prices stay `Decimal` up to the moment they become coordinates. A pixel is
 * not money — it is a device coordinate that is about to be rounded to a
 * physical dot anyway — so the `toNumber()` happens at this boundary and
 * nowhere earlier.
 */

import type { Decimal } from "decimal.js";

import { levelAt } from "./levelAt";
import type { ChartDrawing } from "./types";

/**
 * The subset of the chart this module needs, as a port.
 *
 * Same reasoning as `PriceLineHostSeries` in `priceLineManager.ts`: it keeps
 * the geometry unit-testable against a fake with no canvas, no DOM and no
 * chart instance, and it names precisely which chart powers this feature
 * depends on.
 */
export interface DrawingChartBridge {
    /** Pixel x for a timestamp, or null when the chart cannot place it. */
    timeToX(ms: number): number | null;
    /** Pixel y for a price, or null when it is outside the addressable range. */
    priceToY(price: Decimal): number | null;
    /** Timestamp under a pixel x, or null off the scale. */
    xToTime(x: number): number | null;
    /** Price at a pixel y, or null off the scale. */
    yToPrice(y: number): Decimal | null;
    /**
     * Candle open times currently plotted, ascending. These are the sample
     * points, so they are also the timestamps a drawing-anchored alert sees.
     */
    sampleTimesMs(): number[];
    /** Visible drawing area in CSS pixels. */
    size(): { width: number; height: number };
}

export interface Point {
    x: number;
    y: number;
}

/**
 * The polyline for one drawing, in CSS pixels.
 *
 * Empty when the drawing cannot be placed at all — off-screen, or a vertical
 * trend line that has no level. Callers draw nothing rather than guessing.
 */
export function polylineFor(drawing: ChartDrawing, bridge: DrawingChartBridge): Point[] {
    const { width } = bridge.size();

    if (drawing.kind === "horizontal") {
        const y = bridge.priceToY(levelAt(drawing, 0)!);
        // A horizontal line needs no sampling: it is the same price at every
        // timestamp, so on any scale it is one straight stroke edge to edge.
        return y === null ? [] : [{ x: 0, y }, { x: width, y }];
    }

    const times = bridge.sampleTimesMs();
    const points: Point[] = [];
    for (const ms of times) {
        const x = bridge.timeToX(ms);
        if (x === null) continue;
        const price = levelAt(drawing, ms);
        if (!price) return [];
        const y = bridge.priceToY(price);
        if (y === null) continue;
        points.push({ x, y });
    }
    return points;
}

/**
 * Shortest distance in pixels from a point to a polyline, or null for an
 * empty one.
 *
 * Used for hit testing: a trader grabs a line by pointing near it, and "near"
 * has to mean near the drawn stroke — including the sloped, sampled one —
 * rather than near an endpoint.
 */
export function distanceToPolyline(points: Point[], at: Point): number | null {
    if (points.length === 0) return null;
    if (points.length === 1) return Math.hypot(points[0].x - at.x, points[0].y - at.y);

    let best = Infinity;
    for (let i = 1; i < points.length; i++) {
        const d = distanceToSegment(points[i - 1], points[i], at);
        if (d < best) best = d;
    }
    return best;
}

/** Perpendicular distance to a segment, clamped to its endpoints. */
function distanceToSegment(a: Point, b: Point, p: Point): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    // A degenerate segment is a point; falling through the projection below
    // would divide by zero.
    if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);

    // How far along the segment the perpendicular foot falls, clamped so a
    // point beyond an end measures to that end rather than to the infinite
    // line the segment sits on.
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
