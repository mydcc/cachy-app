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
 * BUG-0565 — the panel reads the balance of the active mode.
 *
 * Paper hydrates the same store the live wallet pushes into, so an ambient
 * read measures against whichever writer ran last. The panel takes the
 * qualified read instead: in paper mode a live-stamped balance is not its
 * balance — it shows the unmeasured hint (IDEA-0563) rather than the live
 * figure, and a paper-stamped balance funds it the same way a live one
 * funds live mode.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { Decimal } from "decimal.js";
import en from "../../locales/locales/en.json";
import { accountState } from "../../stores/account.svelte";

import type { TradingPairInfo } from "../../stores/market/types";

vi.mock("../../services/logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const settings = vi.hoisted(() => ({
    apiProvider: "bitunix" as string,
    autoUpdatePriceInput: true,
}));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settings }));

const paperStateMock = vi.hoisted(() => ({ enabled: true }));
vi.mock("../../stores/paperTrading.svelte", () => ({ paperState: paperStateMock }));

const resultsMock = vi.hoisted(() => ({ isMarginExceeded: false }));
vi.mock("../../stores/results.svelte", () => ({ resultsState: resultsMock }));

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
    requiredMargin: null as Decimal | null,
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
                requiredMargin: mockTradeData.requiredMargin,
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

beforeEach(() => {
    vi.clearAllMocks();
    settings.apiProvider = "bitunix";
    settings.autoUpdatePriceInput = true;
    paperStateMock.enabled = true;
    resultsMock.isMarginExceeded = false;
    mockSymbolMetaStore.symbolMeta = { BTCUSDT: { ...TRADABLE } };
    mockTradeData.positionSize = new Decimal("0.02");
    mockTradeData.entryPrice = new Decimal("50000");
    mockTradeData.stopLossPrice = new Decimal("49000");
    mockTradeData.targets = [{ price: new Decimal("52000"), percentage: 100 }];
    mockTradeData.accountSize = new Decimal("1000");
    mockTradeData.riskPercentage = new Decimal("1");
    mockTradeData.leverage = new Decimal("10");
    // 0.02 × 50000 / 10 = 100 of required margin.
    mockTradeData.requiredMargin = new Decimal("100");
    mockTradeData.remoteAccountStateAt = Date.now();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
    accountState.reset();
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

describe("BUG-0565 — the panel reads the balance of the active mode", () => {
    it("funds paper submit from the paper balance", async () => {
        accountState.hydrateBalance({ available: "200", margin: "0", frozen: "0" }, "paper");
        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        expect(submitButton().disabled).toBe(false);
        expect(host.textContent).not.toContain("Balance not loaded");
    });

    it("ignores a live-stamped balance while paper is on", async () => {
        // The wallet pushed while paper mode was on: stamped live, so the
        // paper read finds nothing — the panel warns instead of funding
        // the simulator from the live wallet.
        accountState.hydrateBalance({ available: "200", margin: "0", frozen: "0" }, "live");
        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        expect(submitButton().disabled).toBe(false);
        expect(host.textContent).toContain("Balance not loaded");
    });

    it("disables paper submit when the paper balance cannot fund the margin", async () => {
        accountState.hydrateBalance({ available: "50", margin: "0", frozen: "0" }, "paper");
        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        expect(submitButton().disabled).toBe(true);
        expect(host.textContent).toContain("Needs 100 margin but only 50 is free");
    });
});
