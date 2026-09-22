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
 * BUG-0514 — close-all on a non-Bitunix venue must not flatten the cache.
 *
 * The fallback branch used to loop over `omsService.getPositions()`, so a
 * position the cache was missing survived while the call reported success.
 * These tests pin the fixed contract: the work list comes from an
 * exchange-fresh read, a position that is still open afterwards is reported
 * by name instead of success, and a verification read that itself fails is
 * reported as unverified.
 *
 * The mocked store stands in for the hydrated cache: `hydratePositions`
 * swaps the backing list for whatever the exchange returned, exactly as the
 * real store would.
 */

import { migrateAccounts } from "../stores/settings/accounts";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { tradeService } from "./tradeService";
import { omsService } from "./omsService";
import { accountState } from "../stores/account.svelte";
import { exchangeSignedFetch } from "../utils/exchange/browserSigning";
import { toastService } from "./toastService.svelte";
import { Decimal } from "decimal.js";
import * as paperFeed from "./paperAccountFeed";
import type { OMSPosition } from "./omsTypes";

vi.mock("./omsService", () => ({
    omsService: {
        getPositions: vi.fn(),
        updatePosition: vi.fn(),
        removePosition: vi.fn(),
        addOptimisticOrder: vi.fn(),
        removeOrder: vi.fn(),
        getOrder: vi.fn(),
        updateOrder: vi.fn(),
    },
}));

vi.mock("../stores/settings.svelte", () => ({
    settingsState: {
        apiProvider: "bitget",
        ...migrateAccounts({
            apiKeys: {
                bitget: { key: "test-key", secret: "test-secret", passphrase: "test-pass" },
            },
        }),
        appAccessToken: "test-token",
        secretsReady: Promise.resolve(),
    },
}));

vi.mock("../stores/market.svelte", () => ({
    marketState: { symbolMeta: {}, data: {} },
}));

vi.mock("../stores/account.svelte", () => ({
    accountState: { hydratePositions: vi.fn() },
}));

vi.mock("../utils/exchange/browserSigning", () => ({
    exchangeSignedFetch: vi.fn(),
    SIGNING_ERRORS: {},
}));

vi.mock("./logger", () => ({
    logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

vi.mock("./toastService.svelte", () => ({
    toastService: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

function omsPosition(symbol: string, side: "long" | "short"): OMSPosition {
    return {
        symbol,
        side,
        amount: new Decimal(1),
        entryPrice: new Decimal(50000),
        unrealizedPnl: new Decimal(0),
        leverage: new Decimal(10),
        marginMode: "cross",
        lastUpdated: Date.now(),
        positionId: `${symbol}-${side}`,
    };
}

function venuePosition(symbol: string, side: string) {
    return {
        symbol,
        side,
        size: "1",
        entryPrice: "50000",
        markPrice: "51000",
        leverage: "10",
        marginMode: "cross",
    };
}

function positionsEnvelope(symbols: Array<{ symbol: string; side: string }>) {
    return {
        json: async () => ({
            success: true,
            data: { positions: symbols.map((s) => venuePosition(s.symbol, s.side)) },
        }),
    } as unknown as Response;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("BUG-0514 — closeAllPositions on Bitget", () => {
    it("closes what the exchange holds, not what the cache holds", async () => {
        // The cache knows one position; the exchange holds two.
        let store: OMSPosition[] = [omsPosition("BTCUSDT", "long")];
        vi.mocked(omsService.getPositions).mockImplementation(() => [...store]);
        vi.mocked(accountState.hydratePositions).mockImplementation((raw) => {
            store = raw.map((p) => omsPosition(p.symbol, p.side.toLowerCase() === "short" ? "short" : "long"));
        });
        let reads = 0;
        vi.mocked(exchangeSignedFetch).mockImplementation(async () => {
            reads += 1;
            // Pre-flatten: the exchange holds two. Post-flatten: flat.
            return reads === 1
                ? positionsEnvelope([
                      { symbol: "BTCUSDT", side: "long" },
                      { symbol: "ETHUSDT", side: "short" },
                  ])
                : positionsEnvelope([]);
        });
        const closeSpy = vi.spyOn(tradeService, "closePosition").mockResolvedValue({} as never);

        await tradeService.closeAllPositions();

        // The work list came from the exchange read …
        expect(exchangeSignedFetch).toHaveBeenCalledWith(
            expect.objectContaining({ cachyPath: "/api/positions" }),
        );
        expect(accountState.hydratePositions).toHaveBeenCalled();
        // … was mirrored into the OMS the closes resolve through …
        expect(vi.mocked(omsService.updatePosition)).toHaveBeenCalledTimes(2);
        // … and both positions were attempted, including the uncached one.
        expect(closeSpy).toHaveBeenCalledTimes(2);
        expect(closeSpy).toHaveBeenCalledWith(
            expect.objectContaining({ symbol: "ETHUSDT", positionSide: "short", forceFullClose: true }),
        );
        // The post-flatten read found nothing, so the mirrored entries were
        // evicted rather than left as ghosts a later single close would
        // size off.
        expect(vi.mocked(omsService.removePosition)).toHaveBeenCalledWith("BTCUSDT", "long");
        expect(vi.mocked(omsService.removePosition)).toHaveBeenCalledWith("ETHUSDT", "short");
        closeSpy.mockRestore();
    });

    it("reports a position that is still open instead of success", async () => {
        let store: OMSPosition[] = [];
        vi.mocked(omsService.getPositions).mockImplementation(() => [...store]);
        vi.mocked(accountState.hydratePositions).mockImplementation((raw) => {
            store = raw.map((p) => omsPosition(p.symbol, p.side.toLowerCase() === "short" ? "short" : "long"));
        });
        let reads = 0;
        vi.mocked(exchangeSignedFetch).mockImplementation(async () => {
            reads += 1;
            // Pre-flatten: two open. Post-flatten: ETHUSDT survived.
            return reads === 1
                ? positionsEnvelope([
                      { symbol: "BTCUSDT", side: "long" },
                      { symbol: "ETHUSDT", side: "long" },
                  ])
                : positionsEnvelope([{ symbol: "ETHUSDT", side: "long" }]);
        });
        const closeSpy = vi
            .spyOn(tradeService, "closePosition")
            .mockImplementation(async (params) => {
                if (params.symbol === "ETHUSDT") throw new Error("venue rejected");
                return {} as never;
            });

        await expect(tradeService.closeAllPositions()).rejects.toThrow("trade.closeAllFailed");
        expect(closeSpy).toHaveBeenCalledTimes(2);
        // The survivor is named — no plain success, and exactly one toast.
        expect(vi.mocked(toastService.error)).toHaveBeenCalledTimes(1);
        expect(vi.mocked(toastService.error)).toHaveBeenCalledWith(
            expect.stringContaining("ETHUSDT"),
        );
        closeSpy.mockRestore();
    });

    it("verifies against the paper book in paper mode, not the lagging OMS mirror", async () => {
        // The simulator owns the book; the OMS mirror only catches up on the
        // next price tick. Post-verify must read the book, or every paper
        // flatten would report leftovers that are already gone.
        let book = [venuePosition("BTCUSDT", "long")];
        const feedSpy = vi
            .spyOn(paperFeed, "paperAccountFeed")
            .mockReturnValue({ positions: () => [...book] } as never);
        vi.mocked(omsService.getPositions).mockReturnValue([omsPosition("BTCUSDT", "long")]);
        const closeSpy = vi
            .spyOn(tradeService, "closePosition")
            .mockImplementation(async () => {
                book = [];
                return {} as never;
            });

        await tradeService.closeAllPositions();

        expect(closeSpy).toHaveBeenCalledTimes(1);
        expect(vi.mocked(toastService.error)).not.toHaveBeenCalled();
        // No exchange read in paper mode — the book owns the truth.
        expect(exchangeSignedFetch).not.toHaveBeenCalled();
        closeSpy.mockRestore();
        feedSpy.mockRestore();
    });

    it("reports unverified when the post-flatten read itself fails", async () => {
        let store: OMSPosition[] = [];
        vi.mocked(omsService.getPositions).mockImplementation(() => [...store]);
        vi.mocked(accountState.hydratePositions).mockImplementation((raw) => {
            store = raw.map((p) => omsPosition(p.symbol, p.side.toLowerCase() === "short" ? "short" : "long"));
        });
        let reads = 0;
        vi.mocked(exchangeSignedFetch).mockImplementation(async () => {
            reads += 1;
            if (reads === 1) return positionsEnvelope([{ symbol: "BTCUSDT", side: "long" }]);
            throw new Error("network down");
        });
        const closeSpy = vi.spyOn(tradeService, "closePosition").mockResolvedValue({} as never);

        await expect(tradeService.closeAllPositions()).rejects.toThrow("trade.closeAllFailed");
        // The real i18n store translates: assert the rendered wording, which
        // names no symbol but says flat could not be confirmed.
        expect(vi.mocked(toastService.error)).toHaveBeenCalledWith(
            expect.stringContaining("could not be confirmed flat"),
        );
        closeSpy.mockRestore();
    });
});
