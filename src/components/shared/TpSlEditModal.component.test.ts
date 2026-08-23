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
 * FEAT-0254 through the modal: the price the slider put on screen is the
 * price that reaches `modifyTpSlOrder`.
 *
 * `TpSlPriceInput.component.test.ts` proves the component emits the right
 * `Decimal`. This proves the modal does not lose or re-derive it on the way
 * to the transport — the same displayed-state discipline FEAT-0011 applies at
 * the gate, checked one layer earlier.
 *
 * It also covers the fallback: a plan whose position is no longer open has no
 * entry price or size to compute against, and must degrade to the plain
 * trigger-price field rather than render a slider over assumed numbers.
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

/** The transport the modal ultimately calls. */
const modifyTpSlOrder = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock("../../services/exchange", () => ({
    activeExchange: () => ({ trading: { modifyTpSlOrder } }),
}));

/** Entry 100, 10x, 2 contracts long — the fixture the other two tests use. */
const positions = vi.hoisted(() => ({
    current: [] as Array<Record<string, unknown>>,
}));
vi.mock("../../stores/account.svelte", () => ({
    accountState: {
        get positions() {
            return positions.current;
        },
    },
}));

vi.mock("../../stores/market.svelte", () => ({
    marketState: {
        symbolMeta: { BTCUSDT: { symbol: "BTCUSDT", quotePrecision: 2 } },
    },
}));

/*
 * `ModalFrame` renders nothing where it is declared — it hands its `children`
 * snippet to the WindowManager, and `WindowContainer` renders it elsewhere.
 * Mounting this modal without the window stack therefore produces an empty
 * container, and every "is it absent?" assertion passes for the wrong reason.
 * The stub invokes the snippet in place. See the helper's own comment.
 */
vi.mock("./ModalFrame.svelte", async () => ({
    default: (await import("../../tests/helpers/PassthroughModalFrame.svelte")).default,
}));

import TpSlEditModal from "./TpSlEditModal.svelte";

const OPEN_POSITION = {
    positionId: "p-1",
    symbol: "BTCUSDT",
    side: "long",
    size: new Decimal(2),
    entryPrice: new Decimal(100),
    leverage: new Decimal(10),
};

const PLAN = {
    orderId: "plan-1",
    symbol: "BTCUSDT",
    planType: "PROFIT" as const,
    triggerPrice: "110",
    status: "NEW",
};

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    positions.current = [];
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

function render(order: Record<string, unknown> = PLAN) {
    component = mount(TpSlEditModal, {
        target: host,
        props: { order, onclose: vi.fn(), onsuccess: vi.fn() },
    }) as never;
    settle();
}

const slider = () => host.querySelector<HTMLInputElement>('input[type="range"]');
const plainTriggerField = () => host.querySelector<HTMLInputElement>('input[name="tpslTriggerPrice"]');

function saveButton(): HTMLButtonElement {
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>("button"));
    const match = buttons.find((b) => b.textContent?.trim() === lookup("common.save"));
    expect(match, `no save button in:\n${host.innerHTML}`).toBeTruthy();
    return match!;
}

async function settleAsync(rounds = 8) {
    for (let i = 0; i < rounds; i++) {
        flushSync();
        await Promise.resolve();
    }
    flushSync();
}

describe("FEAT-0254 — the modal submits what the slider showed", () => {
    it("renders the slider when the plan's position is open", () => {
        positions.current = [OPEN_POSITION];
        render();
        expect(slider()).not.toBeNull();
    });

    it("sends the slider's price, not the price the modal opened with", async () => {
        positions.current = [OPEN_POSITION];
        render();

        const range = slider()!;
        range.value = "60"; // +30% ROI at 10x → +3% → 103
        range.dispatchEvent(new Event("input", { bubbles: true }));
        settle();

        saveButton().click();
        await settleAsync();

        expect(modifyTpSlOrder).toHaveBeenCalledTimes(1);
        const sent = modifyTpSlOrder.mock.calls[0][0] as unknown as Record<string, string>;
        expect(sent.triggerPrice).toBe("103");
        expect(sent.orderId).toBe("plan-1");
        expect(sent.planType).toBe("PROFIT");
    });

    it("still sends the untouched price when nothing is dragged", async () => {
        positions.current = [OPEN_POSITION];
        render();

        saveButton().click();
        await settleAsync();

        const sent = modifyTpSlOrder.mock.calls[0][0] as unknown as Record<string, string>;
        expect(sent.triggerPrice).toBe("110");
    });
});

describe("FEAT-0254 — degrading when the position is gone", () => {
    it("falls back to the plain trigger field rather than guessing a context", () => {
        positions.current = []; // plan outlived its position
        render();

        expect(slider()).toBeNull();
        expect(plainTriggerField()).not.toBeNull();
        expect(plainTriggerField()!.value).toBe("110");
    });

    it("still saves through the plain field", async () => {
        positions.current = [];
        render();

        const field = plainTriggerField()!;
        field.value = "120";
        field.dispatchEvent(new Event("input", { bubbles: true }));
        settle();

        saveButton().click();
        await settleAsync();

        expect(modifyTpSlOrder).toHaveBeenCalledTimes(1);
        const sent = modifyTpSlOrder.mock.calls[0][0] as unknown as Record<string, string>;
        expect(sent.triggerPrice).toBe("120");
    });

    it("does not offer the slider for a position whose size collapsed to zero", () => {
        positions.current = [{ ...OPEN_POSITION, size: new Decimal(0) }];
        render();
        expect(slider()).toBeNull();
    });
});
