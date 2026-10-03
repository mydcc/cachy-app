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
 * BUG-0501 — instrument metadata fetch: venue-keyed writes, no stub entries,
 * retries after a cooldown.
 *
 * A failed trading-pairs fetch must leave the map empty (the calculator
 * refuses on a missing entry) rather than cache "no precision", and the next
 * attempt after the cooldown must retry. Bitget rows arrive in a different
 * shape and key space and are normalised into the same TradingPairInfo.
 */

import { migrateAccounts } from "../stores/settings/accounts";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const settings = vi.hoisted(() => ({ apiProvider: "bitunix" as string }));
vi.mock("../stores/settings.svelte", () => ({
    settingsState: {
        get apiProvider() {
            return settings.apiProvider;
        },
        set apiProvider(v: string) {
            settings.apiProvider = v;
        },
        ...migrateAccounts({ apiKeys: { bitunix: { key: "k", secret: "s" } } }),
    },
}));

const appFetch = vi.hoisted(() => vi.fn());
vi.mock("../lib/appAuth", () => ({ appFetch }));

vi.mock("./toastService.svelte", () => ({
    toastService: { error: vi.fn(), success: vi.fn(), add: vi.fn() },
}));

import { tradeService } from "./tradeService";
import { marketState } from "../stores/market.svelte";

function bitunixRow() {
    return {
        code: 0,
        msg: "Success",
        data: [{
            symbol: "BTCUSDT", base: "BTC", quote: "USDT",
            minTradeVolume: "0.0001", maxLimitOrderVolume: "100000", maxMarketOrderVolume: "50000",
            basePrecision: 4, quotePrecision: 1,
            minLeverage: 1, maxLeverage: 125, defaultLeverage: 20,
            priceProtectScope: "0.02", symbolStatus: "OPEN", isApiSupported: true,
        }],
    };
}

function bitgetRow(symbol = "BTCUSDT") {
    return {
        symbol,
        baseCoin: "BTC",
        quoteCoin: "USDT",
        minTradeNum: "0.0001",
        volumePlace: "4",
        pricePlace: "1",
        maxOrderQty: "1200",
        maxMarketOrderQty: "220",
        minLever: "1",
        maxLever: "150",
        symbolStatus: "normal",
    };
}

function okJson(body: unknown) {
    return { ok: true, json: async () => body };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    settings.apiProvider = "bitunix";
    marketState.reset();
});

afterEach(() => {
    vi.useRealTimers();
    marketState.reset();
});

describe("fetchTradingPairInfo — Bitunix", () => {
    it("writes the entry under the venue-normalized key", async () => {
        appFetch.mockResolvedValue(okJson(bitunixRow()));

        await tradeService.fetchTradingPairInfo("BTCUSDT");

        const meta = marketState.symbolMeta["BTCUSDT"];
        expect(meta?.basePrecision).toBe(4);
        expect(meta?.maxLeverage).toBe(125);
        expect(meta?.minTradeVolume?.toString()).toBe("0.0001");
    });

    it("writes nothing on a failed response, and does not refetch within the cooldown", async () => {
        appFetch.mockResolvedValue({ ok: false });

        await tradeService.fetchTradingPairInfo("BTCUSDT");
        await tradeService.fetchTradingPairInfo("BTCUSDT");

        expect(marketState.symbolMeta["BTCUSDT"]).toBeUndefined();
        expect(appFetch).toHaveBeenCalledTimes(1);
    });

    it("retries after the cooldown", async () => {
        vi.useFakeTimers();
        appFetch.mockResolvedValue({ ok: false });

        await tradeService.fetchTradingPairInfo("BTCUSDT");
        expect(appFetch).toHaveBeenCalledTimes(1);

        vi.setSystemTime(Date.now() + 31_000);
        appFetch.mockResolvedValue(okJson(bitunixRow()));
        await tradeService.fetchTradingPairInfo("BTCUSDT");

        expect(appFetch).toHaveBeenCalledTimes(2);
        expect(marketState.symbolMeta["BTCUSDT"]?.basePrecision).toBe(4);
    });

    it("writes nothing on a schema mismatch", async () => {
        appFetch.mockResolvedValue(okJson({ code: 0, data: [{ symbol: "BTCUSDT", basePrecision: "four" }] }));

        await tradeService.fetchTradingPairInfo("BTCUSDT");

        expect(marketState.symbolMeta["BTCUSDT"]).toBeUndefined();
    });

    it("shares one request between concurrent callers", async () => {
        appFetch.mockResolvedValue(okJson(bitunixRow()));

        await Promise.all([
            tradeService.fetchTradingPairInfo("BTCUSDT"),
            tradeService.fetchTradingPairInfo("BTCUSDT"),
        ]);

        expect(appFetch).toHaveBeenCalledTimes(1);
    });
});

describe("fetchTradingPairInfo — Bitget (BUG-0501)", () => {
    beforeEach(() => {
        settings.apiProvider = "bitget";
    });

    it("normalises a V2 contracts row into TradingPairInfo", async () => {
        appFetch.mockResolvedValue(okJson({ code: "00000", msg: "success", data: [bitgetRow()] }));

        await tradeService.fetchTradingPairInfo("BTCUSDT");

        expect(appFetch).toHaveBeenCalledWith(
            expect.stringContaining("/api/bitget/contracts"),
        );
        const meta = marketState.symbolMeta["BTCUSDT_UMCBL"];
        expect(meta?.basePrecision).toBe(4);
        expect(meta?.quotePrecision).toBe(1);
        expect(meta?.minTradeVolume?.toString()).toBe("0.0001");
        expect(meta?.maxLimitOrderVolume?.toString()).toBe("1200");
        expect(meta?.maxMarketOrderVolume?.toString()).toBe("220");
        expect(meta?.minLeverage).toBe(1);
        expect(meta?.maxLeverage).toBe(150);
        // V2 "normal" speaks Bitunix downstream: OPEN, or the gate refuses.
        expect(meta?.symbolStatus).toBe("OPEN");
        // No Bitunix entry is written for a Bitget symbol.
        expect(marketState.symbolMeta["BTCUSDT"]).toBeUndefined();
    });

    it("picks the matching row from a multi-row response", async () => {
        appFetch.mockResolvedValue(okJson({
            code: "00000",
            data: [bitgetRow("ETHUSDT"), bitgetRow("BTCUSDT")],
        }));

        await tradeService.fetchTradingPairInfo("btcusdt");

        expect(marketState.symbolMeta["BTCUSDT_UMCBL"]?.symbol).toBe("BTCUSDT");
        expect(marketState.symbolMeta["ETHUSDT_UMCBL"]).toBeUndefined();
    });

    it("writes nothing when no row matches or the venue reports an error", async () => {
        appFetch.mockResolvedValue(okJson({ code: "00000", data: [bitgetRow("ETHUSDT")] }));
        await tradeService.fetchTradingPairInfo("BTCUSDT");
        expect(marketState.symbolMeta["BTCUSDT_UMCBL"]).toBeUndefined();

        marketState.reset();
        appFetch.mockResolvedValue(okJson({ code: "40001", msg: "error", data: null }));
        await tradeService.fetchTradingPairInfo("BTCUSDT");
        expect(marketState.symbolMeta["BTCUSDT_UMCBL"]).toBeUndefined();
    });
});
