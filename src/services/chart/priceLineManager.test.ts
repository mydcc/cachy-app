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

// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "decimal.js";
import {
    PriceLineManager,
    type PriceLineHandle,
    type PriceLineHostSeries,
} from "./priceLineManager";

/**
 * A fake series that mirrors just enough of `ISeriesApi<"Candlestick">` for
 * the manager: creates real handle objects (so `applyOptions`/`options()`
 * round-trip), and maps between price and Y with a trivial 1-price-per-px
 * scale so tests can pick coordinates without a real chart.
 */
function makeFakeSeries() {
    const lines = new Map<PriceLineHandle, { price: number; title: string }>();

    const series: PriceLineHostSeries = {
        createPriceLine(options) {
            const state = { price: options.price, title: options.title };
            const handle: PriceLineHandle = {
                applyOptions(next) {
                    if (next.price !== undefined) state.price = next.price;
                    if (next.title !== undefined) state.title = next.title;
                },
                options: () => ({ ...state }),
            };
            lines.set(handle, state);
            return handle;
        },
        removePriceLine(line) {
            lines.delete(line);
        },
        // price === Y: line at price 100 sits at coordinate 100.
        priceToCoordinate: (price) => price,
        coordinateToPrice: (coordinate) => coordinate,
    };

    return { series, lines };
}

function baseInput(overrides: Partial<Parameters<PriceLineManager["update"]>[0]> = {}) {
    return {
        position: {
            side: "long" as const,
            entryPrice: new Decimal(100),
            liquidationPrice: new Decimal(80),
            breakEvenPrice: new Decimal(101),
            size: new Decimal(1),
        },
        takeProfit: { orderId: "tp-1", triggerPrice: new Decimal(120) },
        stopLoss: { orderId: "sl-1", triggerPrice: new Decimal(90) },
        tickSize: new Decimal(1),
        readOnly: false,
        colors: {
            entry: "#787b86",
            liquidation: "#ef5350",
            breakEven: "#ffb300",
            takeProfit: "#26a69a",
            stopLoss: "#ef5350",
            pendingOrder: "#787b86",
        },
        ...overrides,
    };
}

function mouseEvent(type: string, clientY: number): MouseEvent {
    return new MouseEvent(type, { clientY, bubbles: true, cancelable: true });
}

describe("PriceLineManager — rendering", () => {
    it("creates Entry, Liquidation, TP and SL lines at their given prices", () => {
        const { series, lines } = makeFakeSeries();
        const manager = new PriceLineManager(series);

        manager.update(baseInput());

        const prices = [...lines.values()].map((l) => l.price).sort((a, b) => a - b);
        expect(prices).toEqual([80, 90, 100, 101, 120]);
    });

    it("renders a Break-Even line at position.breakEvenPrice", () => {
        const { series, lines } = makeFakeSeries();
        const manager = new PriceLineManager(series);

        manager.update(baseInput());

        const beLine = [...lines.values()].find((l) => l.title === "B/E");
        expect(beLine?.price).toBe(101);
    });

    it("puts price, percentage distance and projected PnL in the TP/SL titles", () => {
        const { series, lines } = makeFakeSeries();
        const manager = new PriceLineManager(series);

        manager.update(baseInput());

        const titles = [...lines.values()].map((l) => l.title);
        // +20 from a 100 entry, long, size 1 → +20.00% / +20.00
        expect(titles.some((t) => t.includes("TP") && t.includes("+20.00%") && t.includes("+20.00"))).toBe(true);
        // -10 from a 100 entry, long, size 1 → -10.00% / -10.00
        expect(titles.some((t) => t.includes("SL") && t.includes("-10.00%") && t.includes("-10.00"))).toBe(true);
    });

    it("removes a line when its plan disappears", () => {
        const { series, lines } = makeFakeSeries();
        const manager = new PriceLineManager(series);

        manager.update(baseInput());
        expect(lines.size).toBe(5);

        manager.update(baseInput({ takeProfit: null }));
        expect(lines.size).toBe(4);
    });

    it("clears every line on destroy", () => {
        const { series, lines } = makeFakeSeries();
        const manager = new PriceLineManager(series);

        manager.update(baseInput());
        manager.destroy();

        expect(lines.size).toBe(0);
    });
});

describe("PriceLineManager — hover and drag", () => {
    let container: HTMLDivElement;

    beforeEach(() => {
        container = document.createElement("div");
        vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
            top: 0,
            left: 0,
            bottom: 300,
            right: 300,
            width: 300,
            height: 300,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect);
    });

    it("shows a resize cursor when the mouse is within range of a draggable line", () => {
        const { series } = makeFakeSeries();
        const manager = new PriceLineManager(series);
        manager.attach(container);
        manager.update(baseInput());

        // SL line sits at price/coordinate 90.
        container.dispatchEvent(mouseEvent("mousemove", 90));
        expect(container.style.cursor).toBe("ns-resize");

        container.dispatchEvent(mouseEvent("mousemove", 200));
        expect(container.style.cursor).toBe("");
    });

    it("does not offer a drag cursor when the exchange doesn't support TP/SL edits", () => {
        const { series } = makeFakeSeries();
        const manager = new PriceLineManager(series);
        manager.attach(container);
        manager.update(baseInput({ readOnly: true }));

        container.dispatchEvent(mouseEvent("mousemove", 90));
        expect(container.style.cursor).toBe("");
    });

    it("drags the SL line, snapping to tick size, and reports the drop price", () => {
        const { series, lines } = makeFakeSeries();
        const onDrop = vi.fn();
        const manager = new PriceLineManager(series, { onDrop });
        manager.attach(container);
        manager.update(baseInput({ tickSize: new Decimal("0.5") }));

        container.dispatchEvent(mouseEvent("mousedown", 90));
        container.dispatchEvent(mouseEvent("mousemove", 95.2));

        const slLine = [...lines.entries()].find(([, l]) => l.title.startsWith("SL"))![0];
        // 95.2 snapped to the nearest 0.5 → 95.
        expect(slLine.options().price).toBe(95);

        window.dispatchEvent(new MouseEvent("mouseup"));
        expect(onDrop).toHaveBeenCalledTimes(1);
        const [kind, orderId, price] = onDrop.mock.calls[0];
        expect(kind).toBe("stopLoss");
        expect(orderId).toBe("sl-1");
        expect(price.toNumber()).toBe(95);
    });

    it("restores the original price and does not drop when Escape cancels the drag", () => {
        const { series, lines } = makeFakeSeries();
        const onDrop = vi.fn();
        const onDragCancel = vi.fn();
        const manager = new PriceLineManager(series, { onDrop, onDragCancel });
        manager.attach(container);
        manager.update(baseInput());

        container.dispatchEvent(mouseEvent("mousedown", 90));
        container.dispatchEvent(mouseEvent("mousemove", 70));

        const slLine = [...lines.entries()].find(([, l]) => l.title.startsWith("SL"))![0];
        expect(slLine.options().price).toBe(70);

        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

        expect(slLine.options().price).toBe(90);
        expect(onDragCancel).toHaveBeenCalledWith("stopLoss");
        expect(onDrop).not.toHaveBeenCalled();
    });

    it("reports the exact snapped Decimal on drop instead of re-reading the float from the line", () => {
        const { series, lines } = makeFakeSeries();
        const onDrop = vi.fn();
        const manager = new PriceLineManager(series, { onDrop });
        manager.attach(container);
        manager.update(baseInput({ tickSize: new Decimal("0.001") }));

        // TP line sits at price/coordinate 120. A drag to a coordinate that
        // carries binary-float noise must drop the decimal-exact snapped
        // value, not the noise round-tripped through Number.
        container.dispatchEvent(mouseEvent("mousedown", 120));
        container.dispatchEvent(mouseEvent("mousemove", 120.14500000000002));

        const tpLine = [...lines.entries()].find(([, l]) => l.title.startsWith("TP"))![0];
        expect(tpLine.options().price).toBe(120.145);

        window.dispatchEvent(new MouseEvent("mouseup"));
        expect(onDrop).toHaveBeenCalledTimes(1);
        const [kind, orderId, price] = onDrop.mock.calls[0];
        expect(kind).toBe("takeProfit");
        expect(orderId).toBe("tp-1");
        expect(price).toBeInstanceOf(Decimal);
        expect(price.toString()).toBe("120.145");
    });

    it("keeps the last valid snapped price when a move would snap onto zero", () => {
        const { series, lines } = makeFakeSeries();
        const onDrop = vi.fn();
        const onDragMove = vi.fn();
        const manager = new PriceLineManager(series, { onDrop, onDragMove });
        manager.attach(container);
        manager.update(
            baseInput({
                position: null,
                takeProfit: { orderId: "tp-tiny", triggerPrice: new Decimal("0.4") },
                stopLoss: null,
                tickSize: new Decimal("0.5"),
            }),
        );

        // TP at 0.4, tick 0.5: dragging towards 0.2 would snap to 0, which
        // the exchange would reject as a trigger price — the move is
        // ignored and the line stays put.
        container.dispatchEvent(mouseEvent("mousedown", 0.4));
        container.dispatchEvent(mouseEvent("mousemove", 0.2));

        const tpLine = [...lines.entries()].find(([, l]) => l.title.startsWith("TP"))![0];
        expect(tpLine.options().price).toBe(0.4);
        expect(onDragMove).not.toHaveBeenCalled();

        window.dispatchEvent(new MouseEvent("mouseup"));
        expect(onDrop).toHaveBeenCalledTimes(1);
        const [, , price] = onDrop.mock.calls[0];
        expect(price.toString()).toBe("0.4");
    });

    it("ignores a mousedown that isn't near any draggable line", () => {
        const { series } = makeFakeSeries();
        const onDragStart = vi.fn();
        const manager = new PriceLineManager(series, { onDragStart });
        manager.attach(container);
        manager.update(baseInput());

        container.dispatchEvent(mouseEvent("mousedown", 200));
        container.dispatchEvent(mouseEvent("mousemove", 210));

        expect(onDragStart).not.toHaveBeenCalled();
    });

    it("leaves a line the user is dragging alone when an external update arrives mid-drag", () => {
        const { series, lines } = makeFakeSeries();
        const manager = new PriceLineManager(series);
        manager.attach(container);
        manager.update(baseInput());

        container.dispatchEvent(mouseEvent("mousedown", 90));
        container.dispatchEvent(mouseEvent("mousemove", 70));

        // A store push lands mid-drag with the SL plan still at its old price.
        manager.update(baseInput());

        const slLine = [...lines.entries()].find(([, l]) => l.title.startsWith("SL"))![0];
        expect(slLine.options().price).toBe(70);
    });
});

describe("PriceLineManager — pending (unfilled) orders", () => {
    it("renders a line for a resting limit order even without an open position", () => {
        const { series, lines } = makeFakeSeries();
        const manager = new PriceLineManager(series);

        manager.update(
            baseInput({
                position: null,
                takeProfit: null,
                stopLoss: null,
                pendingOrders: [{ orderId: "o-1", price: new Decimal(65000), side: "buy" }],
            }),
        );

        expect(lines.size).toBe(1);
        const [, line] = [...lines.entries()][0];
        expect(line.price).toBe(65000);
        expect(line.title).toContain("Buy");
    });

    it("moves an existing pending-order line instead of recreating it", () => {
        const { series, lines } = makeFakeSeries();
        const manager = new PriceLineManager(series);

        manager.update(
            baseInput({
                position: null,
                takeProfit: null,
                stopLoss: null,
                pendingOrders: [{ orderId: "o-1", price: new Decimal(100), side: "sell" }],
            }),
        );
        const [handle] = [...lines.keys()];

        manager.update(
            baseInput({
                position: null,
                takeProfit: null,
                stopLoss: null,
                pendingOrders: [{ orderId: "o-1", price: new Decimal(105), side: "sell" }],
            }),
        );

        expect(lines.has(handle)).toBe(true);
        expect(lines.get(handle)!.price).toBe(105);
    });

    it("removes a pending-order line once the order is filled or cancelled", () => {
        const { series, lines } = makeFakeSeries();
        const manager = new PriceLineManager(series);

        manager.update(baseInput({ pendingOrders: [{ orderId: "o-1", price: new Decimal(100), side: "buy" }] }));
        expect(lines.size).toBe(6); // entry, liq, B/E, TP, SL + pending order

        manager.update(baseInput({ pendingOrders: [] }));
        expect(lines.size).toBe(5);
    });
});
