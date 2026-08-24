// @vitest-environment node
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
 * BUG-0296 regression tests — loadMoreHistory result semantics.
 *
 * loadMoreHistory used to collapse three very different outcomes into a
 * boolean: candles appended, exchange exhausted, fetch failed. The chart
 * treated every `false` as "history is complete", so ONE transient network
 * error permanently disabled back-fill for the whole chart window. The fix
 * returns an explicit "loaded" | "exhausted" | "busy" | "error" result;
 * these tests pin that contract.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("../apiService", () => ({
    apiService: { fetchBitunixKlines: vi.fn() },
}));
vi.mock("../../stores/market.svelte", () => ({
    marketState: {
        data: {} as Record<string, unknown>,
        updateSymbolKlines: vi.fn(),
    },
}));
vi.mock("../../stores/trade.svelte", () => ({
    tradeState: { symbol: "" },
}));
vi.mock("../../stores/settings.svelte", () => ({
    settingsState: {
        apiProvider: "bitunix",
        chartHistoryLimit: 1000,
        entitlement: { capabilities: { marketData: true } },
    },
}));
vi.mock("../logger", () => {
    const noop = vi.fn();
    return {
        logger: { log: noop, debug: noop, warn: noop, error: noop },
    };
});
vi.mock("../storageService", () => ({
    storageService: {},
}));
vi.mock("../activeTechnicalsManager.svelte", () => ({
    activeTechnicalsManager: { forceRefresh: vi.fn() },
}));

import { apiService } from "../apiService";
import { marketState } from "../../stores/market.svelte";
import { HistoryFetcher, type LoadMoreHistoryResult } from "./historyFetcher";

const store = marketState as unknown as {
    data: Record<string, { klines: Record<string, Array<{ time: number }>> }>;
    updateSymbolKlines: ReturnType<typeof vi.fn>;
};

const fetchKlines = vi.mocked(apiService.fetchBitunixKlines);

function makeFetcher(): HistoryFetcher {
    return new HistoryFetcher({ prunedRequestIds: new Set<string>() } as never);
}

function seedStore(symbol: string, tf: string, oldestTime: number) {
    store.data[symbol] = { klines: { [tf]: [{ time: oldestTime }] } };
}

function makeKline(time: number) {
    const price = new Decimal("100");
    return {
        time,
        open: price,
        high: price.plus(1),
        low: price.minus(1),
        close: price,
        volume: new Decimal(1),
    };
}

describe("BUG-0296 — HistoryFetcher.loadMoreHistory result semantics", () => {
    let fetcher: HistoryFetcher;

    beforeEach(() => {
        vi.clearAllMocks();
        store.data = {};
        fetcher = makeFetcher();
    });

    it('returns "loaded" and appends older candles when the exchange has more', async () => {
        seedStore("ICPUSDT", "15m", 1700000120000);
        fetchKlines.mockResolvedValue([
            makeKline(1700000060000),
            makeKline(1700000000000),
        ] as never);

        const result: LoadMoreHistoryResult = await fetcher.loadMoreHistory("ICPUSDT", "15m");

        expect(result).toBe("loaded");
        expect(fetchKlines).toHaveBeenCalledWith(
            "ICPUSDT",
            "15m",
            200,
            undefined,
            1700000120000 - 1,
        );
        expect(store.updateSymbolKlines).toHaveBeenCalledWith(
            "ICPUSDT",
            "15m",
            expect.any(Array),
            "rest",
            false,
        );
    });

    it('returns "exhausted" when a successful fetch yields no older candles', async () => {
        seedStore("ICPUSDT", "15m", 1700000120000);
        fetchKlines.mockResolvedValue([] as never);

        const result: LoadMoreHistoryResult = await fetcher.loadMoreHistory("ICPUSDT", "15m");

        expect(result).toBe("exhausted");
        expect(store.updateSymbolKlines).not.toHaveBeenCalled();
    });

    it('returns "error" — not a falsy "done" — when the fetch fails (BUG-0296 regression)', async () => {
        seedStore("ICPUSDT", "15m", 1700000120000);
        fetchKlines.mockRejectedValue(new Error("apiErrors.klineError"));

        const result: LoadMoreHistoryResult = await fetcher.loadMoreHistory("ICPUSDT", "15m");

        expect(result).toBe("error");
    });

    it('returns "busy" while another load holds the lock', async () => {
        seedStore("ICPUSDT", "15m", 1700000120000);
        fetcher.historyLocks.add("more:ICPUSDT:15m");

        const result: LoadMoreHistoryResult = await fetcher.loadMoreHistory("ICPUSDT", "15m");

        expect(result).toBe("busy");
        expect(fetchKlines).not.toHaveBeenCalled();
    });
});
