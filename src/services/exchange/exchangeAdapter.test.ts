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
 * FEAT-0016 — the adapter boundary behaves.
 *
 * Two claims are worth holding to account here, because both are the kind
 * that quietly stop being true:
 *
 *   1. The active adapter follows `settingsState.apiProvider` at call time.
 *      A captured adapter keeps talking to the venue that was selected when
 *      the module loaded, which on a provider switch means orders and
 *      subscriptions going somewhere the user is no longer looking.
 *   2. Bitget's declared gaps are real gaps, not decoration. A trade
 *      subscription there must open nothing rather than open something that
 *      never delivers — BUG-0001's failure mode.
 *
 * The conformance suite proper is FEAT-0018; this is the seed it grows from.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const settings = vi.hoisted(() => ({ apiProvider: "bitunix" as string }));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settings }));

const bitunixWsMock = vi.hoisted(() => ({
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    subscribeTrade: vi.fn(() => vi.fn()),
}));
vi.mock("../bitunixWs", () => ({ bitunixWs: bitunixWsMock }));

const bitgetWsMock = vi.hoisted(() => ({
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
}));
vi.mock("../bitgetWs", () => ({ bitgetWs: bitgetWsMock }));

const apiServiceMock = vi.hoisted(() => ({
    fetchTicker24h: vi.fn(async () => ({ symbol: "BTCUSDT" })),
    fetchMarketSnapshot: vi.fn(async () => []),
    fetchBitunixKlines: vi.fn(async () => [{ time: 1 }]),
    fetchBitgetKlines: vi.fn(async () => [{ time: 2 }]),
    fetchBitunixFundingRateHistory: vi.fn(async () => [{ fundingTime: 1 }]),
}));
vi.mock("../apiService", () => ({ apiService: apiServiceMock }));

const tradeServiceMock = vi.hoisted(() => ({
    placeOrder: vi.fn(async () => ({ ok: true })),
    closePosition: vi.fn(async () => ({ ok: true })),
    cancelOrder: vi.fn(async () => ({ ok: true })),
    cancelAllOrders: vi.fn(async () => ({ ok: true })),
    modifyOrder: vi.fn(async () => ({ ok: true })),
    fetchTpSlOrders: vi.fn(async () => []),
    cancelTpSlOrder: vi.fn(async () => ({ ok: true })),
    modifyTpSlOrder: vi.fn(async () => ({ ok: true })),
    placePositionTpSl: vi.fn(async () => ({ ok: true })),
    placeTpSlOrder: vi.fn(async () => ({ ok: true })),
    fetchLeverageMarginMode: vi.fn(async () => undefined),
    fetchTradingPairInfo: vi.fn(async () => undefined),
}));
vi.mock("../tradeService", () => ({ tradeService: tradeServiceMock }));

import { activeExchange, getExchangeAdapter, exchangeAdapters } from "./registry";

beforeEach(() => {
    vi.clearAllMocks();
    settings.apiProvider = "bitunix";
});

describe("FEAT-0016 — the registry resolves the active exchange", () => {
    it("follows apiProvider at call time, not at import time", () => {
        expect(activeExchange().id).toBe("bitunix");
        settings.apiProvider = "bitget";
        expect(activeExchange().id).toBe("bitget");
    });

    it("falls back to Bitunix for an unknown provider", () => {
        // Matches what the call sites did before FEAT-0016
        // (`settingsState.apiProvider || "bitunix"`): a bad settings value
        // must not blank the trading screen.
        expect(getExchangeAdapter("kraken").id).toBe("bitunix");
        settings.apiProvider = "";
        expect(activeExchange().id).toBe("bitunix");
    });

    it("exposes every adapter for the conformance suite to iterate", () => {
        expect(exchangeAdapters.map((a) => a.id).sort()).toEqual(["bitget", "bitunix"]);
    });
});

describe("FEAT-0016 — market data reaches the venue that is selected", () => {
    it("routes a trade subscription to Bitunix's socket", () => {
        const onTrade = vi.fn();
        activeExchange().marketData.subscribeTrades("BTCUSDT", onTrade);
        expect(bitunixWsMock.subscribeTrade).toHaveBeenCalledWith("BTCUSDT", onTrade);
    });

    it("opens no trade subscription on Bitget, and returns a callable cleanup", () => {
        settings.apiProvider = "bitget";
        const cleanup = activeExchange().marketData.subscribeTrades("BTCUSDT", vi.fn());

        expect(bitgetWsMock.subscribe).not.toHaveBeenCalled();
        expect(bitunixWsMock.subscribeTrade).not.toHaveBeenCalled();
        expect(() => cleanup()).not.toThrow();
    });

    it("sends ticker subscriptions to the active venue's socket", () => {
        activeExchange().marketData.subscribe("BTCUSDT", "ticker");
        expect(bitunixWsMock.subscribe).toHaveBeenCalledWith("BTCUSDT", "ticker");

        settings.apiProvider = "bitget";
        activeExchange().marketData.unsubscribe("BTCUSDT", "ticker");
        expect(bitgetWsMock.unsubscribe).toHaveBeenCalledWith("BTCUSDT", "ticker");
    });

    it("fetches candles from each venue's own endpoint", async () => {
        await activeExchange().marketData.fetchKlines("BTCUSDT", "1h", 200);
        expect(apiServiceMock.fetchBitunixKlines).toHaveBeenCalled();
        expect(apiServiceMock.fetchBitgetKlines).not.toHaveBeenCalled();

        settings.apiProvider = "bitget";
        await activeExchange().marketData.fetchKlines("BTCUSDT", "1h", 200);
        expect(apiServiceMock.fetchBitgetKlines).toHaveBeenCalled();
    });

    it("asks for the snapshot of the active venue, never a hardcoded one", async () => {
        settings.apiProvider = "bitget";
        await activeExchange().marketData.fetchSnapshot();
        expect(apiServiceMock.fetchMarketSnapshot).toHaveBeenCalledWith("bitget", "normal");
    });
});

describe("FEAT-0016 — trading delegates, and adds no path of its own", () => {
    it("passes an order straight to the gated transport", async () => {
        const params = { symbol: "BTCUSDT" } as never;
        await activeExchange().trading.placeOrder(params);
        // Not a rebuilt payload: the same object the caller handed over, so
        // the FEAT-0011 gate inside tradeService sees what the UI produced.
        expect(tradeServiceMock.placeOrder).toHaveBeenCalledWith(params);
    });

    it("routes TP/SL to the transport on the venue that has it", async () => {
        await activeExchange().trading.fetchTpSlOrders("pending");
        expect(tradeServiceMock.fetchTpSlOrders).toHaveBeenCalledTimes(1);
    });

    it("stops short of the transport on a venue that does not", async () => {
        // Until FEAT-0229 this delegated too, and Bitget's proxy route
        // (routes/api/tpsl/+server.ts) did the refusing. The refusal now
        // happens before a request is built — see unsupportedVerbs.test.ts
        // for the read/write split that governs it.
        settings.apiProvider = "bitget";
        await activeExchange().trading.fetchTpSlOrders("pending");
        expect(tradeServiceMock.fetchTpSlOrders).not.toHaveBeenCalled();
    });
});

describe("FEAT-0016 — every adapter declares itself honestly", () => {
    it("gives both adapters the same shape", () => {
        for (const adapter of exchangeAdapters) {
            expect(Object.keys(adapter.marketData).sort()).toEqual(
                Object.keys(exchangeAdapters[0].marketData).sort(),
            );
            expect(Object.keys(adapter.trading).sort()).toEqual(
                Object.keys(exchangeAdapters[0].trading).sort(),
            );
            expect(Object.keys(adapter.account).sort()).toEqual(
                Object.keys(exchangeAdapters[0].account).sort(),
            );
        }
    });

    it("declares no stream it has not wired", () => {
        const bitget = getExchangeAdapter("bitget");
        // getBitgetChannel has no "trade" entry — claiming the stream would
        // produce a subscription that is accepted and never delivers.
        expect(bitget.streams.trades).toBe(false);
        expect(getExchangeAdapter("bitunix").streams.trades).toBe(true);
    });

    it("declares TP/SL only where the route accepts it", () => {
        expect(getExchangeAdapter("bitunix").supports.tpSl).toBe(true);
        expect(getExchangeAdapter("bitget").supports.tpSl).toBe(false);
    });

    it("carries the capability table the order panel already reads", () => {
        expect(getExchangeAdapter("bitunix").capabilities.tpSlAtEntry).toBe(true);
        expect(getExchangeAdapter("bitget").capabilities.tpSlAtEntry).toBe(false);
    });
});
