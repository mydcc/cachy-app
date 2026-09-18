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
 * FEAT-0480 — painting drawings onto the candle series.
 *
 * ## Why a primitive rather than a second canvas
 *
 * `lightweight-charts` 5 exposes `attachPrimitive`, which hands a renderer the
 * chart's own coordinate space at the chart's own redraw time. An overlay
 * canvas positioned on top would have to re-derive both: it would need to know
 * when the chart panned, and it would have to convert prices to pixels itself
 * — the scale maths this feature is explicitly not allowed to duplicate.
 * Attaching makes pan, zoom, scale mode and resize free and exact.
 *
 * FEAT-0247's price lines do not go through this: `createPriceLine` already
 * gives a horizontal line with an axis label, and reimplementing it here would
 * be the second dialect. This primitive owns what `createPriceLine` cannot
 * express — anything with a slope.
 */

import { Decimal } from "decimal.js";
import type {
    IPrimitivePaneRenderer,
    IPrimitivePaneView,
    ISeriesPrimitive,
    SeriesAttachedParameter,
    Time,
} from "lightweight-charts";

import { polylineFor, type DrawingChartBridge } from "../../lib/chart/drawings/geometry";
import type { ChartDrawing } from "../../lib/chart/drawings/types";

/** Everything the renderer reads, so it owns no state of its own. */
export interface DrawingRenderSource {
    /** The drawings for the chart's current symbol. */
    drawings(): ChartDrawing[];
    selectedId(): string | null;
    /** Null before the chart has attached. */
    bridge(): DrawingChartBridge | null;
    colors(): { line: string; selected: string };
    /** A line being drawn right now, not yet committed to the store. */
    preview(): ChartDrawing | null;
}

const LINE_WIDTH = 1.5;
const SELECTED_LINE_WIDTH = 2.5;
/** Radius of the grab handles shown on the selected drawing's anchors. */
const HANDLE_RADIUS = 4;

class DrawingPaneRenderer implements IPrimitivePaneRenderer {
    constructor(private readonly source: DrawingRenderSource) {}

    draw(target: {
        useMediaCoordinateSpace(
            fn: (scope: { context: CanvasRenderingContext2D }) => void,
        ): void;
    }): void {
        const bridge = this.source.bridge();
        if (!bridge) return;

        const colors = this.source.colors();
        const selectedId = this.source.selectedId();
        const preview = this.source.preview();
        const all = preview ? [...this.source.drawings(), preview] : this.source.drawings();

        target.useMediaCoordinateSpace(({ context }) => {
            for (const drawing of all) {
                const points = polylineFor(drawing, bridge);
                if (points.length < 2) continue;

                const isSelected = drawing.id === selectedId;
                context.save();
                context.strokeStyle = isSelected ? colors.selected : colors.line;
                context.lineWidth = isSelected ? SELECTED_LINE_WIDTH : LINE_WIDTH;
                context.beginPath();
                context.moveTo(points[0].x, points[0].y);
                for (const point of points.slice(1)) context.lineTo(point.x, point.y);
                context.stroke();

                if (isSelected) this.drawHandles(context, drawing, bridge, colors.selected);
                context.restore();
            }
        });
    }

    /**
     * Grab handles on the anchors of the selected drawing.
     *
     * Only the ends a trader can move get one — a horizontal line's level is
     * the whole drawing, so it has no separate anchor to pull.
     */
    private drawHandles(
        context: CanvasRenderingContext2D,
        drawing: ChartDrawing,
        bridge: DrawingChartBridge,
        color: string,
    ): void {
        if (drawing.kind !== "trend") return;

        const anchors = [
            { ms: drawing.fromMs, price: drawing.fromPrice },
            { ms: drawing.toMs, price: drawing.toPrice },
        ];
        context.fillStyle = color;
        for (const anchor of anchors) {
            const x = bridge.timeToX(anchor.ms);
            const y = bridge.priceToY(new Decimal(anchor.price));
            if (x === null || y === null) continue;
            context.beginPath();
            context.arc(x, y, HANDLE_RADIUS, 0, Math.PI * 2);
            context.fill();
        }
    }
}

class DrawingPaneView implements IPrimitivePaneView {
    private readonly renderer: DrawingPaneRenderer;

    constructor(source: DrawingRenderSource) {
        this.renderer = new DrawingPaneRenderer(source);
    }

    renderer(): IPrimitivePaneRenderer {
        return this.renderer;
    }
}

/**
 * The primitive itself. One per chart; `update()` is how the host tells it
 * something changed.
 */
export class DrawingPrimitive implements ISeriesPrimitive<Time> {
    private readonly paneView: DrawingPaneView;
    private params: SeriesAttachedParameter<Time> | null = null;

    constructor(source: DrawingRenderSource) {
        this.paneView = new DrawingPaneView(source);
    }

    attached(params: SeriesAttachedParameter<Time>): void {
        this.params = params;
    }

    detached(): void {
        this.params = null;
    }

    paneViews(): readonly IPrimitivePaneView[] {
        return [this.paneView];
    }

    /** Ask the chart to repaint. Safe before `attached` and after `detached`. */
    update(): void {
        this.params?.requestUpdate();
    }
}
