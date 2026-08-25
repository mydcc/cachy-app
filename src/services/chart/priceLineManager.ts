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

/*
 * FEAT-0247 — position and TP/SL price lines on the candlestick chart.
 *
 * Lightweight Charts v5 has no built-in draggable price line, so dragging is
 * built by hand on top of `createPriceLine` + `priceToCoordinate` /
 * `coordinateToPrice`: hit-test the mouse against each draggable line's
 * current on-screen Y, and while a drag is active, feed every mousemove
 * straight back into the same conversion to keep the line under the cursor.
 *
 * Kept framework-agnostic (no Svelte imports) and decimal.js-only for money
 * math, so it is unit-testable against a fake series/container and reusable
 * outside this one component.
 */

import { Decimal } from "decimal.js";

import { roundToTick } from "../../lib/calculators/tpsl";

/** The subset of `ISeriesApi<"Candlestick">` this manager actually needs. */
export interface PriceLineHostSeries {
    createPriceLine(options: {
        id?: string;
        price: number;
        color: string;
        lineWidth?: 1 | 2 | 3 | 4;
        lineStyle?: number;
        axisLabelVisible?: boolean;
        title: string;
    }): PriceLineHandle;
    removePriceLine(line: PriceLineHandle): void;
    priceToCoordinate(price: number): number | null;
    coordinateToPrice(coordinate: number): number | null;
}

export interface PriceLineHandle {
    applyOptions(options: { price?: number; title?: string }): void;
    options(): { price: number; title: string };
}

export type TpSlKind = "takeProfit" | "stopLoss";

export interface TpSlLineInput {
    /** The resting order's id — required to submit a modification on drop. */
    orderId: string;
    triggerPrice: Decimal;
}

export interface PositionLinesInput {
    side: "long" | "short";
    entryPrice: Decimal;
    liquidationPrice: Decimal;
    /** Entry price adjusted for fees — the price at which the position nets zero PnL. */
    breakEvenPrice: Decimal;
    /** Position size, for the on-line PnL projection. */
    size: Decimal;
}

/** A still-resting (unfilled) limit order for the chart's symbol — shown even without an open position. */
export interface PendingOrderLineInput {
    orderId: string;
    price: Decimal;
    side: "buy" | "sell";
    /**
     * "entry" (default) renders "Buy/Sell Limit: <price>" in the neutral
     * pending-order color. "takeProfit"/"stopLoss" render a TP/SL bracket
     * attached to that same resting entry order (Bitunix supports setting
     * tpPrice/slPrice at order placement, before it fills into a position),
     * using the matching TP/SL color so it reads the same as a filled
     * position's TP/SL line.
     */
    kind?: "entry" | "takeProfit" | "stopLoss";
}

export interface PriceLineUpdateInput {
    position: PositionLinesInput | null;
    takeProfit: TpSlLineInput | null;
    stopLoss: TpSlLineInput | null;
    /** Resting limit orders not yet filled into a position — read-only, no drag/drop. */
    pendingOrders?: PendingOrderLineInput[];
    /** Smallest price increment for this symbol; drags snap to it. */
    tickSize: Decimal;
    /** `supports.tpSl === false` on the active exchange — lines are shown but not draggable. */
    readOnly: boolean;
    /** Theme-aware colors from the host (CandleChartView). If omitted, uses fallback hex values. */
    colors?: {
        entry: string;
        liquidation: string;
        breakEven: string;
        takeProfit: string;
        stopLoss: string;
        pendingOrder: string;
    };
}

export interface PriceLineManagerCallbacks {
    /** Fired once when a drag on a TP/SL line begins. */
    onDragStart?: (kind: TpSlKind) => void;
    /** Fired on every mousemove while dragging, with the snapped price. */
    onDragMove?: (kind: TpSlKind, price: Decimal) => void;
    /** Fired on mouseup with the final snapped price — submit the order modification here. */
    onDrop?: (kind: TpSlKind, orderId: string, price: Decimal) => void;
    /** Fired when Escape cancels a drag; the line has already been restored. */
    onDragCancel?: (kind: TpSlKind) => void;
}

const COLORS = {
    entry: "#787b86",
    liquidation: "#ef5350",
    breakEven: "#ffb300",
    takeProfit: "#26a69a",
    stopLoss: "#ef5350",
    pendingOrder: "#787b86",
} as const;

const LINE_STYLE_DASHED = 2;
const HIT_TEST_PX = 6;

/**
 * Snap to the exchange's tick grid via the canonical `roundToTick` helper
 * (decimal-exact, explicit ROUND_HALF_UP) so chart drags round exactly like
 * every other order-price mutation in the app. `roundToTick` also guards a
 * zero/negative tick by returning the price untouched.
 */
function snap(price: Decimal, tickSize: Decimal): Decimal {
    return roundToTick(price, tickSize);
}

/**
 * Signed fixed-decimal label that refuses to collapse a non-zero magnitude
 * into "+0.00": when the minimum precision would round the value away, the
 * precision is extended step by step (up to maxDp) until digits show.
 * Normal magnitudes keep exactly minDp decimals, so existing labels like
 * "+20.00%" are unchanged.
 */
function formatSigned(value: Decimal, minDp = 2, maxDp = 8): string {
    // The sign is applied explicitly because the magnitude is formatted
    // through abs(): negatives need their own "-", everything else "+".
    const sign = value.isNegative() ? "-" : "+";
    const abs = value.abs();
    let dp = minDp;
    while (
        dp < maxDp &&
        abs.toDecimalPlaces(dp, Decimal.ROUND_HALF_UP).isZero()
    ) {
        dp++;
    }
    return `${sign}${abs.toDecimalPlaces(dp, Decimal.ROUND_HALF_UP).toFixed(dp)}`;
}

/** `+pct% / +$pnl` — the sign always shows, so a loss reads unambiguously. */
function formatDistance(from: Decimal, to: Decimal, side: "long" | "short", size: Decimal): string {
    if (from.isZero()) return "";
    const pct = to.minus(from).dividedBy(from).times(100);
    const directional = side === "long" ? to.minus(from) : from.minus(to);
    const pnl = directional.times(size);
    return `${formatSigned(pct)}% / ${formatSigned(pnl)}`;
}

/**
 * Owns the lifecycle of one symbol's position/TP/SL price lines on a chart
 * series, plus the mouse-driven drag interaction for the TP/SL lines.
 *
 * One instance per chart. Call `update()` whenever the position or TP/SL
 * plans change, `attach()` once the chart's DOM container exists, and
 * `destroy()` on chart teardown.
 */
export class PriceLineManager {
    private series: PriceLineHostSeries;
    private callbacks: PriceLineManagerCallbacks;

    private entryLine: PriceLineHandle | null = null;
    private liquidationLine: PriceLineHandle | null = null;
    private breakEvenLine: PriceLineHandle | null = null;
    private takeProfitLine: PriceLineHandle | null = null;
    private stopLossLine: PriceLineHandle | null = null;
    /** Keyed by orderId — unlike the singleton lines above, there can be several resting limit orders at once. */
    private pendingOrderLines = new Map<string, PriceLineHandle>();

    private lastInput: PriceLineUpdateInput | null = null;

    private container: HTMLElement | null = null;
    private drag: {
        kind: TpSlKind;
        orderId: string;
        originalPrice: Decimal;
        /**
         * The exact decimal-exact snapped price of the last accepted drag
         * move. Kept in Decimal form so the drop callback never has to
         * re-read the float64 back out of the line options (which would
         * reintroduce a Decimal -> Number -> Decimal round trip).
         */
        snappedPrice: Decimal;
        line: PriceLineHandle;
    } | null = null;
    private hoveredKind: TpSlKind | null = null;

    private readonly handleMouseMove = (e: MouseEvent) => this.onMouseMove(e);
    private readonly handleMouseDown = (e: MouseEvent) => this.onMouseDown(e);
    private readonly handleMouseUp = () => this.onMouseUp();
    private readonly handleKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);

    constructor(series: PriceLineHostSeries, callbacks: PriceLineManagerCallbacks = {}) {
        this.series = series;
        this.callbacks = callbacks;
    }

    /** Wires mouse/keyboard listeners to the chart's DOM container. Idempotent. */
    public attach(container: HTMLElement): void {
        if (this.container === container) return;
        this.detach();
        this.container = container;
        container.addEventListener("mousemove", this.handleMouseMove);
        container.addEventListener("mousedown", this.handleMouseDown);
        window.addEventListener("mouseup", this.handleMouseUp);
        window.addEventListener("keydown", this.handleKeyDown);
    }

    public detach(): void {
        if (!this.container) return;
        this.container.removeEventListener("mousemove", this.handleMouseMove);
        this.container.removeEventListener("mousedown", this.handleMouseDown);
        window.removeEventListener("mouseup", this.handleMouseUp);
        window.removeEventListener("keydown", this.handleKeyDown);
        this.container.style.cursor = "";
        this.container = null;
    }

    /** Creates, moves, or removes each line to match `input`. Safe to call on every render. */
    public update(input: PriceLineUpdateInput): void {
        // A drag in progress owns the dragged line's price until drop/cancel —
        // an incoming store update (e.g. a WS push) must not yank it out from
        // under the user's cursor.
        this.lastInput = input;

        const colors = input.colors ?? COLORS;

        this.syncLine(
            "entryLine",
            input.position ? { price: input.position.entryPrice, title: "Entry" } : null,
            colors.entry,
        );
        this.syncLine(
            "liquidationLine",
            input.position ? { price: input.position.liquidationPrice, title: "Liq." } : null,
            colors.liquidation,
        );
        this.syncLine(
            "breakEvenLine",
            input.position ? { price: input.position.breakEvenPrice, title: "B/E" } : null,
            colors.breakEven,
        );

        const tpTitle =
            input.position && input.takeProfit
                ? `TP: ${input.takeProfit.triggerPrice.toFixed()} (${formatDistance(input.position.entryPrice, input.takeProfit.triggerPrice, input.position.side, input.position.size)})`
                : "TP";
        if (this.drag?.kind !== "takeProfit") {
            this.syncLine(
                "takeProfitLine",
                input.takeProfit ? { price: input.takeProfit.triggerPrice, title: tpTitle } : null,
                colors.takeProfit,
            );
        }

        const slTitle =
            input.position && input.stopLoss
                ? `SL: ${input.stopLoss.triggerPrice.toFixed()} (${formatDistance(input.position.entryPrice, input.stopLoss.triggerPrice, input.position.side, input.position.size)})`
                : "SL";
        if (this.drag?.kind !== "stopLoss") {
            this.syncLine(
                "stopLossLine",
                input.stopLoss ? { price: input.stopLoss.triggerPrice, title: slTitle } : null,
                colors.stopLoss,
            );
        }

        this.syncPendingOrders(input.pendingOrders ?? [], colors);
    }

    /** Diffs the resting-order set against the previous render: creates new lines, updates moved ones, removes filled/cancelled ones. */
    private syncPendingOrders(
        orders: PendingOrderLineInput[],
        colors: { takeProfit: string; stopLoss: string; pendingOrder: string },
    ): void {
        const seen = new Set<string>();
        for (const order of orders) {
            seen.add(order.orderId);
            const kind = order.kind ?? "entry";
            const title =
                kind === "takeProfit"
                    ? `TP: ${order.price.toFixed()}`
                    : kind === "stopLoss"
                      ? `SL: ${order.price.toFixed()}`
                      : `${order.side === "buy" ? "Buy" : "Sell"} Limit: ${order.price.toFixed()}`;
            const color =
                kind === "takeProfit" ? colors.takeProfit : kind === "stopLoss" ? colors.stopLoss : colors.pendingOrder;
            const priceNum = order.price.toNumber();
            const existing = this.pendingOrderLines.get(order.orderId);
            if (existing) {
                existing.applyOptions({ price: priceNum, title });
            } else {
                this.pendingOrderLines.set(
                    order.orderId,
                    this.series.createPriceLine({
                        price: priceNum,
                        color,
                        lineWidth: 1,
                        lineStyle: LINE_STYLE_DASHED,
                        axisLabelVisible: true,
                        title,
                    }),
                );
            }
        }
        for (const [orderId, line] of this.pendingOrderLines) {
            if (!seen.has(orderId)) {
                this.series.removePriceLine(line);
                this.pendingOrderLines.delete(orderId);
            }
        }
    }

    public destroy(): void {
        this.detach();
        this.syncLine("entryLine", null, COLORS.entry);
        this.syncLine("liquidationLine", null, COLORS.liquidation);
        this.syncLine("breakEvenLine", null, COLORS.breakEven);
        this.syncLine("takeProfitLine", null, COLORS.takeProfit);
        this.syncLine("stopLossLine", null, COLORS.stopLoss);
        this.syncPendingOrders([], COLORS);
        this.lastInput = null;
    }

    private syncLine(
        field: "entryLine" | "liquidationLine" | "breakEvenLine" | "takeProfitLine" | "stopLossLine",
        target: { price: Decimal; title: string } | null,
        color: string,
    ): void {
        const existing = this[field];
        if (!target) {
            if (existing) {
                this.series.removePriceLine(existing);
                this[field] = null;
            }
            return;
        }
        const priceNum = target.price.toNumber();
        if (!existing) {
            this[field] = this.series.createPriceLine({
                price: priceNum,
                color,
                lineWidth: 2,
                lineStyle:
                    field === "entryLine" || field === "liquidationLine" || field === "breakEvenLine"
                        ? LINE_STYLE_DASHED
                        : 0,
                axisLabelVisible: true,
                title: target.title,
            });
            return;
        }
        existing.applyOptions({ price: priceNum, title: target.title });
    }

    private draggableLineFor(kind: TpSlKind): PriceLineHandle | null {
        return kind === "takeProfit" ? this.takeProfitLine : this.stopLossLine;
    }

    /** Y-distance in px from the mouse to a line's current on-screen position, or null if the line isn't rendered. */
    private distanceToLine(kind: TpSlKind, mouseY: number): number | null {
        const line = this.draggableLineFor(kind);
        if (!line) return null;
        const y = this.series.priceToCoordinate(line.options().price);
        if (y === null) return null;
        return Math.abs(y - mouseY);
    }

    private nearestDraggableLine(mouseY: number): TpSlKind | null {
        if (!this.lastInput || this.lastInput.readOnly) return null;
        const candidates: TpSlKind[] = ["takeProfit", "stopLoss"];
        let best: TpSlKind | null = null;
        let bestDist = HIT_TEST_PX;
        for (const kind of candidates) {
            const d = this.distanceToLine(kind, mouseY);
            if (d !== null && d <= bestDist) {
                best = kind;
                bestDist = d;
            }
        }
        return best;
    }

    private relativeY(e: MouseEvent): number {
        const rect = this.container!.getBoundingClientRect();
        return e.clientY - rect.top;
    }

    private onMouseDown(e: MouseEvent): void {
        if (!this.container || !this.lastInput) return;
        const y = this.relativeY(e);
        const kind = this.nearestDraggableLine(y);
        if (!kind) return;

        const input = this.lastInput;
        const plan = kind === "takeProfit" ? input.takeProfit : input.stopLoss;
        const line = this.draggableLineFor(kind);
        if (!plan || !line) return;

        this.drag = {
            kind,
            orderId: plan.orderId,
            originalPrice: plan.triggerPrice,
            snappedPrice: plan.triggerPrice,
            line,
        };
        this.callbacks.onDragStart?.(kind);
        e.preventDefault();
    }

    private onMouseMove(e: MouseEvent): void {
        if (!this.container) return;
        const y = this.relativeY(e);

        if (this.drag) {
            const rawPrice = this.series.coordinateToPrice(y);
            if (rawPrice === null) return;
            const snapped = snap(
                new Decimal(rawPrice),
                this.lastInput?.tickSize ?? new Decimal(0),
            );
            // A coarse or wrong tick fallback can snap tiny prices onto 0 —
            // an order modification with trigger price 0 would be rejected
            // by the exchange. Ignore the move and keep the last valid
            // snapped price instead of letting the line collapse onto 0.
            // Strictly greater than zero on purpose: Decimal#isPositive()
            // only inspects the sign bit, so it returns true for 0.
            if (!snapped.gt(0)) return;
            this.drag.snappedPrice = snapped;
            this.drag.line.applyOptions({ price: snapped.toNumber() });
            this.callbacks.onDragMove?.(this.drag.kind, snapped);
            return;
        }

        const hovered = this.nearestDraggableLine(y);
        if (hovered !== this.hoveredKind) {
            this.hoveredKind = hovered;
            this.container.style.cursor = hovered ? "ns-resize" : "";
        }
    }

    private onMouseUp(): void {
        if (!this.drag) return;
        // Use the exact Decimal we snapped to instead of re-reading the
        // float64 back out of the line options — a Decimal -> Number ->
        // Decimal round trip is the BUG-0184 pattern and can pick up binary
        // representation noise for prices beyond ~15 significant digits.
        const { kind, orderId, snappedPrice } = this.drag;
        this.drag = null;
        this.callbacks.onDrop?.(kind, orderId, snappedPrice);
    }

    private onKeyDown(e: KeyboardEvent): void {
        if (e.key !== "Escape" || !this.drag) return;
        const { kind, line, originalPrice } = this.drag;
        line.applyOptions({ price: originalPrice.toNumber() });
        this.drag = null;
        this.callbacks.onDragCancel?.(kind);
    }
}
