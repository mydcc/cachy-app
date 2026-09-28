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
 * FEAT-0346 — AdjustMarginModal is the one place a trader moves margin on a
 * live isolated position. The sign of the request is the whole instruction
 * (add positive, reduce negative), a withdrawal above the margin can only be
 * refused, and cross positions have no margin of their own to move.
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

vi.mock("./ModalFrame.svelte", async () => ({
    default: (await import("../../tests/helpers/PassthroughModalFrame.svelte")).default,
}));

const { adjustSpy } = vi.hoisted(() => ({
    adjustSpy: vi.fn(
        async (_request: {
            symbol: string;
            side: string;
            positionId?: string;
            amount: { eq: (n: number) => boolean };
        }) => ({ ok: true }),
    ),
}));
vi.mock("../../services/exchange", () => ({
    activeExchange: () => ({ account: { adjustPositionMargin: adjustSpy } }),
}));

vi.mock("../../utils/errorUtils", () => ({
    getDisplayMessage: (e: unknown) => (e instanceof Error ? e.message : "mapped error"),
}));

vi.mock("../../utils/utils", () => ({
    formatDynamicDecimal: (value: unknown) => (value == null ? "-" : String(value)),
}));

import AdjustMarginModal from "./AdjustMarginModal.svelte";
import type { OMSPosition } from "../../services/omsTypes";

const ISOLATED: OMSPosition = {
    positionId: "p1",
    symbol: "BTCUSDT",
    side: "long",
    amount: new Decimal(2),
    entryPrice: new Decimal(100),
    unrealizedPnl: new Decimal(10),
    leverage: new Decimal(10),
    marginMode: "isolated",
    margin: new Decimal(100),
    markPrice: new Decimal(100),
};

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

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

async function settle(rounds = 6) {
    for (let i = 0; i < rounds; i++) {
        flushSync();
        await Promise.resolve();
    }
    flushSync();
}

function render(position: OMSPosition | null, props: Record<string, unknown> = {}) {
    component = mount(AdjustMarginModal, {
        target: host,
        props: { position, onclose: vi.fn(), onsuccess: vi.fn(), ...props },
    }) as never;
}

function buttonByText(text: string): HTMLButtonElement | null {
    return (
        [...host.querySelectorAll<HTMLButtonElement>("button")].find(
            (b) => b.textContent?.trim() === text,
        ) ?? null
    );
}

function amountInput(): HTMLInputElement {
    const input = host.querySelector<HTMLInputElement>('input[inputmode="decimal"]');
    if (!input) throw new Error("amount input not rendered");
    return input;
}

function typeAmount(value: string) {
    const input = amountInput();
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
}

describe("FEAT-0346 — AdjustMarginModal signs the margin request", () => {
    it("adds a positive amount and reports success", async () => {
        const onsuccess = vi.fn();
        render(ISOLATED, { onsuccess });
        await settle();

        typeAmount("50");
        buttonByText(lookup("modals.adjustMargin.submitAdd"))?.click();
        await settle();

        expect(adjustSpy).toHaveBeenCalledTimes(1);
        const args = adjustSpy.mock.calls[0][0];
        expect(args.symbol).toBe("BTCUSDT");
        expect(args.side).toBe("LONG");
        expect(args.positionId).toBe("p1");
        expect(args.amount.eq(50)).toBe(true);
        expect(onsuccess).toHaveBeenCalledTimes(1);
    });

    it("sends a reduction as a negative amount", async () => {
        render(ISOLATED);
        await settle();

        buttonByText(lookup("modals.adjustMargin.reduce"))?.click();
        typeAmount("40");
        buttonByText(lookup("modals.adjustMargin.submitReduce"))?.click();
        await settle();

        expect(adjustSpy).toHaveBeenCalledTimes(1);
        const args = adjustSpy.mock.calls[0][0];
        expect(args.amount.eq(-40)).toBe(true);
    });

    it("refuses to withdraw more margin than the position holds", async () => {
        render(ISOLATED);
        await settle();

        buttonByText(lookup("modals.adjustMargin.reduce"))?.click();
        typeAmount("500");

        const submit = buttonByText(lookup("modals.adjustMargin.submitReduce"));
        expect(submit?.disabled).toBe(true);

        submit?.click();
        await settle();
        expect(adjustSpy).not.toHaveBeenCalled();
    });

    it("offers no margin controls on a cross position", async () => {
        render({ ...ISOLATED, marginMode: "cross" });
        await settle();

        expect(host.textContent).toContain(lookup("modals.adjustMargin.crossOnly"));
        expect(amountInput).toThrow();
        expect(host.querySelector('input[inputmode="decimal"]')).toBeNull();
    });

    it("surfaces the exchange's reason when the request fails", async () => {
        adjustSpy.mockRejectedValueOnce(new Error("margin below maintenance"));
        const onsuccess = vi.fn();
        render(ISOLATED, { onsuccess });
        await settle();

        typeAmount("50");
        buttonByText(lookup("modals.adjustMargin.submitAdd"))?.click();
        await settle();

        expect(host.textContent).toContain("margin below maintenance");
        expect(onsuccess).not.toHaveBeenCalled();
    });
});

describe("BUG-0554 — AdjustMarginModal projects the liquidation consequence", () => {
    const LONG_LIQ: OMSPosition = {
        ...ISOLATED,
        amount: new Decimal(1),
        entryPrice: new Decimal(100),
        margin: new Decimal(10),
        leverage: new Decimal(10),
        liquidationPrice: new Decimal(90),
    };
    const SHORT_LIQ: OMSPosition = {
        ...LONG_LIQ,
        side: "short",
        liquidationPrice: new Decimal(110),
    };

    function ackCheckbox(): HTMLInputElement | null {
        return host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    }

    it("long add shows the projected liquidation farther from entry with no gate", async () => {
        render(LONG_LIQ);
        await settle();

        typeAmount("10");
        await settle();

        expect(host.textContent).toContain(lookup("modals.adjustMargin.projectedLiquidation"));
        // notional 100, newMargin 20 → lev 5 → 100 * (1 - 1/5) = 80.
        expect(host.textContent).toContain("80");
        expect(host.textContent).toContain(lookup("modals.adjustMargin.movesAway"));
        expect(ackCheckbox()).toBeNull();

        const submit = buttonByText(lookup("modals.adjustMargin.submitAdd"));
        expect(submit?.disabled).toBe(false);
    });

    it("long reduce shows the projected liquidation closer and blocks submit until acknowledged", async () => {
        const onsuccess = vi.fn();
        render(LONG_LIQ, { onsuccess });
        await settle();

        buttonByText(lookup("modals.adjustMargin.reduce"))?.click();
        typeAmount("5");
        await settle();

        // notional 100, newMargin 5 → lev 20 → 100 * (1 - 1/20) = 95.
        expect(host.textContent).toContain("95");
        expect(host.textContent).toContain(lookup("modals.adjustMargin.movesCloser"));

        // The acknowledgement names explicit values, never the old value as
        // the consequence.
        const label = lookup("modals.adjustMargin.confirmReduce");
        expect(label).toContain("{currentMargin}");
        expect(label).toContain("{newMargin}");
        expect(host.textContent).toContain("10");
        expect(host.textContent).toContain("95");

        const submit = buttonByText(lookup("modals.adjustMargin.submitReduce"));
        expect(submit?.disabled).toBe(true);
        submit?.click();
        await settle();
        expect(adjustSpy).not.toHaveBeenCalled();

        ackCheckbox()?.click();
        await settle();
        expect(buttonByText(lookup("modals.adjustMargin.submitReduce"))?.disabled).toBe(false);

        buttonByText(lookup("modals.adjustMargin.submitReduce"))?.click();
        await settle();
        expect(adjustSpy).toHaveBeenCalledTimes(1);
        expect(adjustSpy.mock.calls[0][0].amount.eq(-5)).toBe(true);
        expect(onsuccess).toHaveBeenCalledTimes(1);
    });

    it("short add shows the projected liquidation farther from entry with no gate", async () => {
        render(SHORT_LIQ);
        await settle();

        typeAmount("10");
        await settle();

        // notional 100, newMargin 20 → lev 5 → 100 * (1 + 1/5) = 120.
        expect(host.textContent).toContain("120");
        expect(host.textContent).toContain(lookup("modals.adjustMargin.movesAway"));
        expect(ackCheckbox()).toBeNull();
        expect(buttonByText(lookup("modals.adjustMargin.submitAdd"))?.disabled).toBe(false);
    });

    it("short reduce shows the projected liquidation closer and blocks submit until acknowledged", async () => {
        render(SHORT_LIQ);
        await settle();

        buttonByText(lookup("modals.adjustMargin.reduce"))?.click();
        typeAmount("5");
        await settle();

        // notional 100, newMargin 5 → lev 20 → 100 * (1 + 1/20) = 105.
        expect(host.textContent).toContain("105");
        expect(host.textContent).toContain(lookup("modals.adjustMargin.movesCloser"));

        const submit = buttonByText(lookup("modals.adjustMargin.submitReduce"));
        expect(submit?.disabled).toBe(true);

        ackCheckbox()?.click();
        await settle();
        expect(buttonByText(lookup("modals.adjustMargin.submitReduce"))?.disabled).toBe(false);
    });

    it("states unmeasurable when the liquidation price is missing but still allows submit", async () => {
        render(ISOLATED);
        await settle();

        typeAmount("50");
        await settle();

        expect(host.textContent).toContain(lookup("modals.adjustMargin.unmeasurable"));
        expect(host.textContent).not.toContain(
            lookup("modals.adjustMargin.projectedLiquidation"),
        );
        expect(buttonByText(lookup("modals.adjustMargin.submitAdd"))?.disabled).toBe(false);
    });

    it("full withdrawal shows the closing state and blocks submit until acknowledged", async () => {
        const onsuccess = vi.fn();
        render(LONG_LIQ, { onsuccess });
        await settle();

        buttonByText(lookup("modals.adjustMargin.reduce"))?.click();
        typeAmount("10");
        await settle();

        // The whole isolated buffer (margin 10) is withdrawn: no liquidation
        // price is projected, and the closing consequence needs its own ack.
        expect(host.textContent).toContain(lookup("modals.adjustMargin.closingText"));
        expect(host.textContent).not.toContain(
            lookup("modals.adjustMargin.projectedLiquidation"),
        );
        expect(host.textContent).toContain("keeps no isolated margin");

        const submit = buttonByText(lookup("modals.adjustMargin.submitReduce"));
        expect(submit?.disabled).toBe(true);
        submit?.click();
        await settle();
        expect(adjustSpy).not.toHaveBeenCalled();

        ackCheckbox()?.click();
        await settle();
        expect(buttonByText(lookup("modals.adjustMargin.submitReduce"))?.disabled).toBe(false);

        buttonByText(lookup("modals.adjustMargin.submitReduce"))?.click();
        await settle();
        expect(adjustSpy).toHaveBeenCalledTimes(1);
        expect(adjustSpy.mock.calls[0][0].amount.eq(-10)).toBe(true);
        expect(onsuccess).toHaveBeenCalledTimes(1);
    });
});
