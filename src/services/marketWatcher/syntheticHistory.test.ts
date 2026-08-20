// @vitest-environment jsdom
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

/**
 * BUG-0231, end of the chain.
 *
 * apiService_syntheticTimeframes.test.ts proves the fetch layer now returns
 * enough candles for a synthetic timeframe. This proves the number that
 * actually reaches the indicator input -- what lands in marketState, which is
 * what CalculationExecutor reads. EMA 200 needs 200+ rows there; before the fix
 * a 6m request delivered 33, which is why RSI rendered and EMA 200 did not.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const EXCHANGE_ROW_CAP = 200;
const MINUTE = 60_000;
const NOW = 1_700_000_000_000;

vi.mock("$app/environment", () => ({ browser: true }));
vi.mock("../logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../storageService", () => ({
    storageService: { getKlines: vi.fn(async () => []), saveKlines: vi.fn() },
}));
vi.mock("../activeTechnicalsManager.svelte", () => ({
    activeTechnicalsManager: { forceRefresh: vi.fn() },
}));

function jsonResponse(body: unknown): Response {
    const text = JSON.stringify(body);
    return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => body,
        text: async () => text,
    } as unknown as Response;
}

/** Bitunix stand-in: honours endTime, truncates at the row cap. */
function installFakeExchange() {
    global.fetch = vi.fn(async (url: string) => {
        const params = new URL(url, "http://localhost").searchParams;
        const interval = params.get("interval")!;
        const limit = Number(params.get("limit"));
        const endTime = params.get("endTime") ? Number(params.get("endTime")) : NOW;

        const stepMs = interval === "1m" ? MINUTE : 5 * MINUTE;
        const rows = Math.min(limit, EXCHANGE_ROW_CAP);

        const out = [];
        for (let i = rows - 1; i >= 0; i--) {
            const time = Math.floor((endTime - i * stepMs) / stepMs) * stepMs;
            out.push({ timestamp: time, open: "100", high: "101", low: "99", close: "100", volume: "1" });
        }
        return jsonResponse(out);
    }) as unknown as typeof fetch;
}

describe("synthetic timeframe history reaching the store (BUG-0231)", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        installFakeExchange();
    });

    it("puts enough 6m candles in marketState for an EMA 200 to exist", { timeout: 60_000 }, async () => {
        const [{ marketWatcher }, { marketState }, { settingsState }] = await Promise.all([
            import("../marketWatcher"),
            import("../../stores/market.svelte"),
            import("../../stores/settings.svelte"),
        ]);
        settingsState.apiProvider = "bitunix";

        await marketWatcher.ensureHistory("BTCUSDT", "6m", 600);

        const stored = marketState.data.BTCUSDT?.klines?.["6m"] ?? [];
        // Pre-fix this was ~33 -- below the EMA 200 period, so the indicator
        // could not be produced at all while RSI(14) still could.
        expect(stored.length).toBeGreaterThan(200);
    });

    it("still fills a native timeframe", async () => {
        const [{ marketWatcher }, { marketState }, { settingsState }] = await Promise.all([
            import("../marketWatcher"),
            import("../../stores/market.svelte"),
            import("../../stores/settings.svelte"),
        ]);
        settingsState.apiProvider = "bitunix";

        await marketWatcher.ensureHistory("ETHUSDT", "5m", 600);

        const stored = marketState.data.ETHUSDT?.klines?.["5m"] ?? [];
        expect(stored.length).toBeGreaterThan(200);
    });
});
