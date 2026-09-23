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
 * BUG-0527 — single close on Bitget throws POSITION_NOT_FOUND before it
 * starts, because nothing feeds the OMS there: `ensurePositionFreshness`
 * resolves exclusively through `omsService.getPositions()`, and its only
 * fallback (`fetchOpenPositionsFromApi`) returns early for any non-Bitunix
 * provider. These tests pin the fixed contract: the close resolves its
 * amount through the exchange-fresh `/api/positions` read Cachy already
 * performs, mirrored into the OMS with the bulk path's eviction guarantee —
 * no fresh reads bypassing the OMS, no bypass of the 200 ms staleness rule.
 *
 * The mocked store stands in for the OMS: `updatePosition` upserts and
 * `removePosition` deletes, exactly as the real service would, so the
 * re-read after the fallback sees what the mirror wrote.
 */

import { migrateAccounts } from "../stores/settings/accounts";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { tradeService, TRADE_ERRORS } from "./tradeService";
import { omsService } from "./omsService";
import { exchangeSignedFetch } from "../utils/exchange/browserSigning";
import { Decimal } from "decimal.js";
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

function venuePosition(symbol: string, side: string, size: string) {
    return {
        symbol,
        side,
        size,
        entryPrice: "50000",
        markPrice: "51000",
        leverage: "10",
        marginMode: "cross",
    };
}

function positionsEnvelope(positions: Array<{ symbol: string; side: string; size: string }>) {
    return {
        ok: true,
        json: async () => ({
            success: true,
            data: { positions: positions.map((p) => venuePosition(p.symbol, p.side, p.size)) },
        }),
        text: async () =>
            JSON.stringify({
                success: true,
                data: { positions: positions.map((p) => venuePosition(p.symbol, p.side, p.size)) },
            }),
    } as unknown as Response;
}

function orderResponse() {
    return {
        ok: true,
        json: async () => ({ code: "0", data: { orderId: "1" } }),
        text: async () => JSON.stringify({ code: "0", data: { orderId: "1" } }),
    } as unknown as Response;
}

/**
 * Both the `/api/positions` read and the order send travel through
 * `exchangeSignedFetch` — route by path and record the order payloads, so
 * the tests pin what the close actually sends.
 */
function useExchangeMock(positions: Array<{ symbol: string; side: string; size: string }>) {
    const orderPayloads: Array<Record<string, unknown>> = [];
    vi.mocked(exchangeSignedFetch).mockImplementation(async (args: unknown) => {
        const { cachyPath, payload } = args as {
            cachyPath: string;
            payload: Record<string, unknown>;
        };
        if (cachyPath === "/api/positions") return positionsEnvelope(positions);
        orderPayloads.push(payload);
        return orderResponse();
    });
    return orderPayloads;
}

/** Live OMS stand-in: upserts and deletes land in the store the re-read sees. */
function useLiveOmsStore(seed: OMSPosition[] = []) {
    let store: OMSPosition[] = [...seed];
    vi.mocked(omsService.getPositions).mockImplementation(() => [...store]);
    vi.mocked(omsService.updatePosition).mockImplementation((p) => {
        const at = store.findIndex((e) => e.symbol === p.symbol && e.side === p.side);
        const entry = { ...p } as OMSPosition;
        if (at >= 0) store[at] = { ...store[at], ...entry };
        else store.push(entry);
    });
    vi.mocked(omsService.removePosition).mockImplementation((symbol, side) => {
        store = store.filter((e) => !(e.symbol === symbol && e.side === side));
    });
    return () => store;
}

function staleOmsPosition(symbol: string, side: "long" | "short", amount: string): OMSPosition {    return {
        symbol,
        side,
        amount: new Decimal(amount),
        entryPrice: new Decimal(50000),
        unrealizedPnl: new Decimal(0),
        leverage: new Decimal(10),
        marginMode: "cross",
        lastUpdated: Date.now() - 60_000,
    };
}

describe("BUG-0527 — closePosition on Bitget", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("sends one reduce-only order with the exchange-fresh amount when the OMS is empty", async () => {
        useLiveOmsStore([]);
        const orderPayloads = useExchangeMock([{ symbol: "BTCUSDT", side: "long", size: "0.5" }]);

        await tradeService.closePosition({
            symbol: "BTCUSDT",
            positionSide: "long",
            forceFullClose: true,
        });

        // The amount came from the exchange read, not from a caller guess.
        expect(exchangeSignedFetch).toHaveBeenCalledWith(
            expect.objectContaining({ cachyPath: "/api/positions" }),
        );
        expect(orderPayloads).toHaveLength(1);
        expect(orderPayloads[0].type).toBe("place-order");
        expect(orderPayloads[0].qty).toBe("0.5");
        expect(orderPayloads[0].reduceOnly).toBe(true);
    });

    it("sizes off the exchange-fresh amount, not a stale OMS entry", async () => {
        useLiveOmsStore([staleOmsPosition("BTCUSDT", "long", "1")]);
        const orderPayloads = useExchangeMock([{ symbol: "BTCUSDT", side: "long", size: "0.5" }]);

        await tradeService.closePosition({
            symbol: "BTCUSDT",
            positionSide: "long",
            forceFullClose: true,
        });

        expect(orderPayloads).toHaveLength(1);
        expect(orderPayloads[0].qty).toBe("0.5");
    });

    it("evicts a mirrored ghost the exchange no longer lists instead of closing it", async () => {
        useLiveOmsStore([staleOmsPosition("BTCUSDT", "long", "1")]);
        const orderPayloads = useExchangeMock([]);

        await expect(
            tradeService.closePosition({
                symbol: "BTCUSDT",
                positionSide: "long",
                forceFullClose: true,
            }),
        ).rejects.toThrow(TRADE_ERRORS.POSITION_NOT_FOUND);

        // The ghost is gone — a later single close cannot size off it.
        expect(vi.mocked(omsService.removePosition)).toHaveBeenCalledWith("BTCUSDT", "long");
        expect(orderPayloads).toHaveLength(0);
    });
});
