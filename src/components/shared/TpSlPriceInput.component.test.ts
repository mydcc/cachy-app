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
 * FEAT-0254's two load-bearing acceptance criteria, the ones that cannot be
 * proven by testing `tpsl.ts` alone:
 *
 *   - the slider and the two number fields stay in sync in both directions,
 *   - the price the component *shows* is the price it *emits*.
 *
 * `tpsl.test.ts` covers the arithmetic. This covers the wiring, which is
 * where a component with three views of one value goes wrong.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { Decimal } from "decimal.js";
import en from "../../locales/locales/en.json";
import type { TpSlContext } from "../../lib/calculators/tpsl";

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

import TpSlPriceInput from "./TpSlPriceInput.svelte";

/** Entry 100, 10x, 2 contracts — the same fixture `tpsl.test.ts` reasons about. */
const LONG: TpSlContext = {
    entryPrice: new Decimal(100),
    leverage: new Decimal(10),
    side: "LONG",
    positionSize: new Decimal(2),
};

const TICK = new Decimal("0.01");

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

function settle() {
    flushSync();
}

function render(props: {
    ctx?: TpSlContext;
    kind?: "TP" | "SL";
    price: Decimal;
    onChange: (p: Decimal) => void;
}) {
    component = mount(TpSlPriceInput, {
        target: host,
        props: {
            ctx: props.ctx ?? LONG,
            kind: props.kind ?? "TP",
            tickSize: TICK,
            price: props.price,
            onChange: props.onChange,
        },
    }) as never;
    settle();
}

const slider = () => host.querySelector<HTMLInputElement>('input[type="range"]')!;
const triggerField = () => host.querySelector<HTMLInputElement>('input[name^="tpslTrigger"]')!;
const targetField = () => host.querySelector<HTMLInputElement>('input[name^="tpslTarget"]')!;

function tabButton(label: string): HTMLButtonElement {
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('button[role="tab"]'));
    const match = buttons.find((b) => b.textContent?.trim() === label);
    expect(match, `no tab labelled "${label}" in:\n${host.innerHTML}`).toBeTruthy();
    return match!;
}

function typeInto(field: HTMLInputElement, text: string) {
    field.value = text;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    settle();
    field.dispatchEvent(new Event("blur", { bubbles: true }));
    settle();
}

describe("FEAT-0254 — slider, target and trigger stay one value", () => {
    it("shows the trigger price it was given", () => {
        render({ price: new Decimal("110"), onChange: vi.fn() });
        expect(triggerField().value).toBe("110");
    });

    it("derives the ROI target from the price — 110 on a 10x long entered at 100 is +100%", () => {
        render({ price: new Decimal("110"), onChange: vi.fn() });
        expect(targetField().value).toBe("100");
    });

    it("emits a price when the slider moves, not a float", () => {
        const onChange = vi.fn();
        render({ price: new Decimal("100"), onChange });

        // Default ROI mode, step 0.5% ROI → index 60 is +30% ROI → +3% price.
        const range = slider();
        range.value = "60";
        range.dispatchEvent(new Event("input", { bubbles: true }));
        settle();

        expect(onChange).toHaveBeenCalledTimes(1);
        const emitted = onChange.mock.calls[0][0] as Decimal;
        expect(emitted).toBeInstanceOf(Decimal);
        expect(emitted.toString()).toBe("103");
    });

    it("turns a typed target back into a price", () => {
        const onChange = vi.fn();
        render({ price: new Decimal("100"), onChange });

        typeInto(targetField(), "50");

        // +50% ROI at 10x = +5% price = 105.
        expect(onChange).toHaveBeenCalled();
        expect((onChange.mock.calls.at(-1)![0] as Decimal).toString()).toBe("105");
    });

    it("passes a typed trigger price through, rounded to the tick", () => {
        const onChange = vi.fn();
        render({ price: new Decimal("100"), onChange });

        typeInto(triggerField(), "107.037");

        expect((onChange.mock.calls.at(-1)![0] as Decimal).toString()).toBe("107.04");
    });

    it("ignores a non-numeric trigger instead of emitting NaN", () => {
        const onChange = vi.fn();
        render({ price: new Decimal("100"), onChange });

        typeInto(triggerField(), "abc");

        expect(onChange).not.toHaveBeenCalled();
    });

    it("ignores a non-positive trigger price", () => {
        const onChange = vi.fn();
        render({ price: new Decimal("100"), onChange });

        typeInto(triggerField(), "-5");

        expect(onChange).not.toHaveBeenCalled();
    });
});

describe("FEAT-0254 — calculation modes", () => {
    it("switching to Change restates the same price as a raw percentage", () => {
        render({ price: new Decimal("110"), onChange: vi.fn() });
        expect(targetField().value).toBe("100"); // ROI

        tabButton(lookup("dashboard.tpslManager.byChange")).click();
        settle();

        // Same price, leverage removed: +10%.
        expect(targetField().value).toBe("10");
        expect(triggerField().value).toBe("110");
    });

    it("switching to PnL restates the same price as an absolute amount", () => {
        render({ price: new Decimal("110"), onChange: vi.fn() });

        tabButton(lookup("dashboard.tpslManager.byPnl")).click();
        settle();

        // 2 contracts × 10 price move = 20 USDT.
        expect(targetField().value).toBe("20");
        expect(triggerField().value).toBe("110");
    });

    it("a target typed in PnL mode is read as USDT, not as a percentage", () => {
        const onChange = vi.fn();
        render({ price: new Decimal("100"), onChange });

        tabButton(lookup("dashboard.tpslManager.byPnl")).click();
        settle();
        typeInto(targetField(), "50");

        // 50 USDT over 2 contracts = +25 on the price.
        expect((onChange.mock.calls.at(-1)![0] as Decimal).toString()).toBe("125");
    });
});

describe("FEAT-0254 — a stop is the same slider pointing the other way", () => {
    it("puts a long's stop below entry for a positive slider magnitude", () => {
        const onChange = vi.fn();
        render({ kind: "SL", price: new Decimal("100"), onChange });

        const range = slider();
        range.value = "60"; // 30% ROI of loss
        range.dispatchEvent(new Event("input", { bubbles: true }));
        settle();

        // -30% ROI at 10x = -3% price.
        expect((onChange.mock.calls.at(-1)![0] as Decimal).toString()).toBe("97");
    });

    it("shows a stop's distance as a positive magnitude", () => {
        // 97 on a long entered at 100 is a 30% ROI loss; the field says 30,
        // because a trader setting a stop thinks "30% loss", not "-30% gain".
        render({ kind: "SL", price: new Decimal("97"), onChange: vi.fn() });
        expect(targetField().value).toBe("30");
    });

    it("stops short of liquidation — the stop slider cannot reach -100% ROI", () => {
        const onChange = vi.fn();
        render({ kind: "SL", price: new Decimal("100"), onChange });

        const range = slider();
        range.value = range.max; // as far as the control goes
        range.dispatchEvent(new Event("input", { bubbles: true }));
        settle();

        // 75% of margin, not 100% — 90 would be liquidation at 10x.
        expect((onChange.mock.calls.at(-1)![0] as Decimal).toString()).toBe("92.5");
    });

    it("lets a take-profit reach further than a stop", () => {
        const onChange = vi.fn();
        render({ kind: "TP", price: new Decimal("100"), onChange });

        const range = slider();
        range.value = range.max;
        range.dispatchEvent(new Event("input", { bubbles: true }));
        settle();

        // 150% ROI at 10x = +15% price.
        expect((onChange.mock.calls.at(-1)![0] as Decimal).toString()).toBe("115");
    });
});
