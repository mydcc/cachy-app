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
 * hover: Enter/Space open, focus alone exposes, Escape closes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}

vi.mock("../../locales/i18n", async () => {
    const { readable: r } = await import("svelte/store");
    return { _: r((key: string) => lookup(key) ?? key), locale: r("en"), setLocale: vi.fn() };
});

import OpenOrdersList from "./OpenOrdersList.svelte";
import { uiState } from "../../stores/ui.svelte";

const ORDER = {
    id: "o-1",
    orderId: "o-1",
    symbol: "BTCUSDT",
    time: 1758710400000,
    side: "BUY",
    type: "LIMIT",
    amount: "0.02",
    filled: "0",
    price: "50000",
    status: "NEW",
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
        props: { orders: [ORDER] as never },
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
    it("exposes the disclosure under an accessible name", () => {
        render();

        expect(trigger().getAttribute("aria-label")).toBe(lookup("dashboard.orderHistory.viewDetails"));
    });

    it("opens the order tooltip with Enter and closes with Escape", () => {
        render();

        key(trigger(), "Enter");
        expect(uiState.tooltip.visible).toBe(true);
        // Props cross the component boundary as a Svelte proxy, so identity
        // does not survive — the payload must still equal the row's order.
        expect(uiState.tooltip.data).toStrictEqual(ORDER);

        key(trigger(), "Escape");
        expect(uiState.tooltip.visible).toBe(false);
    });

    it("opens the order tooltip with Space", () => {
        render();

        key(trigger(), " ");
        expect(uiState.tooltip.visible).toBe(true);
        expect(uiState.tooltip.data).toStrictEqual(ORDER);
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
});
