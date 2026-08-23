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
 * FEAT-0256's load-bearing claim, the one `partialClose.test.ts` cannot make:
 * the quantity the component *shows* is the quantity it *emits*, in both
 * directions, including at 100 % where the rule changes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { Decimal } from "decimal.js";
import en from "../../locales/locales/en.json";
import type { PartialCloseContext } from "../../lib/calculators/partialClose";

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

import PartialCloseInput from "./PartialCloseInput.svelte";

/** 2 contracts, entered at 100, marked at 110, step 0.1. */
const LONG: PartialCloseContext = {
    positionAmount: new Decimal(2),
    entryPrice: new Decimal(100),
    markPrice: new Decimal(110),
    side: "LONG",
    stepSize: new Decimal("0.1"),
};

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
});

function render(props: {
    ctx?: PartialCloseContext;
    quantity: Decimal;
    onChange: (q: Decimal) => void;
}) {
    component = mount(PartialCloseInput, {
        target: host,
        props: {
            ctx: props.ctx ?? LONG,
            quantity: props.quantity,
            onChange: props.onChange,
        },
    }) as never;
    flushSync();
}

const slider = () => host.querySelector<HTMLInputElement>('input[type="range"]')!;
const qtyField = () => host.querySelector<HTMLInputElement>('input[name="partialCloseQty"]')!;

function typeInto(field: HTMLInputElement, text: string) {
    field.value = text;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    field.dispatchEvent(new Event("blur", { bubbles: true }));
    flushSync();
}

function dragTo(percent: number) {
    const range = slider();
    range.value = String(percent);
    range.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
}

describe("FEAT-0256 — slider and quantity are one value", () => {
    it("shows the quantity it was given", () => {
        render({ quantity: new Decimal(1), onChange: vi.fn() });
        expect(qtyField().value).toBe("1");
    });

    it("puts the handle at the share that quantity represents", () => {
        render({ quantity: new Decimal(1), onChange: vi.fn() });
        // 1 of 2 contracts is halfway.
        expect(slider().value).toBe("50");
    });

    it("emits a Decimal quantity when the slider moves", () => {
        const onChange = vi.fn();
        render({ quantity: new Decimal(2), onChange });

        dragTo(25);

        expect(onChange).toHaveBeenCalledTimes(1);
        const emitted = onChange.mock.calls[0][0] as Decimal;
        expect(emitted).toBeInstanceOf(Decimal);
        expect(emitted.toString()).toBe("0.5");
    });

    it("turns a typed quantity into a quantity the venue can fill", () => {
        const onChange = vi.fn();
        render({ quantity: new Decimal(2), onChange });

        typeInto(qtyField(), "0.75");

        // Rounded down to the 0.1 step — never up, which could exceed the
        // position.
        expect((onChange.mock.calls.at(-1)![0] as Decimal).toString()).toBe("0.7");
    });

    it("treats a typed quantity above the position as a full close", () => {
        const onChange = vi.fn();
        render({ quantity: new Decimal(1), onChange });

        typeInto(qtyField(), "99");

        expect((onChange.mock.calls.at(-1)![0] as Decimal).toString()).toBe("2");
    });

    it("ignores a non-numeric quantity instead of emitting NaN", () => {
        const onChange = vi.fn();
        render({ quantity: new Decimal(1), onChange });

        typeInto(qtyField(), "abc");

        expect(onChange).not.toHaveBeenCalled();
    });

    it("ignores a non-positive quantity", () => {
        const onChange = vi.fn();
        render({ quantity: new Decimal(1), onChange });

        typeInto(qtyField(), "-1");

        expect(onChange).not.toHaveBeenCalled();
    });
});

describe("FEAT-0256 — 100 % is a full close, not a rounded share", () => {
    it("emits the exact position amount at the top of the slider", () => {
        const onChange = vi.fn();
        render({ quantity: new Decimal(1), onChange });

        dragTo(100);

        expect((onChange.mock.calls.at(-1)![0] as Decimal).toString()).toBe("2");
    });

    it("emits the exact amount even when the position is not a whole step", () => {
        // The case a rounded 100 % gets wrong: every rounding of 0.7 against a
        // 0.3 step gives 0.6, leaving 0.1 open that nobody asked to keep.
        const coarse: PartialCloseContext = {
            ...LONG,
            positionAmount: new Decimal("0.7"),
            stepSize: new Decimal("0.3"),
        };
        const onChange = vi.fn();
        render({ ctx: coarse, quantity: new Decimal("0.3"), onChange });

        dragTo(100);

        expect((onChange.mock.calls.at(-1)![0] as Decimal).toString()).toBe("0.7");
    });

    it("says so on screen when the whole position would close", () => {
        render({ quantity: new Decimal(2), onChange: vi.fn() });
        expect(host.textContent).toContain(lookup("positionsList.fullCloseBadge"));
    });

    it("stays quiet about it for a partial close", () => {
        render({ quantity: new Decimal(1), onChange: vi.fn() });
        expect(host.textContent).not.toContain(lookup("positionsList.fullCloseBadge"));
    });
});

describe("FEAT-0256 — the readout", () => {
    it("states what stays open", () => {
        render({ quantity: new Decimal("0.5"), onChange: vi.fn() });
        const text = host.textContent ?? "";
        expect(text).toContain(lookup("positionsList.remainingAfter"));
        expect(text).toContain("1.5");
    });

    it("states the gain the close would book", () => {
        // 1 contract × (110 − 100) = +10.
        render({ quantity: new Decimal(1), onChange: vi.fn() });
        expect(host.textContent).toContain("+10.00");
    });

    it("states a loss as a loss", () => {
        const losing = { ...LONG, markPrice: new Decimal(95) };
        render({ ctx: losing, quantity: new Decimal(1), onChange: vi.fn() });
        expect(host.textContent).toContain("-5.00");
    });

    it("reports nothing remaining after a full close", () => {
        render({ quantity: new Decimal(2), onChange: vi.fn() });
        const line = host.textContent ?? "";
        expect(line).toContain(`${lookup("positionsList.remainingAfter")}: 0`);
    });
});
