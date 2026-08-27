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
 * FEAT-0068 — the preconditions, as the trade panel enforces them.
 *
 * Two acceptance criteria are pinned here. A leverage outside the pair's own
 * min/max is refused before it travels, and a control the exchange documents
 * a precondition for is *disabled carrying the reason* rather than hidden —
 * the same rule PlaceOrderPanel's capability tests hold, for the same reason:
 * a control that vanishes reads as a feature Cachy lacks.
 *
 * The claim being tested each time is the absence of a request, not the
 * presence of a message. The message is the courtesy; the unsent request is
 * the guarantee.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { Decimal } from "decimal.js";
import en from "../../locales/locales/en.json";

vi.mock("../../services/logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const settings = vi.hoisted(() => ({ apiProvider: "bitunix" as string }));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settings }));

const paperStateMock = vi.hoisted(() => ({ enabled: false }));
vi.mock("../../stores/paperTrading.svelte", () => ({ paperState: paperStateMock }));

const tradeStateMock = vi.hoisted(() => ({
    symbol: "BTCUSDT",
    leverage: "20" as string | null,
    remoteLeverage: undefined as unknown,
    remoteMarginMode: "ISOLATION" as string | undefined,
}));
vi.mock("../../stores/trade.svelte", () => ({ tradeState: tradeStateMock }));

const marketStateMock = vi.hoisted(() => ({
    symbolMeta: {} as Record<string, unknown>,
}));
vi.mock("../../stores/market.svelte", () => ({ marketState: marketStateMock }));

const accountStateMock = vi.hoisted(() => ({
    positions: [] as Array<{ symbol: string }>,
    openOrders: [] as Array<{ symbol: string }>,
    positionMode: "ONE_WAY" as string | undefined,
}));
vi.mock("../../stores/account.svelte", () => ({ accountState: accountStateMock }));

const modalMock = vi.hoisted(() => ({ show: vi.fn(async () => true) }));
vi.mock("../../stores/modal.svelte", () => ({ modalState: modalMock }));

const toastMock = vi.hoisted(() => ({
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    add: vi.fn(),
}));
vi.mock("../../services/toastService.svelte", () => ({ toastService: toastMock }));

const accountPort = vi.hoisted(() => ({
    changeLeverage: vi.fn(async () => undefined),
    changeMarginMode: vi.fn(async () => undefined),
    changePositionMode: vi.fn(async () => undefined),
    adjustPositionMargin: vi.fn(async () => undefined),
}));
const supportsMock = vi.hoisted(() => ({ accountSettings: true }));
vi.mock("../../services/exchange", () => ({
    activeExchange: () => ({ supports: supportsMock, account: accountPort }),
}));

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}

vi.mock("../../locales/i18n", async () => {
    const { readable: r } = await import("svelte/store");
    return {
        _: r((key: string, options?: { values?: Record<string, unknown> }) => {
            const template = lookup(key) ?? key;
            if (!options?.values) return template;
            return Object.entries(options.values).reduce(
                (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
                template,
            );
        }),
        locale: r("en"),
        setLocale: vi.fn(),
    };
});

import ExchangeAccountControls from "./ExchangeAccountControls.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    settings.apiProvider = "bitunix";
    supportsMock.accountSettings = true;
    paperStateMock.enabled = false;
    tradeStateMock.symbol = "BTCUSDT";
    tradeStateMock.leverage = "20";
    tradeStateMock.remoteLeverage = new Decimal(10);
    tradeStateMock.remoteMarginMode = "ISOLATION";
    marketStateMock.symbolMeta = { BTCUSDT: { symbol: "BTCUSDT", minLeverage: 1, maxLeverage: 50 } };
    accountStateMock.positions = [];
    accountStateMock.openOrders = [];
    accountStateMock.positionMode = "ONE_WAY";
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
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

async function render() {
    component = mount(ExchangeAccountControls, { target: host }) as never;
    await settle();
}

function button(trackId: string): HTMLButtonElement | null {
    return host.querySelector(`[data-track-id="${trackId}"]`);
}

describe("FEAT-0068 — leverage outside the pair's range never travels", () => {
    it("offers the button for a leverage inside min/max", async () => {
        await render();
        expect(button("btn-apply-leverage")?.disabled).toBe(false);
    });

    it("refuses one above the pair's maxLeverage, and says the range", async () => {
        tradeStateMock.leverage = "100"; // pair tops out at 50
        await render();

        const btn = button("btn-apply-leverage");
        expect(btn?.disabled).toBe(true);
        expect(btn?.title).toContain("50");

        btn?.click();
        await settle();
        expect(accountPort.changeLeverage).not.toHaveBeenCalled();
    });

    it("refuses one below the pair's minLeverage", async () => {
        marketStateMock.symbolMeta = {
            BTCUSDT: { symbol: "BTCUSDT", minLeverage: 5, maxLeverage: 50 },
        };
        tradeStateMock.leverage = "2";
        await render();

        expect(button("btn-apply-leverage")?.disabled).toBe(true);
        expect(accountPort.changeLeverage).not.toHaveBeenCalled();
    });

    it("does not re-send a leverage the exchange already has", async () => {
        tradeStateMock.leverage = "10";
        tradeStateMock.remoteLeverage = new Decimal(10);
        await render();

        expect(button("btn-apply-leverage")?.disabled).toBe(true);
    });

    it("sends the calculator's own leverage when it is in range", async () => {
        await render();
        button("btn-apply-leverage")?.click();
        await settle();

        expect(accountPort.changeLeverage).toHaveBeenCalledTimes(1);
        const [symbol, value] = accountPort.changeLeverage.mock.calls[0] as unknown as [
            string,
            Decimal,
        ];
        expect(symbol).toBe("BTCUSDT");
        expect(value.toString()).toBe("20");
    });

    it("asks first when the symbol carries an open position", async () => {
        // Leverage moves the liquidation price the moment it lands, which is
        // FEAT-0068's open question answered yes.
        accountStateMock.positions = [{ symbol: "BTCUSDT" }];
        await render();

        button("btn-apply-leverage")?.click();
        await settle();

        expect(modalMock.show).toHaveBeenCalledTimes(1);
        expect(accountPort.changeLeverage).toHaveBeenCalledTimes(1);
    });

    it("sends nothing when that confirmation is declined", async () => {
        accountStateMock.positions = [{ symbol: "BTCUSDT" }];
        modalMock.show.mockResolvedValueOnce(false as never);
        await render();

        button("btn-apply-leverage")?.click();
        await settle();

        expect(accountPort.changeLeverage).not.toHaveBeenCalled();
    });
});

describe("FEAT-0068 — a blocked control is disabled with its reason, not hidden", () => {
    it("blocks margin mode while the symbol has a position, and still renders it", async () => {
        accountStateMock.positions = [{ symbol: "BTCUSDT" }];
        await render();

        const isolated = button("btn-margin-mode-isolated");
        expect(isolated).not.toBeNull();
        expect(isolated?.disabled).toBe(true);
        expect(host.textContent).toContain("Margin Mode");

        isolated?.click();
        await settle();
        expect(accountPort.changeMarginMode).not.toHaveBeenCalled();
    });

    it("blocks margin mode for a resting order on the symbol too", async () => {
        accountStateMock.openOrders = [{ symbol: "BTCUSDT" }];
        await render();

        expect(button("btn-margin-mode-cross")?.disabled).toBe(true);
    });

    it("leaves margin mode open for a position on a different symbol", async () => {
        accountStateMock.positions = [{ symbol: "ETHUSDT" }];
        await render();

        expect(button("btn-margin-mode-cross")?.disabled).toBe(false);
    });

    it("blocks position mode for a position on any symbol — it is account-wide", async () => {
        accountStateMock.positions = [{ symbol: "ETHUSDT" }];
        await render();

        const hedge = button("btn-position-mode-hedge");
        expect(hedge?.disabled).toBe(true);

        hedge?.click();
        await settle();
        expect(accountPort.changePositionMode).not.toHaveBeenCalled();
    });

    it("sends the margin mode when nothing is open", async () => {
        await render();
        button("btn-margin-mode-cross")?.click();
        await settle();

        expect(accountPort.changeMarginMode).toHaveBeenCalledWith("BTCUSDT", "CROSS");
    });

    it("disables everything in paper mode, where nothing can reach the exchange", async () => {
        paperStateMock.enabled = true;
        await render();

        expect(button("btn-apply-leverage")?.disabled).toBe(true);
        expect(button("btn-margin-mode-cross")?.disabled).toBe(true);
        expect(button("btn-position-mode-hedge")?.disabled).toBe(true);
    });
});

describe("FEAT-0068 — a venue without these endpoints offers no controls", () => {
    it("renders nothing where the adapter declares no support", async () => {
        // Not a disabled control here: the refusal a trader would need to
        // read belongs to the venue (`exchange.unsupported.accountSettings`),
        // and offering three dead buttons on every Bitget session is noise,
        // not information.
        supportsMock.accountSettings = false;
        await render();

        expect(button("btn-apply-leverage")).toBeNull();
        expect(button("btn-margin-mode-cross")).toBeNull();
        expect(host.textContent?.trim()).toBe("");
    });
});
