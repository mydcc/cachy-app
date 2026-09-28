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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { Decimal } from "decimal.js";
import en from "../../locales/locales/en.json";

import type { TradingPairInfo } from "../../types/apiSchemas";

vi.mock("../../services/logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const settings = vi.hoisted(() => ({ apiProvider: "bitunix" as string, autoUpdatePriceInput: true }));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settings }));

const paperStateMock = vi.hoisted(() => ({ enabled: false }));
vi.mock("../../stores/paperTrading.svelte", () => ({ paperState: paperStateMock }));

const mockTradeData = vi.hoisted(() => ({
    symbol: "BTCUSDT",
    tradeType: "LONG" as const,
    positionSize: null as Decimal | null,
    entryPrice: null as Decimal | null,
    stopLossPrice: null as Decimal | null,
    targets: [] as Array<{ price: Decimal; percentage: number }>,
    remoteAccountStateAt: Date.now(),
}));

vi.mock("../../stores/trade.svelte", () => ({
    tradeState: {
        get currentTradeData() {
            return mockTradeData;
        },
        get remoteAccountStateAt() {
            return mockTradeData.remoteAccountStateAt;
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
        setSymbolMeta: (symbol: string, meta: TradingPairInfo) => {
            mockSymbolMetaStore.symbolMeta[symbol] = meta;
        },
    },
}));

const fetchTradingPairInfoMock = vi.fn();
vi.mock("../../services/exchange", () => ({
    activeExchange: () => ({
        account: {
            fetchTradingPairInfo: fetchTradingPairInfoMock,
        },
    }),
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

beforeEach(() => {
    vi.clearAllMocks();
    settings.apiProvider = "bitunix";
    mockSymbolMetaStore.symbolMeta = {};
    mockTradeData.positionSize = new Decimal("0.02");
    mockTradeData.entryPrice = new Decimal("50000");
    mockTradeData.stopLossPrice = new Decimal("49000");
    mockTradeData.targets = [{ price: new Decimal("52000"), percentage: 100 }];
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

describe("FEAT-0067 — PlaceOrderPanel trading pair metadata validation", () => {
    it("disables submit and displays metadata loading when metadata is not yet in store", async () => {
        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        const submitBtn = host.querySelector<HTMLButtonElement>("button.submit-btn");
        expect(submitBtn?.disabled).toBe(true);
        expect(host.textContent).toContain(lookup("orderEntry.errors.metadataLoading"));
        expect(fetchTradingPairInfoMock).toHaveBeenCalledWith("BTCUSDT");
    });

    it("disables submit and displays trading unavailable if symbolStatus is not OPEN", async () => {
        mockSymbolMetaStore.symbolMeta["BTCUSDT"] = {
            symbol: "BTCUSDT",
            basePrecision: 4,
            quotePrecision: 2,
            minTradeVolume: "0.001",
            maxLimitOrderVolume: "100",
            maxMarketOrderVolume: "50",
            symbolStatus: "STOP",
            isApiSupported: true,
        };

        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        const submitBtn = host.querySelector<HTMLButtonElement>("button.submit-btn");
        expect(submitBtn?.disabled).toBe(true);
        expect(host.textContent).toContain(lookup("orderEntry.errors.tradingUnavailable"));
    });

    it("disables submit and displays trading unavailable if isApiSupported is false", async () => {
        mockSymbolMetaStore.symbolMeta["BTCUSDT"] = {
            symbol: "BTCUSDT",
            basePrecision: 4,
            quotePrecision: 2,
            minTradeVolume: "0.001",
            maxLimitOrderVolume: "100",
            maxMarketOrderVolume: "50",
            symbolStatus: "OPEN",
            isApiSupported: false,
        };

        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        const submitBtn = host.querySelector<HTMLButtonElement>("button.submit-btn");
        expect(submitBtn?.disabled).toBe(true);
        expect(host.textContent).toContain(lookup("orderEntry.errors.tradingUnavailable"));
        expect(host.textContent).toContain(lookup("dashboard.symbolInfo.apiNotSupported"));
    });

    it("disables submit and warns if order volume is below minTradeVolume", async () => {
        mockSymbolMetaStore.symbolMeta["BTCUSDT"] = {
            symbol: "BTCUSDT",
            basePrecision: 4,
            quotePrecision: 2,
            minTradeVolume: "0.05",
            maxLimitOrderVolume: "100",
            maxMarketOrderVolume: "50",
            symbolStatus: "OPEN",
            isApiSupported: true,
        };

        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        const submitBtn = host.querySelector<HTMLButtonElement>("button.submit-btn");
        expect(submitBtn?.disabled).toBe(true);
        expect(host.textContent).toContain("0.05");
    });

    it("disables submit and warns if order volume exceeds maxMarketOrderVolume", async () => {
        mockSymbolMetaStore.symbolMeta["BTCUSDT"] = {
            symbol: "BTCUSDT",
            basePrecision: 4,
            quotePrecision: 2,
            minTradeVolume: "0.001",
            maxLimitOrderVolume: "100",
            maxMarketOrderVolume: "0.01",
            symbolStatus: "OPEN",
            isApiSupported: true,
        };

        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        const submitBtn = host.querySelector<HTMLButtonElement>("button.submit-btn");
        expect(submitBtn?.disabled).toBe(true);
        expect(host.textContent).toContain("0.01");
    });

    it("enables submit when metadata is present, status is OPEN, isApiSupported is true, and volume is valid", async () => {
        mockSymbolMetaStore.symbolMeta["BTCUSDT"] = {
            symbol: "BTCUSDT",
            basePrecision: 4,
            quotePrecision: 2,
            minTradeVolume: "0.001",
            maxLimitOrderVolume: "100",
            maxMarketOrderVolume: "50",
            symbolStatus: "OPEN",
            isApiSupported: true,
        };

        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        const submitBtn = host.querySelector<HTMLButtonElement>("button.submit-btn");
        expect(submitBtn?.disabled).toBe(false);
    });

    it("only renders Market and Limit order types (Trigger is omitted)", async () => {
        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        const typeButtons = host.querySelectorAll<HTMLButtonElement>("button.type-btn");
        const buttonTexts = Array.from(typeButtons).map((btn) => btn.textContent?.trim());
        expect(buttonTexts).toEqual([lookup("orderEntry.type.market"), lookup("orderEntry.type.limit")]);
        expect(host.textContent).not.toContain(lookup("orderEntry.type.trigger"));
    });

    it("clicking Market order button automatically enables autoUpdatePriceInput if disabled", async () => {
        settings.autoUpdatePriceInput = false;

        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        const marketBtn = host.querySelectorAll<HTMLButtonElement>("button.type-btn")[0];
        expect(marketBtn?.disabled).toBe(false);

        marketBtn.click();
        await settle();

        expect(settings.autoUpdatePriceInput).toBe(true);
        expect(marketBtn.classList.contains("active")).toBe(true);
    });
});
