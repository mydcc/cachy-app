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
 * FEAT-0480 — selecting, drawing, moving and deleting with the mouse.
 *
 * Framework-agnostic and store-free, for the same two reasons
 * `priceLineManager.ts` is: a service may not import a store
 * (`eslint.architecture.boundaries.js`), and the interaction is worth testing
 * against a fake bridge rather than a mounted chart. Everything it changes, it
 * changes through `DrawingManagerPorts`.
 *
 * ## The chart has to stop panning
 *
 * `lightweight-charts` attaches its own drag handlers to the same container,
 * and `stopPropagation` does not reach a listener on the same element. So a
 * drag explicitly turns `handleScroll`/`handleScale` off for its duration and
 * back on afterwards — including on the Escape path, which is the one that
 * would otherwise leave a chart that cannot be panned at all.
 */

import { Decimal } from "decimal.js";

import { distanceToPolyline, polylineFor, type DrawingChartBridge } from "../../lib/chart/drawings/geometry";
import type { ChartDrawing, DrawingKind } from "../../lib/chart/drawings/types";

/** How near the cursor has to be, in pixels, to grab a line. */
const HIT_TEST_PX = 6;
/** How near an anchor has to be to grab that end rather than the whole line. */
const ANCHOR_GRAB_PX = 8;

export interface DrawingManagerPorts {
    drawingsFor(symbol: string): ChartDrawing[];
    selectedId(): string | null;
    select(id: string | null): void;
    addHorizontal(symbol: string, price: Decimal): void;
    addTrend(
        symbol: string,
        from: { ms: number; price: Decimal },
        to: { ms: number; price: Decimal },
    ): void;
    moveHorizontal(id: string, price: Decimal): void;
    moveTrend(
        id: string,
        anchors: { from?: { ms: number; price: Decimal }; to?: { ms: number; price: Decimal } },
    ): void;
    remove(id: string): void;
    /** Repaint request — the primitive's `update()`. */
    requestRedraw(): void;
    /** Turns the chart's own pan/zoom on and off for the duration of a drag. */
    setChartInteractive(enabled: boolean): void;
}

/** Which end of a trend line a drag is holding, or the whole thing. */
type TrendGrip = "from" | "to" | "whole";

interface DragState {
    drawing: ChartDrawing;
    grip: TrendGrip;
    /** Cursor position when the drag began, for whole-line offsets. */
    originX: number;
    originY: number;
    /** The drawing as it was, so Escape can put it back. */
    original: ChartDrawing;
}

/** A drawing being placed: the first anchor is down, the second follows the cursor. */
interface PendingDraw {
    kind: DrawingKind;
    fromMs: number;
    fromPrice: Decimal;
    cursorMs: number;
    cursorPrice: Decimal;
}

export class DrawingManager {
    private container: HTMLElement | null = null;
    private symbol: string;
    private bridge: DrawingChartBridge | null = null;

    private drag: DragState | null = null;
    private pending: PendingDraw | null = null;
    /** The kind the trader picked from the toolbar; null when just selecting. */
    private armedKind: DrawingKind | null = null;

    private readonly onMouseMove = (e: MouseEvent) => this.handleMouseMove(e);
    private readonly onMouseDown = (e: MouseEvent) => this.handleMouseDown(e);
    private readonly onMouseUp = () => this.handleMouseUp();
    private readonly onKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);

    constructor(
        private readonly ports: DrawingManagerPorts,
        symbol: string,
    ) {
        this.symbol = symbol;
    }

    attach(container: HTMLElement, bridge: DrawingChartBridge): void {
        if (this.container === container) {
            this.bridge = bridge;
            return;
        }
        this.detach();
        this.container = container;
        this.bridge = bridge;
        container.addEventListener("mousemove", this.onMouseMove);
        container.addEventListener("mousedown", this.onMouseDown);
        window.addEventListener("mouseup", this.onMouseUp);
        window.addEventListener("keydown", this.onKeyDown);
    }

    detach(): void {
        if (!this.container) return;
        this.container.removeEventListener("mousemove", this.onMouseMove);
        this.container.removeEventListener("mousedown", this.onMouseDown);
        window.removeEventListener("mouseup", this.onMouseUp);
        window.removeEventListener("keydown", this.onKeyDown);
        this.container.style.cursor = "";
        // A drag or a half-drawn line must not outlive the chart it was
        // started on, and the chart must not be left unpannable.
        this.endDrag(false);
        this.pending = null;
        this.armedKind = null;
        this.container = null;
        this.bridge = null;
    }

    /** The chart switched markets: nothing in flight survives it. */
    setSymbol(symbol: string): void {
        if (symbol === this.symbol) return;
        this.symbol = symbol;
        this.endDrag(false);
        this.pending = null;
        this.ports.select(null);
    }

    /** Arms the toolbar: the next click starts a drawing of this kind. */
    arm(kind: DrawingKind | null): void {
        this.armedKind = kind;
        this.pending = null;
        if (this.container) this.container.style.cursor = kind ? "crosshair" : "";
    }

    isArmed(): boolean {
        return this.armedKind !== null;
    }

    /** The line being placed right now, for the renderer's preview. */
    previewDrawing(): ChartDrawing | null {
        if (!this.pending) return null;
        if (this.pending.kind === "horizontal") return null;
        return {
            kind: "trend",
            id: "__preview__",
            symbol: this.symbol,
            createdAtMs: 0,
            fromMs: this.pending.fromMs,
            fromPrice: this.pending.fromPrice.toString(),
            toMs: this.pending.cursorMs,
            toPrice: this.pending.cursorPrice.toString(),
        };
    }

    private cursor(e: MouseEvent): { x: number; y: number } | null {
        if (!this.container) return null;
        const rect = this.container.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    /** The drawing under the cursor, nearest first, or null. */
    private hitTest(at: { x: number; y: number }): ChartDrawing | null {
        if (!this.bridge) return null;
        let best: ChartDrawing | null = null;
        let bestDistance = HIT_TEST_PX;
        for (const drawing of this.ports.drawingsFor(this.symbol)) {
            const distance = distanceToPolyline(polylineFor(drawing, this.bridge), at);
            if (distance !== null && distance <= bestDistance) {
                best = drawing;
                bestDistance = distance;
            }
        }
        return best;
    }

    /** Which end of a trend line the cursor is on, if any. */
    private gripFor(drawing: ChartDrawing, at: { x: number; y: number }): TrendGrip {
        if (drawing.kind !== "trend" || !this.bridge) return "whole";
        const ends: Array<{ grip: TrendGrip; ms: number; price: string }> = [
            { grip: "from", ms: drawing.fromMs, price: drawing.fromPrice },
            { grip: "to", ms: drawing.toMs, price: drawing.toPrice },
        ];
        for (const end of ends) {
            const x = this.bridge.timeToX(end.ms);
            const y = this.bridge.priceToY(new Decimal(end.price));
            if (x === null || y === null) continue;
            if (Math.hypot(x - at.x, y - at.y) <= ANCHOR_GRAB_PX) return end.grip;
        }
        return "whole";
    }

    private handleMouseDown(e: MouseEvent): void {
        const at = this.cursor(e);
        if (!at || !this.bridge) return;

        if (this.armedKind) {
            this.placeAnchor(at);
            e.preventDefault();
            return;
        }

        const hit = this.hitTest(at);
        this.ports.select(hit?.id ?? null);
        if (!hit) {
            this.ports.requestRedraw();
            return;
        }

        this.drag = {
            drawing: hit,
            grip: this.gripFor(hit, at),
            originX: at.x,
            originY: at.y,
            original: { ...hit },
        };
        this.ports.setChartInteractive(false);
        this.ports.requestRedraw();
        e.preventDefault();
    }

    /** A click while armed: first one starts a line, second one commits it. */
    private placeAnchor(at: { x: number; y: number }): void {
        const ms = this.bridge!.xToTime(at.x);
        const price = this.bridge!.yToPrice(at.y);
        if (ms === null || !price) return;

        if (this.armedKind === "horizontal") {
            this.ports.addHorizontal(this.symbol, price);
            this.arm(null);
            this.ports.requestRedraw();
            return;
        }

        if (!this.pending) {
            this.pending = { kind: "trend", fromMs: ms, fromPrice: price, cursorMs: ms, cursorPrice: price };
            return;
        }

        this.ports.addTrend(
            this.symbol,
            { ms: this.pending.fromMs, price: this.pending.fromPrice },
            { ms, price },
        );
        this.pending = null;
        this.arm(null);
        this.ports.requestRedraw();
    }

    private handleMouseMove(e: MouseEvent): void {
        const at = this.cursor(e);
        if (!at || !this.bridge) return;

        if (this.pending) {
            const ms = this.bridge.xToTime(at.x);
            const price = this.bridge.yToPrice(at.y);
            if (ms !== null && price) {
                this.pending.cursorMs = ms;
                this.pending.cursorPrice = price;
                this.ports.requestRedraw();
            }
            return;
        }

        if (this.drag) {
            this.applyDrag(at);
            return;
        }

        if (!this.armedKind && this.container) {
            const hovered = this.hitTest(at);
            this.container.style.cursor = hovered ? "move" : "";
        }
    }

    private applyDrag(at: { x: number; y: number }): void {
        const drag = this.drag!;
        const bridge = this.bridge!;
        const price = bridge.yToPrice(at.y);
        if (!price) return;

        if (drag.drawing.kind === "horizontal") {
            this.ports.moveHorizontal(drag.drawing.id, price);
            this.ports.requestRedraw();
            return;
        }

        const ms = bridge.xToTime(at.x);
        if (ms === null) return;
        const original = drag.original as typeof drag.drawing & { kind: "trend" };

        if (drag.grip === "from") {
            this.ports.moveTrend(drag.drawing.id, { from: { ms, price } });
        } else if (drag.grip === "to") {
            this.ports.moveTrend(drag.drawing.id, { to: { ms, price } });
        } else {
            // Whole-line drag: both anchors move by the cursor's offset,
            // measured from where the drag started. Offsetting each anchor
            // from its *original* position rather than its current one keeps
            // the line rigid — accumulating per-move deltas would let rounding
            // stretch it over a long drag.
            const originMs = bridge.xToTime(drag.originX);
            const originPrice = bridge.yToPrice(drag.originY);
            if (originMs === null || !originPrice) return;
            const deltaMs = ms - originMs;
            const deltaPrice = price.minus(originPrice);
            this.ports.moveTrend(drag.drawing.id, {
                from: {
                    ms: original.fromMs + deltaMs,
                    price: new Decimal(original.fromPrice).plus(deltaPrice),
                },
                to: {
                    ms: original.toMs + deltaMs,
                    price: new Decimal(original.toPrice).plus(deltaPrice),
                },
            });
        }
        this.ports.requestRedraw();
    }

    private handleMouseUp(): void {
        this.endDrag(true);
    }

    /** Ends a drag, optionally keeping the result. Always restores chart panning. */
    private endDrag(keep: boolean): void {
        if (!this.drag) return;
        const { original, drawing } = this.drag;
        this.drag = null;
        this.ports.setChartInteractive(true);

        if (!keep) this.restore(drawing.id, original);
        this.ports.requestRedraw();
    }

    private restore(id: string, original: ChartDrawing): void {
        if (original.kind === "horizontal") {
            this.ports.moveHorizontal(id, new Decimal(original.price));
            return;
        }
        this.ports.moveTrend(id, {
            from: { ms: original.fromMs, price: new Decimal(original.fromPrice) },
            to: { ms: original.toMs, price: new Decimal(original.toPrice) },
        });
    }

    private handleKeyDown(e: KeyboardEvent): void {
        if (e.key === "Escape") {
            if (this.drag) {
                this.endDrag(false);
                return;
            }
            if (this.pending || this.armedKind) {
                this.pending = null;
                this.arm(null);
                this.ports.requestRedraw();
            }
            return;
        }

        if (e.key !== "Delete" && e.key !== "Backspace") return;
        // Only when the chart owns the keyboard: Backspace inside an input is
        // a character deletion, and stealing it would eat a symbol search.
        const target = e.target as HTMLElement | null;
        if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
        if (target?.isContentEditable) return;

        const selected = this.ports.selectedId();
        if (!selected) return;
        this.ports.remove(selected);
        this.ports.requestRedraw();
        e.preventDefault();
    }
}
