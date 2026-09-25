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
 * BUG-0555 — the final confirmation must render the exact normalized plan:
 * every TP price sent to the service, an explicit no-stop-loss state when
 * the stop is absent, and leverage + margin mode.
 *
 * The panel builds ONE facts object in submit() that feeds both the modal
 * message and the EntryPlan. These tests pin that contract from the
 * outside: the modal text must contain the same TP prices the placement
 * service received, never a bare zero stop, and both live/paper titles
 * must carry complete facts.
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
    targets: [] as Array<{ price: Decimal; percent: Decimal; isLocked: boolean }>,
    accountSize: null as Decimal | null,
    riskPercentage: null as Decimal | null,
    leverage: null as Decimal | null,
    remoteAccountStateAt: Date.now(),
    remoteMarginMode: "ISOLATION" as string | undefined,
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

function tp(price: string) {
    return { price: new Decimal(price), percent: new Decimal("50"), isLocked: false };
}

beforeEach(() => {
    vi.clearAllMocks();
    settings.apiProvider = "bitunix";
    settings.autoUpdatePriceInput = true;
    paperStateMock.enabled = false;
    mockSymbolMetaStore.symbolMeta = { BTCUSDT: { ...TRADABLE } };
    mockTradeData.positionSize = new Decimal("0.02");
    mockTradeData.entryPrice = new Decimal("50000");
    mockTradeData.stopLossPrice = new Decimal("49000");
    mockTradeData.targets = [tp("52000"), tp("53000")];
    mockTradeData.accountSize = new Decimal("1000");
    mockTradeData.riskPercentage = new Decimal("1");
    mockTradeData.leverage = new Decimal("10");
    mockTradeData.remoteMarginMode = "ISOLATION";
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

async function submitAndConfirm() {
    showMock.mockResolvedValue(true);
    placeEntryGroupMock.mockResolvedValue({
        entryPlaced: true,
        stopLoss: "placed",
        takeProfit: "placed",
        unprotected: false,
    });
    component = mount(PlaceOrderPanel, { target: host }) as never;
    await settle();
    const button = host.querySelector<HTMLButtonElement>("button.submit-btn");
    if (!button) throw new Error("submit button not rendered");
    expect(button.disabled).toBe(false);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle();
    expect(showMock).toHaveBeenCalledTimes(1);
    expect(placeEntryGroupMock).toHaveBeenCalledTimes(1);
    return {
        title: showMock.mock.calls[0][0] as string,
        message: showMock.mock.calls[0][1] as string,
        plan: placeEntryGroupMock.mock.calls[0][0] as {
            takeProfits: Decimal[];
            stopLossPrice: Decimal;
        },
    };
}

describe("BUG-0555 — confirmation renders the normalized plan", () => {
    it("shows every TP price the service receives, plus stop, leverage and margin mode", async () => {
        const { title, message, plan } = await submitAndConfirm();

        expect(title).toBe(lookup("orderEntry.confirm.titleLive"));
        const sentPrices = plan.takeProfits.map((p) => p.toString());
        expect(sentPrices).toEqual(["52000", "53000"]);
        for (const price of sentPrices) {
            expect(message).toContain(price);
        }
        expect(message).toContain("49000");
        expect(message).toContain("10x (ISOLATION)");
    });

    it("renders an explicit no-stop-loss state for a zero stop, never a bare zero", async () => {
        mockTradeData.stopLossPrice = new Decimal("0");
        const { message } = await submitAndConfirm();

        expect(message).toContain(lookup("orderEntry.confirm.noStopLoss"));
        expect(message).not.toContain("Stop: 0");
    });

    it("renders an explicit no-stop-loss state for a missing stop", async () => {
        mockTradeData.stopLossPrice = null;
        const { message } = await submitAndConfirm();

        expect(message).toContain(lookup("orderEntry.confirm.noStopLoss"));
    });

    it("renders an explicit no-take-profit state when no TP legs are sent", async () => {
        mockTradeData.targets = [];
        const { message, plan } = await submitAndConfirm();

        expect(plan.takeProfits).toEqual([]);
        expect(message).toContain(lookup("orderEntry.confirm.noTakeProfit"));
    });

    it("renders leverage as unknown when no leverage is present", async () => {
        mockTradeData.leverage = null;
        const { message } = await submitAndConfirm();

        expect(message).toContain(lookup("orderEntry.confirm.leverageUnknown"));
    });

    it("paper confirmation carries the same complete facts under the paper title", async () => {
        paperStateMock.enabled = true;
        const { title, message, plan } = await submitAndConfirm();

        expect(title).toBe(lookup("orderEntry.confirm.titlePaper"));
        for (const price of plan.takeProfits.map((p) => p.toString())) {
            expect(message).toContain(price);
        }
        expect(message).toContain("49000");
        expect(message).toContain("10x (ISOLATION)");
    });
});
