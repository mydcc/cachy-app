// @vitest-environment happy-dom
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

/*
 * BUG-0347 — a live `position` prop must not re-seed the close quantity.
 *
 * Making the parent hand down the live object (the fix) also means the prop
 * changes on every price tick. The seed that defaults the quantity to the full
 * position must key on the size, not on the object identity, or it would reset
 * a partial close back to "all of it" while the trader is typing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { Decimal } from "decimal.js";
import en from "../../locales/locales/en.json";

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}

vi.mock("../../locales/i18n", async () => {
    const { readable: r } = await import("svelte/store");
    return {
        _: r((key: string) => lookup(key) ?? key),
        locale: r("en"),
        setLocale: vi.fn(),
    };
});

vi.mock("../../services/exchange", () => ({
    activeExchange: () => ({ trading: { closePosition: vi.fn(async () => ({ success: true })) } }),
}));

vi.mock("../../stores/market.svelte", () => ({
    marketState: { symbolMeta: { BTCUSDT: { symbol: "BTCUSDT", basePrecision: 1 } } },
}));

vi.mock("./ModalFrame.svelte", async () => ({
    default: (await import("../../tests/helpers/PassthroughModalFrame.svelte")).default,
}));

import ClosePositionLiveWrapper from "../../tests/helpers/ClosePositionLiveWrapper.svelte";
import type { OMSPosition } from "../../services/omsTypes";

const POSITION: OMSPosition = {
    positionId: "p1",
    symbol: "BTCUSDT",
    side: "long",
    amount: new Decimal(2),
    entryPrice: new Decimal(100),
    unrealizedPnl: new Decimal(10),
    leverage: new Decimal(10),
    marginMode: "isolated",
    markPrice: new Decimal(100),
};

type Wrapper = { refresh: (next: OMSPosition) => void };

let host: HTMLElement;
let component: Wrapper | null = null;

function settle() {
    flushSync();
}

function quantityInput(): HTMLInputElement {
    const input = host.querySelector<HTMLInputElement>("#partial-close-qty");
    if (!input) throw new Error("quantity input not rendered");
    return input;
}

function typeQuantity(value: string) {
    const input = quantityInput();
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    input.dispatchEvent(new Event("blur", { bubbles: true }));
    flushSync();
}

beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

describe("BUG-0347 — ClosePositionModal keeps an edited quantity on price ticks", () => {
    it("seeds the full size on open", () => {
        component = mount(ClosePositionLiveWrapper, {
            target: host,
            props: { initialPosition: POSITION },
        }) as never;
        settle();
        expect(quantityInput().value).toBe("2");
    });

    it("does not reset an edited quantity when only the mark price changes", () => {
        component = mount(ClosePositionLiveWrapper, {
            target: host,
            props: { initialPosition: POSITION },
        }) as never;
        settle();

        typeQuantity("1");
        expect(quantityInput().value).toBe("1");

        // Same size, new mark — the parent re-read produces a new object.
        component?.refresh({ ...POSITION, markPrice: new Decimal(999) });
        settle();

        expect(quantityInput().value).toBe("1");
    });

    it("re-seeds when the position size actually changes", () => {
        component = mount(ClosePositionLiveWrapper, {
            target: host,
            props: { initialPosition: POSITION },
        }) as never;
        settle();

        typeQuantity("1");
        expect(quantityInput().value).toBe("1");

        component?.refresh({ ...POSITION, amount: new Decimal(5) });
        settle();

        expect(quantityInput().value).toBe("5");
    });
});
