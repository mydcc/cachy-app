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
 * FEAT-0070 — creating TP/SL where none exists.
 *
 * What these cover is the wire format: Bitunix accepts two different create
 * endpoints with overlapping but not identical field sets, and a leg that
 * reaches the wrong one, or reaches the right one without its quantity, is a
 * position left unprotected in a way nothing on screen would show.
 */

import { migrateAccounts } from "../stores/settings/accounts";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { tradeService } from "./tradeService";
import { Decimal } from "decimal.js";

vi.mock("./omsService", () => ({
    omsService: {
        getPositions: vi.fn(() => []),
        updatePosition: vi.fn(),
        addOptimisticOrder: vi.fn(),
        removeOrder: vi.fn(),
        getOrder: vi.fn(),
        updateOrder: vi.fn(),
    },
}));

vi.mock("../stores/settings.svelte", () => ({
    settingsState: {
        apiProvider: "bitunix",
        ...migrateAccounts({ apiKeys: { bitunix: { key: "test-key", secret: "test-secret" } } }),
        appAccessToken: "test-token",
        secretsReady: Promise.resolve(),
    },
}));

vi.mock("../stores/market.svelte", async () => {
    const { Decimal } = await import("decimal.js");
    return {
        marketState: {
            data: { BTCUSDT: { lastPrice: new Decimal(60000) } },
            symbolMeta: {},
        },
    };
});

vi.mock("./logger", () => ({
    logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

vi.mock("./toastService.svelte", () => ({
    toastService: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

/** The order-gate pass every state-mutating call carries; see FEAT-0011. */
const GATE_PASS = expect.anything();

function spyRequest() {
    return vi
        .spyOn(tradeService, "signedRequest")
        .mockResolvedValue({ orderId: "tp-1" });
}

/** The params object as it reached the proxy route. */
function sentParams(spy: ReturnType<typeof spyRequest>): Record<string, unknown> {
    const body = spy.mock.calls[0][2] as { params: Record<string, unknown> };
    return body.params;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("FEAT-0070 — position-wide TP/SL", () => {
    it("targets the position endpoint, not the partial one", async () => {
        const spy = spyRequest();

        await tradeService.placePositionTpSl({
            symbol: "BTCUSDT",
            positionId: "pos-1",
            takeProfit: { price: new Decimal(70000) },
        });

        expect(spy).toHaveBeenCalledTimes(1);
        const [method, endpoint, body] = spy.mock.calls[0];
        expect(method).toBe("POST");
        expect(endpoint).toBe("/api/tpsl");
        expect((body as { action: string }).action).toBe("place-position");
        expect(spy).toHaveBeenCalledWith("POST", "/api/tpsl", expect.anything(), GATE_PASS);
    });

    it("sends both legs when both are given", async () => {
        const spy = spyRequest();

        await tradeService.placePositionTpSl({
            symbol: "BTCUSDT",
            positionId: "pos-1",
            takeProfit: { price: new Decimal(70000) },
            stopLoss: { price: new Decimal(55000) },
        });

        const params = sentParams(spy);
        expect(params.tpPrice).toBe("70000");
        expect(params.slPrice).toBe("55000");
        expect(params.positionId).toBe("pos-1");
    });

    it("omits the leg that was not given rather than sending an empty one", async () => {
        const spy = spyRequest();

        await tradeService.placePositionTpSl({
            symbol: "BTCUSDT",
            positionId: "pos-1",
            stopLoss: { price: new Decimal(55000) },
        });

        const params = sentParams(spy);
        expect(params.slPrice).toBe("55000");
        expect("tpPrice" in params).toBe(false);
        expect("tpStopType" in params).toBe(false);
    });

    it("defaults the trigger type to the mark price", async () => {
        // Matches what the modify flow already sends, so a plan created here
        // and one edited there do not silently trigger off different prices.
        const spy = spyRequest();

        await tradeService.placePositionTpSl({
            symbol: "BTCUSDT",
            positionId: "pos-1",
            takeProfit: { price: new Decimal(70000) },
        });

        expect(sentParams(spy).tpStopType).toBe("MARK_PRICE");
    });

    it("honours an explicit trigger type", async () => {
        const spy = spyRequest();

        await tradeService.placePositionTpSl({
            symbol: "BTCUSDT",
            positionId: "pos-1",
            takeProfit: { price: new Decimal(70000), stopType: "LAST_PRICE" },
        });

        expect(sentParams(spy).tpStopType).toBe("LAST_PRICE");
    });

    it("refuses to send a plan with no leg at all", async () => {
        const spy = spyRequest();

        await expect(
            tradeService.placePositionTpSl({ symbol: "BTCUSDT", positionId: "pos-1" }),
        ).rejects.toThrow("apiErrors.tpslNoLeg");

        expect(spy).not.toHaveBeenCalled();
    });

    it("serialises prices as plain decimal strings, never exponential", async () => {
        // "1e-7" is rejected by the exchange; formatApiNum exists for this.
        const spy = spyRequest();

        await tradeService.placePositionTpSl({
            symbol: "BTCUSDT",
            positionId: "pos-1",
            takeProfit: { price: new Decimal("0.0000001") },
        });

        expect(sentParams(spy).tpPrice).toBe("0.0000001");
    });
});

describe("FEAT-0070 — partial TP/SL with an explicit quantity", () => {
    it("targets the partial endpoint", async () => {
        const spy = spyRequest();

        await tradeService.placeTpSlOrder({
            symbol: "BTCUSDT",
            positionId: "pos-1",
            takeProfit: { price: new Decimal(70000), qty: new Decimal("0.5") },
        });

        expect((spy.mock.calls[0][2] as { action: string }).action).toBe("place");
    });

    it("carries the quantity with its leg", async () => {
        const spy = spyRequest();

        await tradeService.placeTpSlOrder({
            symbol: "BTCUSDT",
            positionId: "pos-1",
            takeProfit: { price: new Decimal(70000), qty: new Decimal("0.5") },
            stopLoss: { price: new Decimal(55000), qty: new Decimal("1") },
        });

        const params = sentParams(spy);
        expect(params.tpPrice).toBe("70000");
        expect(params.tpQty).toBe("0.5");
        expect(params.slPrice).toBe("55000");
        expect(params.slQty).toBe("1");
    });

    it("defaults each leg to a market close", async () => {
        const spy = spyRequest();

        await tradeService.placeTpSlOrder({
            symbol: "BTCUSDT",
            positionId: "pos-1",
            takeProfit: { price: new Decimal(70000), qty: new Decimal("0.5") },
        });

        expect(sentParams(spy).tpOrderType).toBe("MARKET");
    });

    it("sends a limit order price only when a limit order was asked for", async () => {
        const spy = spyRequest();

        await tradeService.placeTpSlOrder({
            symbol: "BTCUSDT",
            positionId: "pos-1",
            takeProfit: {
                price: new Decimal(70000),
                qty: new Decimal("0.5"),
                orderType: "LIMIT",
                orderPrice: new Decimal(69950),
            },
        });

        const params = sentParams(spy);
        expect(params.tpOrderType).toBe("LIMIT");
        expect(params.tpOrderPrice).toBe("69950");
    });

    it("does not invent an order price for a market leg", async () => {
        const spy = spyRequest();

        await tradeService.placeTpSlOrder({
            symbol: "BTCUSDT",
            positionId: "pos-1",
            stopLoss: { price: new Decimal(55000), qty: new Decimal("1") },
        });

        expect("slOrderPrice" in sentParams(spy)).toBe(false);
    });

    it("refuses to send a plan with no leg at all", async () => {
        const spy = spyRequest();

        await expect(
            tradeService.placeTpSlOrder({ symbol: "BTCUSDT", positionId: "pos-1" }),
        ).rejects.toThrow("apiErrors.tpslNoLeg");

        expect(spy).not.toHaveBeenCalled();
    });

    it("leaves the caller's quantity exactly as given", async () => {
        // Unlike closePosition, which derives a quantity from a percentage and
        // rounds it, this one is handed a quantity someone decided. Rounding it
        // again would move a number the trader typed.
        const spy = spyRequest();

        await tradeService.placeTpSlOrder({
            symbol: "BTCUSDT",
            positionId: "pos-1",
            takeProfit: { price: new Decimal(70000), qty: new Decimal("0.123456") },
        });

        expect(sentParams(spy).tpQty).toBe("0.123456");
    });
});
