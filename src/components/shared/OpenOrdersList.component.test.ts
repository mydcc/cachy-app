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
 * BUG-0562 — pending-order financial details are an accessible popover:
 * native disclosure controls, ordered keyboard focus, managed dismissal,
 * viewport clamping, and pointer/touch behavior.
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

const SECOND_ORDER: NormalizedOrder = {
    ...ORDER,
    id: "o-2",
    orderId: "o-2",
    symbol: "ETHUSDT",
};

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
    vi.useRealTimers();
});

function render(orders: NormalizedOrder[] = [ORDER]) {
    component = mount(OpenOrdersList, {
        target: host,
        props: { orders },
    }) as never;
    flushSync();
}

function triggers(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll<HTMLButtonElement>("button[aria-expanded]"))
        .filter((button) => button.getAttribute("aria-label") !== null);
}

function trigger(index = 0): HTMLButtonElement {
    const buttons = triggers();
    expect(buttons.length).toBeGreaterThan(index);
    return buttons[index];
}

function dialog(): HTMLElement | null {
    return host.querySelector('[role="dialog"]');
}

function moreButton(): HTMLButtonElement | null {
    return dialog()?.querySelector<HTMLButtonElement>("button[aria-controls]") ?? null;
}

function activate(el: HTMLElement) {
    // Native Enter/Space activation of a button arrives as a click with
    // detail 0; pointer-generated clicks carry a positive detail.
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    flushSync();
}

function rect(
    el: HTMLElement,
    values: Partial<Pick<DOMRect, "top" | "right" | "bottom" | "left">>
) {
    el.getBoundingClientRect = () =>
        ({
            ...values,
            width: (values.right ?? 0) - (values.left ?? 0),
            height: (values.bottom ?? 0) - (values.top ?? 0),
            x: values.left ?? 0,
            y: values.top ?? 0,
            toJSON: () => ({}),
        }) as DOMRect;
}

describe("BUG-0562 — order details use accessible disclosure semantics", () => {
    it("uses a native trigger and places the dialog immediately after it", () => {
        render();

        const triggerEl = trigger();
        expect(triggerEl.tagName).toBe("BUTTON");
        expect(triggerEl.type).toBe("button");
        expect(triggerEl.getAttribute("aria-expanded")).toBe("false");
        expect(host.querySelector('[role="tooltip"]')).toBeNull();

        activate(triggerEl);

        const popover = dialog();
        expect(popover).not.toBeNull();
        expect(triggerEl.getAttribute("aria-expanded")).toBe("true");
        expect(triggerEl.getAttribute("aria-controls")).toBe(popover?.id);
        expect(popover?.getAttribute("aria-labelledby")).toBe(triggerEl.id);
        expect(popover?.previousElementSibling).toBe(triggerEl);
    });

    it("toggles the disclosure with Enter and Space", () => {
        render();

        activate(trigger());
        expect(dialog()).not.toBeNull();

        activate(trigger());
        expect(dialog()).toBeNull();

        activate(trigger());
        expect(dialog()).not.toBeNull();

        activate(trigger());
        expect(dialog()).toBeNull();
    });

    it("keeps a touch tap open even when focus precedes the click", () => {
        render();
        const triggerEl = trigger();

        triggerEl.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        triggerEl.focus();
        triggerEl.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
        flushSync();
        expect(dialog()).not.toBeNull();

        triggerEl.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
        flushSync();
        expect(dialog()).toBeNull();
    });

    it("toggles on activation for keyboard, pointer, and touch clicks", () => {
        render();
        const triggerEl = trigger();

        triggerEl.dispatchEvent(new PointerEvent("pointerenter", { clientX: 20, clientY: 20 }));
        flushSync();
        triggerEl.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
        flushSync();
        expect(dialog()).toBeNull();

        activate(triggerEl);
        expect(dialog()).not.toBeNull();
        activate(triggerEl);
        expect(dialog()).toBeNull();
    });

    it("exposes details on focus and keeps focus moving into the dialog", () => {
        render();
        const triggerEl = trigger();

        triggerEl.focus();
        flushSync();

        expect(dialog()).not.toBeNull();
        expect(document.activeElement).toBe(triggerEl);

        const more = moreButton();
        expect(more).not.toBeNull();
        more?.focus();
        flushSync();

        expect(dialog()).not.toBeNull();
        expect(document.activeElement).toBe(more);
    });

    it("uses a native More button with expanded state and an ordered details region", () => {
        render();
        activate(trigger());

        const more = moreButton();
        expect(more?.tagName).toBe("BUTTON");
        expect(more?.type).toBe("button");
        expect(more?.getAttribute("aria-expanded")).toBe("false");
        const controlsId = more?.getAttribute("aria-controls");
        expect(controlsId).toContain("order-more-details");

        more?.click();
        flushSync();

        expect(more?.getAttribute("aria-expanded")).toBe("true");
        const region = dialog()?.querySelector(`#${controlsId}`);
        expect(region).not.toBeNull();
        expect(region?.textContent).toContain(lookup("dashboard.orderHistory.details.orderId"));
    });

    it("renders the order financial details in the dialog", () => {
        render();
        activate(trigger());

        const text = dialog()?.textContent ?? "";
        expect(text).toContain(lookup("dashboard.orderHistory.details.leverage"));
        expect(text).toContain("5x");
        expect(text).toContain("cross");
        expect(text).toContain(lookup("common.tp"));
        expect(text).toContain("51000");
    });

    it("constrains the dialog to the viewport and scrolls its overflow", () => {
        render();
        activate(trigger());

        expect(dialog()?.className).toContain("max-h-[calc(100vh-20px)]");
        expect(dialog()?.className).toContain("max-w-[calc(100vw-20px)]");
        expect(dialog()?.className).toContain("overflow-y-auto");
        expect(dialog()?.className).toContain("overscroll-contain");
    });
});

describe("BUG-0562 — order disclosure dismissal and pointer behavior", () => {
    it("closes on an outside pointerdown or tap", () => {
        const outside = document.createElement("button");
        document.body.appendChild(outside);
        render();

        activate(trigger());
        expect(dialog()).not.toBeNull();

        outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        flushSync();
        expect(dialog()).toBeNull();

        outside.remove();
    });

    it("allows the pointer to cross from the trigger into the dialog", () => {
        vi.useFakeTimers();
        render();

        const triggerEl = trigger();
        triggerEl.dispatchEvent(new PointerEvent("pointerenter", { clientX: 120, clientY: 120 }));
        flushSync();

        const popover = dialog();
        expect(popover).not.toBeNull();

        triggerEl.dispatchEvent(new PointerEvent("pointerleave", { relatedTarget: popover }));
        popover?.dispatchEvent(new PointerEvent("pointerenter"));
        vi.advanceTimersByTime(250);
        flushSync();

        expect(dialog()).not.toBeNull();
    });

    it("closes after the pointer leaves the trigger and dialog", () => {
        vi.useFakeTimers();
        render();

        const triggerEl = trigger();
        triggerEl.dispatchEvent(new PointerEvent("pointerenter", { clientX: 120, clientY: 120 }));
        flushSync();

        triggerEl.dispatchEvent(new PointerEvent("pointerleave"));
        vi.advanceTimersByTime(250);
        flushSync();

        expect(dialog()).toBeNull();
    });

    it("restores the current trigger when a mouse-opened disclosure receives Escape", () => {
        render([ORDER, SECOND_ORDER]);

        const second = trigger(1);
        second.dispatchEvent(new PointerEvent("pointerenter", { clientX: 120, clientY: 120 }));
        flushSync();
        expect(dialog()).not.toBeNull();

        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        flushSync();

        expect(dialog()).toBeNull();
        expect(document.activeElement).toBe(second);
    });

    it("restores the trigger when Escape is pressed from inside the dialog", () => {
        render();
        const triggerEl = trigger();
        triggerEl.focus();
        flushSync();
        moreButton()?.focus();
        flushSync();

        moreButton()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        flushSync();

        expect(dialog()).toBeNull();
        expect(document.activeElement).toBe(triggerEl);
    });
});

describe("BUG-0562 — order popover coordinates stay inside the viewport", () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;

    function setViewport(width: number, height: number) {
        Object.defineProperty(window, "innerWidth", { value: width, configurable: true, writable: true });
        Object.defineProperty(window, "innerHeight", { value: height, configurable: true, writable: true });
    }

    afterEach(() => {
        setViewport(originalWidth, originalHeight);
    });

    it("places a keyboard-anchored popover within a short landscape viewport", () => {
        setViewport(844, 390);
        render();
        rect(trigger(), { top: 300, right: 800, bottom: 360, left: 700 });

        activate(trigger());

        const style = dialog()?.getAttribute("style") ?? "";
        expect(style).toContain("left: 470px");
        expect(style).toContain("top: 10px");
    });

    it("clamps a focus anchor near the bottom-right edge", () => {
        setViewport(1024, 300);
        render();
        rect(trigger(), { top: 260, right: 900, bottom: 290, left: 700 });

        trigger().focus();
        flushSync();

        const style = dialog()?.getAttribute("style") ?? "";
        expect(style).toContain("left: 570px");
        expect(style).toContain("top: 10px");
    });

    it("keeps the origin inside a viewport smaller than the preferred popover", () => {
        setViewport(300, 200);
        render();
        rect(trigger(), { top: 190, right: 290, bottom: 200, left: 200 });

        trigger().focus();
        flushSync();

        const style = dialog()?.getAttribute("style") ?? "";
        expect(style).toContain("left: 10px");
        expect(style).toContain("top: 10px");
    });
});
