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
 * FEAT-0480 — the picture has to be the level.
 *
 * The bridge below is deliberately *logarithmic*, which is the chart's own
 * default (`mode: 1`). A test on a linear scale would pass for both the
 * sampled implementation and the naive two-endpoint one, and so would prove
 * nothing about the criterion it is here to defend.
 */

import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { distanceToPolyline, polylineFor, type DrawingChartBridge } from "./geometry";
import { levelAt } from "./levelAt";
import type { HorizontalDrawing, TrendDrawing } from "./types";

const T0 = 1_757_030_400_000;
const HOUR = 3_600_000;
const WIDTH = 1000;
const HEIGHT = 500;

/**
 * A chart whose price axis is logarithmic, like the real one.
 *
 * y = HEIGHT * (1 - (ln p - ln lo) / (ln hi - ln lo)), so higher prices sit
 * nearer the top. Time maps linearly to x over ten hours.
 */
function logBridge(sampleTimes = tenHourlySamples()): DrawingChartBridge {
    const lo = Math.log(40_000);
    const hi = Math.log(60_000);
    const spanMs = 10 * HOUR;
    return {
        timeToX: (ms) => ((ms - T0) / spanMs) * WIDTH,
        xToTime: (x) => T0 + (x / WIDTH) * spanMs,
        priceToY: (price) => {
            const v = Math.log(price.toNumber());
            if (!Number.isFinite(v)) return null;
            return HEIGHT * (1 - (v - lo) / (hi - lo));
        },
        yToPrice: (y) => new Decimal(Math.exp(lo + (1 - y / HEIGHT) * (hi - lo))),
        sampleTimesMs: () => sampleTimes,
        size: () => ({ width: WIDTH, height: HEIGHT }),
    };
}

function tenHourlySamples(): number[] {
    return Array.from({ length: 11 }, (_, i) => T0 + i * HOUR);
}

const horizontal: HorizontalDrawing = {
    kind: "horizontal",
    id: "h1",
    symbol: "BTCUSDT",
    createdAtMs: T0,
    price: "50000",
};

const trend: TrendDrawing = {
    kind: "trend",
    id: "t1",
    symbol: "BTCUSDT",
    createdAtMs: T0,
    fromMs: T0,
    fromPrice: "45000",
    toMs: T0 + 10 * HOUR,
    toPrice: "55000",
};

describe("placing a drawing on screen", () => {
    it("draws a horizontal line edge to edge at one height", () => {
        const points = polylineFor(horizontal, logBridge());

        expect(points).toHaveLength(2);
        expect(points[0].x).toBe(0);
        expect(points[1].x).toBe(WIDTH);
        expect(points[0].y).toBeCloseTo(points[1].y, 10);
    });

    it("puts a sloped line's vertices exactly where the level is", () => {
        const bridge = logBridge();

        const points = polylineFor(trend, bridge);

        expect(points).toHaveLength(11);
        for (const [i, point] of points.entries()) {
            const ms = T0 + i * HOUR;
            expect(point.x).toBeCloseTo(bridge.timeToX(ms)!, 10);
            expect(point.y).toBeCloseTo(bridge.priceToY(levelAt(trend, ms)!)!, 10);
        }
    });

    it("bows away from the straight endpoint-to-endpoint stroke on a log scale", () => {
        // The regression this file exists for. A two-point implementation
        // would put the midpoint on the chord between the endpoints; the
        // level at that time is elsewhere, so an alert drawn that way would
        // fire at a price the trader cannot see under the line.
        const bridge = logBridge();
        const points = polylineFor(trend, bridge);

        const mid = points[5];
        const chordY = (points[0].y + points[10].y) / 2;
        expect(mid.y).not.toBeCloseTo(chordY, 1);

        // And it is the *level* that the vertex agrees with.
        expect(mid.y).toBeCloseTo(bridge.priceToY(new Decimal("50000"))!, 10);
    });

    it("skips sample points the chart cannot place, and keeps the rest", () => {
        const bridge = logBridge();
        const partial: DrawingChartBridge = {
            ...bridge,
            priceToY: (price) => (price.gt(52_000) ? null : bridge.priceToY(price)),
        };

        const points = polylineFor(trend, partial);

        expect(points.length).toBeGreaterThan(0);
        expect(points.length).toBeLessThan(11);
    });

    it("draws nothing for a vertical trend line", () => {
        const vertical: TrendDrawing = { ...trend, toMs: T0 };

        expect(polylineFor(vertical, logBridge())).toEqual([]);
    });

    it("draws nothing when there are no candles to sample", () => {
        expect(polylineFor(trend, logBridge([]))).toEqual([]);
    });
});

describe("pointing at a drawing", () => {
    const points = [
        { x: 0, y: 100 },
        { x: 100, y: 100 },
        { x: 200, y: 200 },
    ];

    it("measures zero on the line", () => {
        expect(distanceToPolyline(points, { x: 50, y: 100 })).toBeCloseTo(0, 10);
    });

    it("measures the perpendicular distance to the nearest segment", () => {
        expect(distanceToPolyline(points, { x: 50, y: 106 })).toBeCloseTo(6, 10);
    });

    it("finds the sloped segment, not just the flat one", () => {
        // On the 45-degree leg, a point 10px directly above the line is
        // 10/sqrt(2) away perpendicular.
        expect(distanceToPolyline(points, { x: 150, y: 140 })).toBeCloseTo(10 / Math.SQRT2, 6);
    });

    it("measures to an endpoint for a point beyond the line's end", () => {
        expect(distanceToPolyline(points, { x: 203, y: 204 })).toBeCloseTo(5, 10);
    });

    it("says nothing for a drawing that is not on screen", () => {
        expect(distanceToPolyline([], { x: 0, y: 0 })).toBeNull();
    });

    it("handles a degenerate single-point polyline", () => {
        expect(distanceToPolyline([{ x: 10, y: 10 }], { x: 13, y: 14 })).toBeCloseTo(5, 10);
    });
});
