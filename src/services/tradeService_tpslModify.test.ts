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
 * BUG-0293 — `modifyTpSlOrder` sent a wire body `POST /tpsl/modify_order`
 * does not document: `{orderId, symbol, planType, triggerPrice, qty}`. The
 * venue reads `tpPrice`/`slPrice` (at least one required), each with its own
 * stop type, order type/price and quantity. Every call the old shape made
 * would have violated that "at least one" rule — this proves the wire it
 * builds now actually matches the documented endpoint.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { tradeService } from "./tradeService";

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
        apiKeys: { bitunix: { key: "test-key", secret: "test-secret" } },
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

function spyRequest() {
    return vi
        .spyOn(tradeService, "signedRequest")
        .mockResolvedValue({ orderId: "1" });
}

function sentParams(spy: ReturnType<typeof spyRequest>): Record<string, unknown> {
    const body = spy.mock.calls[0][2] as { params: Record<string, unknown> };
    return body.params;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("modifyTpSlOrder — wire shape", () => {
    it("sends tpPrice, not the old triggerPrice/planType shape", async () => {
        const spy = spyRequest();

        await tradeService.modifyTpSlOrder({
            orderId: "1",
            symbol: "BTCUSDT",
            planType: "PROFIT",
            triggerPrice: "70000",
        });

        const params = sentParams(spy);
        expect(params.tpPrice).toBe("70000");
        expect("triggerPrice" in params).toBe(false);
        expect("planType" in params).toBe(false);
    });

    it("sends slPrice for a LOSS leg, not tpPrice", async () => {
        const spy = spyRequest();

        await tradeService.modifyTpSlOrder({
            orderId: "1",
            symbol: "BTCUSDT",
            planType: "LOSS",
            triggerPrice: "55000",
        });

        const params = sentParams(spy);
        expect(params.slPrice).toBe("55000");
        expect("tpPrice" in params).toBe(false);
    });

    it("does not send symbol on the wire — the endpoint has no such parameter", async () => {
        const spy = spyRequest();

        await tradeService.modifyTpSlOrder({
            orderId: "1",
            symbol: "BTCUSDT",
            planType: "PROFIT",
            triggerPrice: "70000",
        });

        expect("symbol" in sentParams(spy)).toBe(false);
    });

    it("defaults the trigger type to mark price", async () => {
        const spy = spyRequest();

        await tradeService.modifyTpSlOrder({
            orderId: "1",
            symbol: "BTCUSDT",
            planType: "PROFIT",
            triggerPrice: "70000",
        });

        expect(sentParams(spy).tpStopType).toBe("MARK_PRICE");
    });

    it("honours an explicit trigger type", async () => {
        const spy = spyRequest();

        await tradeService.modifyTpSlOrder({
            orderId: "1",
            symbol: "BTCUSDT",
            planType: "LOSS",
            triggerPrice: "55000",
            stopType: "LAST_PRICE",
        });

        expect(sentParams(spy).slStopType).toBe("LAST_PRICE");
    });

    it("carries a quantity change on the same leg it prices", async () => {
        const spy = spyRequest();

        await tradeService.modifyTpSlOrder({
            orderId: "1",
            symbol: "BTCUSDT",
            planType: "PROFIT",
            triggerPrice: "70000",
            qty: "0.5",
        });

        expect(sentParams(spy).tpQty).toBe("0.5");
    });

    it("omits qty rather than sending it empty when none was given", async () => {
        const spy = spyRequest();

        await tradeService.modifyTpSlOrder({
            orderId: "1",
            symbol: "BTCUSDT",
            planType: "PROFIT",
            triggerPrice: "70000",
        });

        expect("tpQty" in sentParams(spy)).toBe(false);
    });

    it("reaches the exchange rather than being refused by its own gate", async () => {
        // `priceFields` tells the FEAT-0011 gate where on the wire to find
        // the price it displayed to the trader (orderGate.ts checkPrices).
        // Point it at a field that does not exist — "triggerPrice", the old
        // one — and the gate finds nothing there and refuses the request
        // before it ever reaches `signedRequest`. This call succeeding is
        // proof `priceFields` names the field this fix actually sends.
        const spy = spyRequest();

        await tradeService.modifyTpSlOrder({
            orderId: "1",
            symbol: "BTCUSDT",
            planType: "LOSS",
            triggerPrice: "55000",
        });

        expect(spy).toHaveBeenCalledTimes(1);
    });
});
