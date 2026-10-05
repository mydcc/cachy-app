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
import en from "../../locales/locales/en.json";

import type { TradingPairInfo } from "../../types/apiSchemas";

vi.mock("../../services/logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const settings = vi.hoisted(() => ({ apiProvider: "bitunix" as string, autoUpdatePriceInput: true }));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settings }));

const paperStateMock = vi.hoisted(() => ({ enabled: false }));
vi.mock("../../stores/accountVerification.svelte", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("../../stores/accountVerification.svelte")>();
    return {
        ...actual,
        accountVerification: {
            statusFor: () => "verified",
            startClock: () => () => undefined,
        },
        subjectFor: () => ({
            id: "acct-1",
            exchange: "bitunix",
            keys: { key: "k", secret: "s" },
        }),
        ensureCurrent: vi.fn(async () => undefined),
    };
});

vi.mock("../../stores/paperTrading.svelte", () => ({ paperState: paperStateMock }));

// BUG-0628 — the calculator has refused (no orderable size), so there is no
// output object at all. Only the raw input symbol is available.
const tradeInput = vi.hoisted(() => ({ symbol: "ETHUSDT" }));

vi.mock("../../stores/trade.svelte", () => ({
    tradeState: {
        get symbol() {
            return tradeInput.symbol;
        },
        get currentTradeData() {
            return null;
        },
        get remoteAccountStateAt() {
            return Date.now();
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
    META_FETCH_RETRY_MS: 30_000,
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
    tradeInput.symbol = "ETHUSDT";
    mockSymbolMetaStore.symbolMeta = {};
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

describe("BUG-0628 — panel refetches metadata while the calculator refuses", () => {
    it("fetches trading-pair info for the input symbol when no calculator output exists", async () => {
        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        expect(fetchTradingPairInfoMock).toHaveBeenCalledWith("ETHUSDT");
        expect(fetchTradingPairInfoMock).toHaveBeenCalledTimes(1);
        // No calculator output: the panel falls back to notReady while the
        // calculator surfaces noSymbolMeta — exactly the reported incident.
        expect(host.textContent).toContain(lookup("orderEntry.notReady"));
    });

    it("does not fetch when metadata is already in store", async () => {
        mockSymbolMetaStore.symbolMeta["ETHUSDT"] = {
            symbol: "ETHUSDT",
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

        expect(fetchTradingPairInfoMock).not.toHaveBeenCalled();
    });
});
