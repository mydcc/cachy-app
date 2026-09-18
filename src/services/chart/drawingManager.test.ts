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

// @vitest-environment jsdom

/**
 * FEAT-0480 criterion: a drawing can be selected, moved and deleted.
 *
 * Driven through real DOM events against a fake bridge, so the assertions are
 * about what a mouse does rather than about which method was called.
 */

import { Decimal } from "decimal.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DrawingChartBridge } from "../../lib/chart/drawings/geometry";
import type { ChartDrawing } from "../../lib/chart/drawings/types";
import { DrawingManager, type DrawingManagerPorts } from "./drawingManager";

const T0 = 1_757_030_400_000;
const HOUR = 3_600_000;
const WIDTH = 1000;
const HEIGHT = 500;

/** Linear in both axes: x = hours * 100, y = (60000 - price) / 40. */
function bridge(times: number[] = hourly()): DrawingChartBridge {
    return {
        timeToX: (ms) => ((ms - T0) / (10 * HOUR)) * WIDTH,
        xToTime: (x) => T0 + (x / WIDTH) * 10 * HOUR,
        priceToY: (price) => (60_000 - price.toNumber()) / 40,
        yToPrice: (y) => new Decimal(60_000 - y * 40),
        sampleTimesMs: () => times,
        size: () => ({ width: WIDTH, height: HEIGHT }),
    };
}

function hourly(): number[] {
    return Array.from({ length: 11 }, (_, i) => T0 + i * HOUR);
}

function fakePorts(initial: ChartDrawing[] = []) {
    // Copied per drawing, not just per array: the movers below write straight
    // into these objects, and `[...initial]` would leave every test mutating
    // the shared module-level fixture — so a drag in one test moved the line
    // the next test was trying to click on.
    const state = {
        drawings: initial.map((d) => ({ ...d })) as ChartDrawing[],
        selected: null as string | null,
    };
    const ports: DrawingManagerPorts = {
        drawingsFor: (symbol) => state.drawings.filter((d) => d.symbol === symbol),
        selectedId: () => state.selected,
        select: (id) => {
            state.selected = id;
        },
        addHorizontal: vi.fn((symbol, price) => {
            state.drawings.push({
                kind: "horizontal",
                id: `h${state.drawings.length}`,
                symbol,
                createdAtMs: 0,
                price: price.toString(),
            });
        }),
        addTrend: vi.fn((symbol, from, to) => {
            state.drawings.push({
                kind: "trend",
                id: `t${state.drawings.length}`,
                symbol,
                createdAtMs: 0,
                fromMs: from.ms,
                fromPrice: from.price.toString(),
                toMs: to.ms,
                toPrice: to.price.toString(),
            });
        }),
        moveHorizontal: vi.fn((id, price) => {
            const d = state.drawings.find((x) => x.id === id);
            if (d?.kind === "horizontal") d.price = price.toString();
        }),
        moveTrend: vi.fn((id, anchors) => {
            const d = state.drawings.find((x) => x.id === id);
            if (d?.kind !== "trend") return;
            if (anchors.from) {
                d.fromMs = anchors.from.ms;
                d.fromPrice = anchors.from.price.toString();
            }
            if (anchors.to) {
                d.toMs = anchors.to.ms;
                d.toPrice = anchors.to.price.toString();
            }
        }),
        remove: vi.fn((id) => {
            state.drawings = state.drawings.filter((d) => d.id !== id);
        }),
        requestRedraw: vi.fn(),
        setChartInteractive: vi.fn(),
    };
    return { ports, state };
}

const horizontal: ChartDrawing = {
    kind: "horizontal",
    id: "h1",
    symbol: "BTCUSDT",
    createdAtMs: 0,
    price: "50000",
};

const trend: ChartDrawing = {
    kind: "trend",
    id: "t1",
    symbol: "BTCUSDT",
    createdAtMs: 0,
    fromMs: T0,
    fromPrice: "50000",
    toMs: T0 + 10 * HOUR,
    toPrice: "50000",
};

let container: HTMLElement;
/**
 * Managers put listeners on `window`, so one left attached keeps reacting to
 * the next test's mouseup and keydown. Every manager made here is detached in
 * `afterEach`.
 */
let attached: DrawingManager[] = [];

function managerFor(ports: DrawingManagerPorts, symbol = "BTCUSDT", times?: number[]) {
    const manager = new DrawingManager(ports, symbol);
    manager.attach(container, bridge(times));
    attached.push(manager);
    return manager;
}

beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    // jsdom gives every element a zero-sized rect; the manager subtracts it
    // from clientX/clientY, so an origin at 0,0 makes page and local
    // coordinates the same and keeps the arithmetic in these tests readable.
    container.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: WIDTH, height: HEIGHT }) as DOMRect;
});

afterEach(() => {
    for (const manager of attached) manager.detach();
    attached = [];
    container.remove();
});

function mouse(type: string, x: number, y: number): void {
    const target = type === "mouseup" ? window : container;
    target.dispatchEvent(
        new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }),
    );
}

function key(k: string, target: EventTarget = window): void {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
}

/** y for 50 000 under the fake bridge. */
const Y_50K = (60_000 - 50_000) / 40;

describe("selecting a drawing", () => {
    it("selects the line the trader clicked on", () => {
        const { ports, state } = fakePorts([horizontal]);
        managerFor(ports);

        mouse("mousedown", 400, Y_50K);

        expect(state.selected).toBe("h1");
    });

    it("clears the selection on a click away from every line", () => {
        const { ports, state } = fakePorts([horizontal]);
        managerFor(ports);
        mouse("mousedown", 400, Y_50K);

        mouse("mouseup", 400, Y_50K);
        mouse("mousedown", 400, Y_50K + 100);

        expect(state.selected).toBeNull();
    });

    it("ignores a drawing belonging to another symbol", () => {
        const { ports, state } = fakePorts([{ ...horizontal, symbol: "ETHUSDT" }]);
        managerFor(ports);

        mouse("mousedown", 400, Y_50K);

        expect(state.selected).toBeNull();
    });
});

describe("moving a drawing", () => {
    it("drags a horizontal line to a new price", () => {
        const { ports, state } = fakePorts([horizontal]);
        managerFor(ports);

        mouse("mousedown", 400, Y_50K);
        mouse("mousemove", 400, Y_50K + 25);
        mouse("mouseup", 400, Y_50K + 25);

        expect(state.drawings[0]).toMatchObject({ price: "49000" });
    });

    it("stops the chart panning while a drag is in flight, and lets it pan again after", () => {
        const { ports } = fakePorts([horizontal]);
        managerFor(ports);

        mouse("mousedown", 400, Y_50K);
        expect(ports.setChartInteractive).toHaveBeenLastCalledWith(false);

        mouse("mouseup", 400, Y_50K);
        expect(ports.setChartInteractive).toHaveBeenLastCalledWith(true);
    });

    it("drags one end of a trend line and leaves the other alone", () => {
        const { ports, state } = fakePorts([trend]);
        managerFor(ports);

        // Grab the right-hand anchor at x=1000 and pull it up 25px (1 000).
        mouse("mousedown", WIDTH, Y_50K);
        mouse("mousemove", WIDTH, Y_50K - 25);
        mouse("mouseup", WIDTH, Y_50K - 25);

        expect(state.drawings[0]).toMatchObject({ fromPrice: "50000", toPrice: "51000" });
    });

    it("drags a whole trend line without changing its slope", () => {
        const sloped: ChartDrawing = { ...trend, toPrice: "52000" };
        const { ports, state } = fakePorts([sloped]);
        managerFor(ports);

        // Grab the middle — away from both anchors — and move down 25px.
        const midY = (60_000 - 51_000) / 40;
        mouse("mousedown", 500, midY);
        mouse("mousemove", 500, midY + 25);
        mouse("mouseup", 500, midY + 25);

        const moved = state.drawings[0] as Extract<ChartDrawing, { kind: "trend" }>;
        expect(moved.fromPrice).toBe("49000");
        expect(moved.toPrice).toBe("51000");
    });

    it("keeps a long drag rigid instead of accumulating rounding", () => {
        const sloped: ChartDrawing = { ...trend, toPrice: "52000" };
        const { ports, state } = fakePorts([sloped]);
        managerFor(ports);
        const midY = (60_000 - 51_000) / 40;

        mouse("mousedown", 500, midY);
        for (let i = 1; i <= 40; i++) mouse("mousemove", 500 + i, midY + i * 0.5);
        mouse("mouseup", 540, midY + 20);

        const moved = state.drawings[0] as Extract<ChartDrawing, { kind: "trend" }>;
        // The 2 000 span between the anchors is exactly what it was.
        expect(new Decimal(moved.toPrice).minus(moved.fromPrice).toString()).toBe("2000");
    });

    it("puts a line back where it was when Escape cancels the drag", () => {
        const { ports, state } = fakePorts([horizontal]);
        managerFor(ports);

        mouse("mousedown", 400, Y_50K);
        mouse("mousemove", 400, Y_50K + 25);
        key("Escape");

        expect(state.drawings[0]).toMatchObject({ price: "50000" });
        expect(ports.setChartInteractive).toHaveBeenLastCalledWith(true);
    });
});

describe("drawing a new line", () => {
    it("places a horizontal line with one click", () => {
        const { ports, state } = fakePorts();
        const manager = managerFor(ports);

        manager.arm("horizontal");
        mouse("mousedown", 400, Y_50K);

        expect(state.drawings).toHaveLength(1);
        expect(state.drawings[0]).toMatchObject({ kind: "horizontal", price: "50000" });
        expect(manager.isArmed()).toBe(false);
    });

    it("places a trend line with two clicks and previews it between them", () => {
        const { ports, state } = fakePorts();
        const manager = managerFor(ports);

        manager.arm("trend");
        mouse("mousedown", 0, Y_50K);
        expect(state.drawings).toHaveLength(0);

        mouse("mousemove", 500, Y_50K - 25);
        expect(manager.previewDrawing()).toMatchObject({ fromPrice: "50000", toPrice: "51000" });

        mouse("mousedown", WIDTH, Y_50K - 50);
        expect(state.drawings).toHaveLength(1);
        expect(state.drawings[0]).toMatchObject({ kind: "trend", fromPrice: "50000", toPrice: "52000" });
        expect(manager.previewDrawing()).toBeNull();
    });

    it("abandons a half-drawn line on Escape", () => {
        const { ports, state } = fakePorts();
        const manager = managerFor(ports);

        manager.arm("trend");
        mouse("mousedown", 0, Y_50K);
        key("Escape");

        expect(state.drawings).toHaveLength(0);
        expect(manager.isArmed()).toBe(false);
        expect(manager.previewDrawing()).toBeNull();
    });
});

describe("deleting a drawing", () => {
    it("deletes the selected drawing on Delete", () => {
        const { ports, state } = fakePorts([horizontal]);
        managerFor(ports);
        mouse("mousedown", 400, Y_50K);
        mouse("mouseup", 400, Y_50K);

        key("Delete");

        expect(state.drawings).toHaveLength(0);
    });

    it("deletes nothing when nothing is selected", () => {
        const { ports, state } = fakePorts([horizontal]);
        managerFor(ports);

        key("Delete");

        expect(state.drawings).toHaveLength(1);
    });

    it("leaves Backspace alone inside a text field", () => {
        // Otherwise typing in the symbol search would silently delete the
        // line the trader had selected on the chart.
        const { ports, state } = fakePorts([horizontal]);
        managerFor(ports);
        mouse("mousedown", 400, Y_50K);
        mouse("mouseup", 400, Y_50K);

        const input = document.createElement("input");
        document.body.appendChild(input);
        key("Backspace", input);
        input.remove();

        expect(state.drawings).toHaveLength(1);
    });
});

describe("leaving the chart", () => {
    it("restores chart panning when detached mid-drag", () => {
        const { ports } = fakePorts([horizontal]);
        const manager = managerFor(ports);
        mouse("mousedown", 400, Y_50K);

        manager.detach();

        expect(ports.setChartInteractive).toHaveBeenLastCalledWith(true);
    });

    it("drops the selection when the chart switches symbol", () => {
        const { ports, state } = fakePorts([horizontal]);
        const manager = managerFor(ports);
        mouse("mousedown", 400, Y_50K);

        manager.setSymbol("ETHUSDT");

        expect(state.selected).toBeNull();
    });

    it("stops responding to the mouse after detach", () => {
        const { ports, state } = fakePorts([horizontal]);
        const manager = managerFor(ports);

        manager.detach();
        mouse("mousedown", 400, Y_50K);

        expect(state.selected).toBeNull();
    });
});
