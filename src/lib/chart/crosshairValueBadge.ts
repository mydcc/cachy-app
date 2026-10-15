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
 * A value badge floating directly above an indicator line at the crosshair.
 *
 * The chart library's own crosshair markers show a dot on the line but no
 * value; the axis labels live on the far right, away from the eye. This
 * primitive paints a small pill with the hovered value above the dot, in
 * the pane of the line series it is attached to — pan, zoom and resize
 * come free because coordinates are resolved at draw time, never stored.
 *
 * Colours arrive through the source on every draw, so a theme switch
 * re-themes open badges without re-attaching anything.
 */

import type {
    IChartApiBase,
    IPrimitivePaneRenderer,
    IPrimitivePaneView,
    ISeriesApi,
    ISeriesPrimitive,
    SeriesAttachedParameter,
    Time,
} from "lightweight-charts";

export interface BadgePoint {
    time: Time;
    value: number;
}

export interface BadgeColors {
    /** Pill fill — a solid panel tone, readable in every theme. */
    bg: string;
    /** Pill text. */
    text: string;
    /** Pill outline — the line's own colour, so badges stay assignable. */
    border: string;
}

/** Everything the renderer reads; the host owns the data. */
export interface CrosshairBadgeSource {
    /** Hovered time, null when the pointer left the chart. */
    hoveredTime(): Time | null;
    /** Current entries of the line, ascending by time. */
    entries(): readonly BadgePoint[];
    colors(): BadgeColors;
}

const FONT_SIZE = 11;
const FONT_FAMILY = "Inter, sans-serif";
const PAD_X = 6;
const PAD_Y = 3;
const GAP_ABOVE_DOT = 8;
const PILL_RADIUS = 4;

/**
 * Display formatting for a hovered indicator value. Plain f64 rendering
 * (ADR-0021): the value is only painted, never computed on.
 */
export function formatBadgeValue(value: number): string {
    if (!Number.isFinite(value)) return "";
    const abs = Math.abs(value);
    if (abs !== 0 && abs < 0.1) return value.toFixed(4);
    if (abs < 1000) return value.toFixed(2);
    return value.toFixed(0);
}

export interface BadgeRect {
    x: number;
    y: number;
    w: number;
    h: number;
    /** True when there was no room above the dot and the pill dropped below. */
    below: boolean;
}

/**
 * Pill geometry for a label of measured `textWidth`, centred on `x`,
 * preferring above the dot and clamping into the pane. Pure, so tests pin
 * the edge behaviour without a canvas.
 */
export function badgeRect(
    x: number,
    y: number,
    textWidth: number,
    paneWidth: number,
    paneHeight: number,
): BadgeRect {
    const w = textWidth + PAD_X * 2;
    const h = FONT_SIZE + PAD_Y * 2;
    const clampedX = Math.min(Math.max(x - w / 2, 0), Math.max(paneWidth - w, 0));
    let pillY = y - GAP_ABOVE_DOT - h;
    let below = false;
    if (pillY < 0) {
        pillY = y + GAP_ABOVE_DOT;
        below = true;
    }
    return { x: clampedX, y: Math.min(pillY, Math.max(paneHeight - h, 0)), w, h, below };
}

/** Nearest entry to a hovered time; the crosshair rarely lands exactly on a bar. */
export function nearestEntry(
    entries: readonly BadgePoint[],
    time: Time,
): BadgePoint | null {
    if (entries.length === 0) return null;
    const t = typeof time === "number" ? time : Number(time);
    if (Number.isNaN(t)) return null;
    let best = entries[0];
    let bestDist = Math.abs((typeof best.time === "number" ? best.time : Number(best.time)) - t);
    for (let i = 1; i < entries.length; i++) {
        const entryTime = entries[i].time;
        const dist = Math.abs((typeof entryTime === "number" ? entryTime : Number(entryTime)) - t);
        if (dist < bestDist) {
            bestDist = dist;
            best = entries[i];
        }
    }
    return best;
}

class CrosshairBadgeRenderer implements IPrimitivePaneRenderer {
    constructor(
        private readonly source: CrosshairBadgeSource,
        private readonly chart: () => IChartApiBase<Time> | null,
        private readonly series: () => ISeriesApi<"Line"> | null,
    ) {}

    draw(target: {
        useMediaCoordinateSpace(
            fn: (scope: {
                context: CanvasRenderingContext2D;
                mediaSize: { width: number; height: number };
            }) => void,
        ): void;
    }): void {
        const time = this.source.hoveredTime();
        if (time === null) return;
        const entry = nearestEntry(this.source.entries(), time);
        if (!entry || !Number.isFinite(entry.value)) return;
        const chart = this.chart();
        const series = this.series();
        if (!chart || !series) return;

        const x = chart.timeScale().timeToCoordinate(entry.time);
        const y = series.priceToCoordinate(entry.value);
        if (x === null || y === null) return;

        const text = formatBadgeValue(entry.value);
        if (!text) return;
        const colors = this.source.colors();

        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
            context.save();
            context.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
            const rect = badgeRect(
                x,
                y,
                context.measureText(text).width,
                mediaSize.width,
                mediaSize.height,
            );
            context.beginPath();
            context.roundRect(rect.x, rect.y, rect.w, rect.h, PILL_RADIUS);
            context.fillStyle = colors.bg;
            context.fill();
            context.lineWidth = 1;
            context.strokeStyle = colors.border;
            context.stroke();
            context.fillStyle = colors.text;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2 + 0.5);
            context.restore();
        });
    }
}

class CrosshairBadgeView implements IPrimitivePaneView {
    private readonly paneRenderer: CrosshairBadgeRenderer;

    constructor(
        source: CrosshairBadgeSource,
        chart: () => IChartApiBase<Time> | null,
        series: () => ISeriesApi<"Line"> | null,
    ) {
        this.paneRenderer = new CrosshairBadgeRenderer(source, chart, series);
    }

    renderer(): IPrimitivePaneRenderer {
        return this.paneRenderer;
    }
}

/**
 * One badge per indicator line series. The host drives it: set the hovered
 * time on crosshair moves and call `update()` to repaint.
 */
export class CrosshairValueBadge implements ISeriesPrimitive<Time> {
    private readonly paneView: CrosshairBadgeView;
    // Stable reference: the typings ask views to keep identity when nothing
    // changed, so a fresh array literal per call would defeat their cache.
    private readonly views: readonly IPrimitivePaneView[];
    private params: SeriesAttachedParameter<Time> | null = null;

    constructor(source: CrosshairBadgeSource) {
        this.paneView = new CrosshairBadgeView(
            source,
            () => this.params?.chart ?? null,
            () => this.lineSeries(),
        );
        this.views = [this.paneView];
    }

    /**
     * The attached series, narrowed to the line series this badge draws on.
     *
     * `SeriesAttachedParameter` types `series` as `ISeriesApi<keyof
     * SeriesOptionsMap>` — every series kind at once — while the renderer
     * only needs `priceToCoordinate`, which the narrower `ISeriesApi<"Line">`
     * carries. The invariant holds by construction: the only attachment site
     * is `IndicatorLessonChart`, on a series created with `LineSeries`, and
     * nothing but that component constructs this class.
     */
    private lineSeries(): ISeriesApi<"Line"> | null {
        const series = this.params?.series;
        return series ? (series as ISeriesApi<"Line">) : null;
    }

    attached(params: SeriesAttachedParameter<Time>): void {
        this.params = params;
    }

    detached(): void {
        this.params = null;
    }

    paneViews(): readonly IPrimitivePaneView[] {
        return this.views;
    }

    /** Ask the chart to repaint. Safe before `attached` and after `detached`. */
    update(): void {
        this.params?.requestUpdate();
    }
}
