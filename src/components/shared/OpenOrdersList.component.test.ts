// @vitest-environment happy-dom
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
 * BUG-0562 — pending-order financial details (leverage, margin mode,
 * position mode, TP/SL in the order tooltip) are a disclosure, not a
 * hover: Enter/Space toggle open and close, focus alone exposes, Escape
 * closes and restores focus, and every anchor path is clamped to the
 * viewport.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";
import type { NormalizedOrder } from "../../types/exchange";

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}

vi.mock("../../locales/i18n", async () => {
    const { readable: r } = await import("svelte/store");
    const translate = (key: string, options?: { values?: Record<string, string | number> }) => {
        const text = lookup(key) ?? key;
        if (!options?.values) return text;
        return Object.entries(options.values).reduce(
            (acc, [name, value]) => acc.split(`{${name}}`).join(String(value)),
            text
        );
    };
    return { _: r(translate), locale: r("en"), setLocale: vi.fn() };
});

import OpenOrdersList from "./OpenOrdersList.svelte";
import OrderDetailsTooltip from "./OrderDetailsTooltip.svelte";
import { uiState } from "../../stores/ui.svelte";

const ORDER: NormalizedOrder = {
    id: "o-1",
    orderId: "o-1",
    clientId: "c-1",
    symbol: "BTCUSDT",
    type: "LIMIT",
    side: "BUY",
    price: "50000",
    amount: "0.02",
    filled: "0",
    status: "NEW",
    time: 1758710400000,
    mtime: 1758710400000,
    leverage: "5",
    marginMode: "cross",
    positionMode: "oneway",
    reduceOnly: false,
    fee: "0.01",
    realizedPNL: "0",
    tpPrice: "51000",
    tpStopType: "last",
    tpOrderType: "market",
    slPrice: "49000",
    slStopType: "last",
    slOrderType: "market",
    avgPrice: "50000",
};

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    uiState.hideTooltip();
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
    uiState.hideTooltip();
});

function render() {
    component = mount(OpenOrdersList, {
        target: host,
        props: { orders: [ORDER] },
    }) as never;
    flushSync();
}

function trigger(): HTMLElement {
    const el = host.querySelector('[role="button"]');
    expect(el).not.toBeNull();
    return el as HTMLElement;
}

function key(el: HTMLElement, keyName: string) {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: keyName, bubbles: true }));
    flushSync();
}

describe("BUG-0562 — order details are a disclosure, not a hover", () => {
    it("names each row after the order it discloses (finding 4b)", () => {
        render();

        const expected = lookup("dashboard.openOrders.viewDetails").replace("{symbol}", ORDER.symbol);
        expect(trigger().getAttribute("aria-label")).toBe(expected);
        expect(trigger().getAttribute("tabindex")).toBe("0");
    });

    it("advertises expanded state and controls the tooltip container (findings 6/9)", () => {
        render();

        expect(trigger().getAttribute("aria-expanded")).toBe("false");
        expect(trigger().getAttribute("aria-controls")).toBeNull();

        key(trigger(), "Enter");
        expect(trigger().getAttribute("aria-expanded")).toBe("true");
        expect(trigger().getAttribute("aria-controls")).toBe("order-details-tooltip");

        key(trigger(), "Enter");
        expect(trigger().getAttribute("aria-expanded")).toBe("false");
        expect(trigger().getAttribute("aria-controls")).toBeNull();
    });

    it("toggles the order tooltip with Enter (finding 1)", () => {
        render();

        key(trigger(), "Enter");
        expect(uiState.tooltip.visible).toBe(true);
        // Props cross the component boundary as a Svelte proxy, so identity
        // does not survive — the payload must still equal the row's order.
        expect(uiState.tooltip.data).toStrictEqual(ORDER);
        expect(uiState.tooltip.data).toHaveProperty("orderId", ORDER.orderId);

        key(trigger(), "Enter");
        expect(uiState.tooltip.visible).toBe(false);
    });

    it("toggles the order tooltip with Space", () => {
        render();

        key(trigger(), " ");
        expect(uiState.tooltip.visible).toBe(true);
        expect(uiState.tooltip.data).toStrictEqual(ORDER);

        key(trigger(), " ");
        expect(uiState.tooltip.visible).toBe(false);
    });

    it("exposes the order details on focus alone and hides them on blur", () => {
        render();

        trigger().focus();
        flushSync();
        expect(uiState.tooltip.visible).toBe(true);

        trigger().blur();
        flushSync();
        expect(uiState.tooltip.visible).toBe(false);
    });

    it("keeps the tooltip open while focus moves into it (finding 2)", () => {
        render();

        trigger().focus();
        flushSync();
        expect(uiState.tooltip.visible).toBe(true);

        const tip = document.createElement("div");
        tip.id = "order-details-tooltip";
        document.body.appendChild(tip);

        trigger().dispatchEvent(new FocusEvent("blur", { relatedTarget: tip }));
        flushSync();
        expect(uiState.tooltip.visible).toBe(true);

        trigger().dispatchEvent(new FocusEvent("blur", { relatedTarget: null }));
        flushSync();
        expect(uiState.tooltip.visible).toBe(false);

        tip.remove();
    });

    it("stays open on mouseleave while the trigger holds focus (finding 7)", () => {
        render();

        trigger().focus();
        flushSync();
        expect(uiState.tooltip.visible).toBe(true);

        trigger().dispatchEvent(new MouseEvent("mouseleave"));
        flushSync();
        expect(uiState.tooltip.visible).toBe(true);

        trigger().blur();
        flushSync();
        expect(uiState.tooltip.visible).toBe(false);
    });

    it("closes with Escape and restores focus to the trigger", () => {
        render();

        trigger().focus();
        flushSync();
        expect(uiState.tooltip.visible).toBe(true);

        key(trigger(), "Escape");
        expect(uiState.tooltip.visible).toBe(false);
        expect(document.activeElement).toBe(trigger());
    });

    it("closes on Escape from the document listener when focus is elsewhere (finding 8)", () => {
        render();

        trigger().dispatchEvent(new MouseEvent("mouseenter"));
        flushSync();
        expect(uiState.tooltip.visible).toBe(true);

        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        flushSync();
        expect(uiState.tooltip.visible).toBe(false);
    });

    it("renders the order's financial details in the tooltip (AC4)", () => {
        const tipHost = document.createElement("div");
        tipHost.id = "order-details-tooltip";
        document.body.appendChild(tipHost);

        const tip = mount(OrderDetailsTooltip, {
            target: tipHost,
            props: { order: ORDER },
        });
        flushSync();

        const text = tipHost.textContent ?? "";
        expect(text).toContain(lookup("dashboard.orderHistory.details.leverage"));
        expect(text).toContain("5x");
        expect(text).toContain("cross");
        expect(text).toContain(lookup("common.tp"));
        expect(text).toContain("51000");

        unmount(tip);
        tipHost.remove();
    });
});

describe("BUG-0562 — tooltip position is clamped to the viewport (findings 5/13)", () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;

    function setViewport(width: number, height: number) {
        Object.defineProperty(window, "innerWidth", { value: width, configurable: true, writable: true });
        Object.defineProperty(window, "innerHeight", { value: height, configurable: true, writable: true });
    }

    afterEach(() => {
        setViewport(originalWidth, originalHeight);
    });

    it("keeps the keyboard center anchor inside a short landscape viewport", () => {
        setViewport(844, 390);
        render();

        key(trigger(), "Enter");
        expect(uiState.tooltip.visible).toBe(true);
        expect(uiState.tooltip.x).toBeGreaterThanOrEqual(10);
        expect(uiState.tooltip.y).toBeGreaterThanOrEqual(10);
    });

    it("clamps a focus anchor near the viewport edge", () => {
        setViewport(1024, 300);
        render();

        const el = trigger();
        el.getBoundingClientRect = () =>
            ({
                right: 900,
                top: 260,
                left: 700,
                bottom: 290,
                width: 200,
                height: 30,
                x: 700,
                y: 260,
                toJSON: () => ({}),
            }) as DOMRect;

        el.focus();
        flushSync();
        expect(uiState.tooltip.visible).toBe(true);
        expect(uiState.tooltip.x).toBeGreaterThanOrEqual(10);
        expect(uiState.tooltip.y).toBeGreaterThanOrEqual(10);
    });
});
