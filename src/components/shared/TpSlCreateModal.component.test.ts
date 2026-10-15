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
 * FEAT-0070 — creating TP/SL where none exists.
 *
 * The position given to this modal has a zero entry price, deliberately —
 * that makes `tpSlContext` unavailable and the plain-input fallback render
 * instead of `TpSlPriceInput`'s slider, the same degrade path
 * `TpSlEditModal.component.test.ts` uses to test a save without driving a
 * range input. What is under test here is which endpoint gets called with
 * what, not the slider — that component has its own tests.
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

const placePositionTpSl = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
const placeTpSlOrder = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
const modifyTpSlOrder = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
const modifyPositionTpSl = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock("../../services/exchange", () => ({
    activeExchange: () => ({
        trading: { placePositionTpSl, placeTpSlOrder, modifyTpSlOrder, modifyPositionTpSl },
    }),
}));

const plansFor = vi.hoisted(() => vi.fn(() => ({} as Record<string, unknown>)));
const invalidate = vi.hoisted(() => vi.fn());
vi.mock("../../stores/tpsl.svelte", () => ({
    tpSlState: { plansFor, invalidate },
}));

vi.mock("../../stores/market.svelte", () => ({
    marketState: { symbolMeta: { BTCUSDT: { symbol: "BTCUSDT", quotePrecision: 2 } } },
}));

/*
 * `ModalFrame` renders nothing where it is declared — it hands its `children`
 * snippet to the WindowManager. The stub invokes the snippet in place; see
 * the sibling `TpSlEditModal.component.test.ts` for the same setup.
 */
vi.mock("./ModalFrame.svelte", async () => ({
    default: (await import("../../tests/helpers/PassthroughModalFrame.svelte")).default,
}));

import TpSlCreateModal from "./TpSlCreateModal.svelte";

/** Zero entry price, deliberately — see the file header. */
const POSITION = {
    positionId: "pos-1",
    symbol: "BTCUSDT",
    side: "long" as const,
    amount: new Decimal(2),
    entryPrice: new Decimal(0),
    unrealizedPnl: new Decimal(0),
    leverage: new Decimal(10),
    marginMode: "isolated" as const,
};

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    plansFor.mockReturnValue({});
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host?.remove();
});

function settle() {
    flushSync();
}

async function settleAsync(rounds = 8) {
    for (let i = 0; i < rounds; i++) {
        flushSync();
        await Promise.resolve();
    }
    flushSync();
}

function render(position: Record<string, unknown> = POSITION) {
    component = mount(TpSlCreateModal, {
        target: host,
        props: { position, onclose: vi.fn(), onsuccess: vi.fn() },
    }) as never;
    settle();
}

function field(id: string): HTMLInputElement {
    const el = host.querySelector<HTMLInputElement>(`#${id}`);
    expect(el, `no #${id} in:\n${host.innerHTML}`).toBeTruthy();
    return el!;
}

function setValue(el: HTMLInputElement, value: string) {
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    settle();
}

function buttonSaying(text: string): HTMLButtonElement {
    // includes(), not startsWith(): the partial-section toggle prefixes its
    // label with a ▸/▾ disclosure glyph.
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>("button"));
    const match = buttons.find((b) => b.textContent?.trim().includes(text));
    expect(match, `no "${text}" button in:\n${host.innerHTML}`).toBeTruthy();
    return match!;
}

/**
 * Both sections' submit buttons read "Create". Once the partial section is
 * open, its own submit is the *last* one in DOM order — the position-wide
 * button renders above it and would otherwise be picked by `buttonSaying`'s
 * first-match.
 */
function partialSubmitButton(): HTMLButtonElement {
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).filter((b) =>
        b.textContent?.trim().includes(lookup("modals.createTpSl.submit")),
    );
    expect(buttons.length, `expected two submit buttons, found ${buttons.length}`).toBe(2);
    return buttons[buttons.length - 1];
}

describe("FEAT-0070 — position-wide create", () => {
    it("creates a take-profit-only plan through the position endpoint", async () => {
        render();

        setValue(field("tpsl-create-tp-price"), "70000");
        buttonSaying(lookup("modals.createTpSl.submit")).click();
        await settleAsync();

        expect(placePositionTpSl).toHaveBeenCalledTimes(1);
        const sent = placePositionTpSl.mock.calls[0][0] as {
            symbol: string;
            positionId: string;
            takeProfit?: { price: Decimal };
            stopLoss?: { price: Decimal };
        };
        expect(sent.symbol).toBe("BTCUSDT");
        expect(sent.positionId).toBe("pos-1");
        expect(sent.takeProfit?.price.toString()).toBe("70000");
        expect(sent.stopLoss).toBeUndefined();
    });

    it("sends both legs when both prices are given", async () => {
        render();

        setValue(field("tpsl-create-tp-price"), "70000");
        setValue(field("tpsl-create-sl-price"), "55000");
        buttonSaying(lookup("modals.createTpSl.submit")).click();
        await settleAsync();

        const sent = placePositionTpSl.mock.calls[0][0] as {
            takeProfit?: { price: Decimal };
            stopLoss?: { price: Decimal };
        };
        expect(sent.takeProfit?.price.toString()).toBe("70000");
        expect(sent.stopLoss?.price.toString()).toBe("55000");
    });

    it("defaults the trigger type to mark price, matching the modify flow (AC#4)", async () => {
        render();

        expect(host.querySelector<HTMLSelectElement>("#tpsl-create-trigger-type")!.value).toBe(
            "MARK_PRICE",
        );

        setValue(field("tpsl-create-tp-price"), "70000");
        buttonSaying(lookup("modals.createTpSl.submit")).click();
        await settleAsync();

        const sent = placePositionTpSl.mock.calls[0][0] as {
            takeProfit?: { stopType?: string };
        };
        expect(sent.takeProfit?.stopType).toBe("MARK_PRICE");
    });

    it("offers both trigger types", () => {
        render();

        const options = Array.from(
            host.querySelectorAll<HTMLOptionElement>("#tpsl-create-trigger-type option"),
        ).map((o) => o.value);
        expect(options).toEqual(["MARK_PRICE", "LAST_PRICE"]);
    });

    it("does not call the transport with neither leg filled in", async () => {
        render();

        const btn = buttonSaying(lookup("modals.createTpSl.submit"));
        expect(btn.disabled).toBe(true);
        expect(placePositionTpSl).not.toHaveBeenCalled();
    });
});

describe("BUG-0688 — one form edits both legs of a position-wide plan", () => {
    /** The plan shape `normalizeTpSlRow` produces; `workingType` carries the stop type. */
    const positionPlan = (planType: "PROFIT" | "LOSS", triggerPrice: string, workingType?: string) => ({
        orderId: `123-${planType === "PROFIT" ? "tp" : "sl"}`,
        sourceOrderId: "123",
        symbol: "BTCUSDT",
        planType,
        triggerPrice,
        status: "NEW",
        scopeGuess: "position",
        ...(workingType !== undefined ? { workingType } : {}),
    });

    it("prefills a covered take-profit and keeps it editable", () => {
        // The BUG-0688 defect: a covered leg used to render as a read-only
        // line behind an "Edit" link, which opened a second modal — so a
        // bracket change took two dialogs and saving the first closed both.
        plansFor.mockReturnValue({ profit: positionPlan("PROFIT", "50000") });
        render();

        expect(field("tpsl-create-tp-price").value).toBe("50000");
    });

    it("keeps the uncovered leg editable alongside it", () => {
        plansFor.mockReturnValue({ profit: positionPlan("PROFIT", "50000") });
        render();

        expect(host.querySelector("#tpsl-create-sl-price")).not.toBeNull();
    });

    it("offers one Save — not an Edit link — when a plan exists", () => {
        plansFor.mockReturnValue({ profit: positionPlan("PROFIT", "50000") });
        render();

        expect(buttonSaying(lookup("common.save"))).toBeTruthy();
        // No second dialog is reachable from here any more: the old "Edit"
        // link is gone, so nothing opens on top of this form.
        const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).map(
            (b) => b.textContent?.trim() ?? "",
        );
        expect(buttons).not.toContain("Edit");
    });

    it("edits both legs in a single save", async () => {
        plansFor.mockReturnValue({
            profit: positionPlan("PROFIT", "50000"),
            loss: positionPlan("LOSS", "45000"),
        });
        render();

        setValue(field("tpsl-create-tp-price"), "51000");
        buttonSaying(lookup("common.save")).click();
        await settleAsync();

        expect(placePositionTpSl).not.toHaveBeenCalled();
        expect(modifyPositionTpSl).toHaveBeenCalledTimes(1);
        const sent = modifyPositionTpSl.mock.calls[0][0] as {
            takeProfit?: { price: Decimal };
            stopLoss?: { price: Decimal };
        };
        // The untouched stop travels exactly as the form shows it, and the
        // dialog closes once — not once per leg.
        expect(sent.takeProfit?.price.toString()).toBe("51000");
        expect(sent.stopLoss?.price.toString()).toBe("45000");
        // No second modal was opened on the way.
        expect(host.querySelector('input[name="tpslTriggerPrice"]')).toBeNull();
    });

    it("refuses to clear a leg that is set", async () => {
        // `position/modify_order` says nothing about the leg a request omits,
        // so an emptied field must not be guessed away: removing a leg stays
        // in the TP/SL list's cancel action.
        plansFor.mockReturnValue({
            profit: positionPlan("PROFIT", "50000"),
            loss: positionPlan("LOSS", "45000"),
        });
        render();

        setValue(field("tpsl-create-tp-price"), "");
        buttonSaying(lookup("common.save")).click();
        await settleAsync();

        expect(host.textContent).toContain(lookup("modals.createTpSl.legCannotBeCleared"));
        expect(modifyPositionTpSl).not.toHaveBeenCalled();
        expect(placePositionTpSl).not.toHaveBeenCalled();
    });

    it("does not gate create on a partial plan — only a position-wide one blocks it", () => {
        // The "one per position" limit is documented for the position-wide
        // endpoint only; several partial plans can coexist, so a partial
        // take-profit must not stop the trader from also creating a
        // position-wide one.
        plansFor.mockReturnValue({
            profit: {
                orderId: "9-tp",
                sourceOrderId: "9",
                symbol: "BTCUSDT",
                planType: "PROFIT",
                triggerPrice: "50000",
                status: "NEW",
                scopeGuess: "partial",
            },
        });
        render();

        expect(host.querySelector("#tpsl-create-tp-price")).not.toBeNull();
    });

    describe("BUG-0687 — adding the missing leg modifies the plan instead of replacing it", () => {
        it("sends both legs through the modify endpoint when a take-profit is already set", async () => {
            plansFor.mockReturnValue({ profit: positionPlan("PROFIT", "50000") });
            render();

            setValue(field("tpsl-create-sl-price"), "45000");
            buttonSaying(lookup("common.save")).click();
            await settleAsync();

            // The defect: a second place-order with only the stop, which the
            // venue treats as a replacement and which cancelled the target.
            expect(placePositionTpSl).not.toHaveBeenCalled();

            expect(modifyPositionTpSl).toHaveBeenCalledTimes(1);
            const sent = modifyPositionTpSl.mock.calls[0][0] as {
                symbol: string;
                positionId: string;
                takeProfit?: { price: Decimal; stopType?: string };
                stopLoss?: { price: Decimal; stopType?: string };
            };
            expect(sent.symbol).toBe("BTCUSDT");
            expect(sent.positionId).toBe("pos-1");
            // The leg that is already set travels prefilled, the new one as
            // entered — both in one request.
            expect(sent.takeProfit?.price.toString()).toBe("50000");
            expect(sent.stopLoss?.price.toString()).toBe("45000");
        });

        it("prefills the plan's trigger type and applies it to both legs", async () => {
            plansFor.mockReturnValue({
                profit: positionPlan("PROFIT", "50000", "LAST_PRICE"),
            });
            render();

            // One form produces one request, so one select governs both legs;
            // it opens on the plan's own type rather than resetting to a
            // default the trader never chose.
            expect(
                host.querySelector<HTMLSelectElement>("#tpsl-create-trigger-type")!.value,
            ).toBe("LAST_PRICE");

            setValue(field("tpsl-create-sl-price"), "45000");
            buttonSaying(lookup("common.save")).click();
            await settleAsync();

            const sent = modifyPositionTpSl.mock.calls[0][0] as {
                takeProfit?: { stopType?: string };
                stopLoss?: { stopType?: string };
            };
            expect(sent.takeProfit?.stopType).toBe("LAST_PRICE");
            expect(sent.stopLoss?.stopType).toBe("LAST_PRICE");
        });

        it("mirrors the case — a stop is set and the target is added", async () => {
            plansFor.mockReturnValue({ loss: positionPlan("LOSS", "45000") });
            render();

            setValue(field("tpsl-create-tp-price"), "55000");
            buttonSaying(lookup("common.save")).click();
            await settleAsync();

            expect(placePositionTpSl).not.toHaveBeenCalled();
            const sent = modifyPositionTpSl.mock.calls[0][0] as {
                takeProfit?: { price: Decimal };
                stopLoss?: { price: Decimal };
            };
            expect(sent.takeProfit?.price.toString()).toBe("55000");
            expect(sent.stopLoss?.price.toString()).toBe("45000");
        });

        it("still places — never modifies — a position with no leg covered", async () => {
            render();

            setValue(field("tpsl-create-tp-price"), "70000");
            buttonSaying(lookup("modals.createTpSl.submit")).click();
            await settleAsync();

            expect(placePositionTpSl).toHaveBeenCalledTimes(1);
            expect(modifyPositionTpSl).not.toHaveBeenCalled();
        });
    });
});

describe("FEAT-0070 — partial create with an explicit quantity", () => {
    function openPartial() {
        buttonSaying(lookup("modals.createTpSl.partial")).click();
        settle();
    }

    it("targets the partial endpoint with the given quantity", async () => {
        render();
        openPartial();

        setValue(field("tpsl-create-partial-tp"), "70000");
        setValue(field("tpsl-create-partial-qty"), "0.5");
        partialSubmitButton().click();
        await settleAsync();

        expect(placeTpSlOrder).toHaveBeenCalledTimes(1);
        const sent = placeTpSlOrder.mock.calls[0][0] as {
            takeProfit?: { price: Decimal; qty: Decimal };
        };
        expect(sent.takeProfit?.price.toString()).toBe("70000");
        expect(sent.takeProfit?.qty.toString()).toBe("0.5");
    });

    it("refuses a quantity larger than the position size", async () => {
        render();
        openPartial();

        setValue(field("tpsl-create-partial-tp"), "70000");
        setValue(field("tpsl-create-partial-qty"), "5"); // position is 2
        partialSubmitButton().click();
        await settleAsync();

        expect(placeTpSlOrder).not.toHaveBeenCalled();
        expect(host.textContent).toContain(lookup("modals.createTpSl.qtyExceedsPosition"));
    });

    it("does not require a quantity before the section is opened", () => {
        // The partial section starts collapsed; its empty, unvalidated
        // inputs must not block the position-wide submit button above it.
        render();

        setValue(field("tpsl-create-tp-price"), "70000");
        const btn = buttonSaying(lookup("modals.createTpSl.submit"));
        expect(btn.disabled).toBe(false);
    });
});

describe("FEAT-0070 — a position with no id cannot be given a plan", () => {
    it("refuses rather than sending a request with no positionId", async () => {
        render({ ...POSITION, positionId: undefined });

        setValue(field("tpsl-create-tp-price"), "70000");
        buttonSaying(lookup("modals.createTpSl.submit")).click();
        await settleAsync();

        expect(placePositionTpSl).not.toHaveBeenCalled();
        expect(host.textContent).toContain(lookup("modals.createTpSl.missingPositionId"));
    });
});

describe("BUG-0550 — a wrong-side price never reaches the transport", () => {
    it("keeps a long stop above entry local and says why", async () => {
        render({ ...POSITION, entryPrice: new Decimal(100) });

        // The slider section renders against the live entry: a stop above it
        // is the wrong protection direction. Committing it must neither call
        // the transport nor go quiet — the field explains itself instead.
        const input = field("tpsl-trigger-SL");
        setValue(input, "105");
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        settle();

        expect(host.textContent).toContain(lookup("dashboard.tpslManager.invalidPrice"));

        buttonSaying(lookup("modals.createTpSl.submit")).click();
        await settleAsync();

        expect(placePositionTpSl).not.toHaveBeenCalled();
    });
});
