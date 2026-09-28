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
 * BUG-0507 — the entry panel's double-submit guard sits past the
 * confirmation dialog.
 *
 * No double order is sent today, but only because the modal store refuses
 * to stack a second dialog (BUG-0422) — not because of the panel's own
 * `submitting` flag, which used to stay false for the whole confirmation
 * window. This test invokes submit twice while the first is still waiting
 * on the confirmation, with the modal stubbed to confirm both, and asserts
 * exactly one placement call. It fails without the fix (two placements),
 * so it proves the panel itself refuses — not the modal store.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { Decimal } from "decimal.js";
import en from "../../locales/locales/en.json";

import type { TradingPairInfo } from "../../stores/market/types";

vi.mock("../../services/logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const settings = vi.hoisted(() => ({
    apiProvider: "bitunix" as string,
    autoUpdatePriceInput: true,
}));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settings }));

const paperStateMock = vi.hoisted(() => ({ enabled: false }));
vi.mock("../../stores/paperTrading.svelte", () => ({ paperState: paperStateMock }));

const mockTradeData = vi.hoisted(() => ({
    symbol: "BTCUSDT",
    tradeType: "long",
    positionSize: null as Decimal | null,
    entryPrice: null as Decimal | null,
    stopLossPrice: null as Decimal | null,
    targets: [] as Array<{ price: Decimal; percentage: number }>,
    accountSize: null as Decimal | null,
    riskPercentage: null as Decimal | null,
    leverage: null as Decimal | null,
    remoteAccountStateAt: Date.now(),
    remoteMarginMode: "ISOLATION",
}));

vi.mock("../../stores/trade.svelte", () => ({
    tradeState: {
        get symbol() {
            return mockTradeData.symbol;
        },
        get leverage() {
            return mockTradeData.leverage?.toString() ?? "";
        },
        get remoteMarginMode() {
            return mockTradeData.remoteMarginMode;
        },
        get currentTradeData() {
            return {
                symbol: mockTradeData.symbol,
                tradeType: mockTradeData.tradeType,
                positionSize: mockTradeData.positionSize,
                entryPrice: mockTradeData.entryPrice,
                stopLossPrice: mockTradeData.stopLossPrice,
                targets: mockTradeData.targets,
                accountSize: mockTradeData.accountSize,
                riskPercentage: mockTradeData.riskPercentage,
                leverage: mockTradeData.leverage,
            };
        },
        get remoteAccountStateAt() {
            return mockTradeData.remoteAccountStateAt;
        },
        set entryOrderType(_value: string) {
            // The panel mirrors its entry type into the store; irrelevant here.
        },
    },
}));

const mockSymbolMetaStore = vi.hoisted(() => ({
    symbolMeta: {} as Record<string, TradingPairInfo>,
}));

vi.mock("../../stores/market.svelte", () => ({
    marketState: {
        get symbolMeta() {
            return mockSymbolMetaStore.symbolMeta;
        },
        get data() {
            return {};
        },
        setSymbolMeta: (symbol: string, meta: TradingPairInfo) => {
            mockSymbolMetaStore.symbolMeta[symbol] = meta;
        },
    },
}));

vi.mock("../../services/exchange", () => ({
    activeExchange: () => ({
        account: {
            fetchTradingPairInfo: vi.fn().mockResolvedValue(undefined),
            fetchLeverageMarginMode: vi.fn().mockResolvedValue(undefined),
        },
    }),
}));

const showMock = vi.hoisted(() => vi.fn());
vi.mock("../../stores/modal.svelte", () => ({ modalState: { show: showMock } }));

const placeEntryGroupMock = vi.hoisted(() => vi.fn());
vi.mock("../../services/orderPlacementService", () => ({
    orderPlacementService: { placeEntryGroup: placeEntryGroupMock },
    // The panel narrows the free-string trade direction through the real
    // helper; mirrored here so the mock does not turn every submit
    // fail-closed.
    narrowTradeType: (tradeType: string) => {
        const normalized = tradeType.toLowerCase();
        if (normalized === "long" || normalized === "short") return normalized;
        return null;
    },
}));

vi.mock("../../services/toastService.svelte", () => ({
    toastService: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("../../stores/ui.svelte", () => ({
    uiState: { showError: vi.fn() },
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

import PlaceOrderPanel from "./PlaceOrderPanel.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

const TRADABLE: TradingPairInfo = {
    symbol: "BTCUSDT",
    basePrecision: 4,
    quotePrecision: 2,
    minTradeVolume: new Decimal("0.001"),
    maxLimitOrderVolume: new Decimal("100"),
    maxMarketOrderVolume: new Decimal("50"),
    symbolStatus: "OPEN",
    isApiSupported: true,
};

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

beforeEach(() => {
    vi.clearAllMocks();
    settings.apiProvider = "bitunix";
    settings.autoUpdatePriceInput = true;
    mockSymbolMetaStore.symbolMeta = { BTCUSDT: { ...TRADABLE } };
    mockTradeData.positionSize = new Decimal("0.02");
    mockTradeData.entryPrice = new Decimal("50000");
    mockTradeData.stopLossPrice = new Decimal("49000");
    mockTradeData.targets = [{ price: new Decimal("52000"), percentage: 100 }];
    mockTradeData.accountSize = new Decimal("1000");
    mockTradeData.riskPercentage = new Decimal("1");
    mockTradeData.leverage = new Decimal("10");
    mockTradeData.remoteAccountStateAt = Date.now();
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

function submitButton(): HTMLButtonElement {
    const button = host.querySelector<HTMLButtonElement>("button.submit-btn");
    if (!button) throw new Error("submit button not rendered");
    return button;
}

function click(button: HTMLButtonElement) {
    // dispatchEvent reaches the handler even while the button is disabled;
    // that is the point — the guard must refuse, not the attribute.
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("BUG-0507 — the panel refuses a second submit during confirmation", () => {
    it("places exactly once when submit fires twice and both confirms agree", async () => {
        const confirmation = deferred<boolean>();
        showMock.mockImplementation(() => confirmation.promise);
        placeEntryGroupMock.mockResolvedValue({
            entryPlaced: true,
            stopLoss: "placed",
            takeProfit: "placed",
            unprotected: false,
        });

        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        const button = submitButton();
        expect(button.disabled).toBe(false);

        click(button);
        await settle();
        expect(showMock).toHaveBeenCalledTimes(1);

        // Second press while the first is still waiting on the dialog.
        click(button);
        await settle();

        confirmation.resolve(true);
        await settle();

        expect(placeEntryGroupMock).toHaveBeenCalledTimes(1);
    });

    it("leaves the button usable after the confirmation is cancelled", async () => {
        showMock.mockResolvedValue(false);
        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        click(submitButton());
        await settle();

        // Cancel cleared the guard: the button is back and no placement ran.
        expect(submitButton().disabled).toBe(false);
        expect(placeEntryGroupMock).not.toHaveBeenCalled();
    });
});

describe("unknown trade direction fails closed", () => {
    it("disables submit and never places when the direction is unreadable", async () => {
        mockTradeData.tradeType = "sideways";
        try {
            component = mount(PlaceOrderPanel, { target: host }) as never;
            await settle();

            expect(submitButton().disabled).toBe(true);
            click(submitButton());
            await settle();
            expect(placeEntryGroupMock).not.toHaveBeenCalled();
        } finally {
            mockTradeData.tradeType = "long";
        }
    });
});
