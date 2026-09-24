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
 * BUG-0550 review follow-up — every raw `new Decimal` in the `modifyOrder`
 * constructor refuses typed (`OrderRefusedError`) instead of throwing raw
 * past the gate. These cases throw before `gatedRequest`, so they need no
 * gate cooperation — only a mocked live read and an unreached transport.
 */

import { migrateAccounts } from "../stores/settings/accounts";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { tradeService } from "./tradeService";
import { OrderRefusedError } from "./orderGate";
import type { NormalizedOrder } from "../types/exchange";

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
    logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

vi.mock("./toastService.svelte", () => ({
    toastService: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

function liveOrder(overrides: Partial<NormalizedOrder> = {}): NormalizedOrder {
    return {
        id: "1",
        orderId: "o-9",
        clientId: "c-9",
        symbol: "BTCUSDT",
        type: "order",
        side: "BUY",
        price: "50000",
        amount: "0.2",
        filled: "0",
        status: "open",
        time: Date.now(),
        fee: "0",
        realizedPNL: "0",
        tpPrice: "51000",
        tpStopType: "MARK_PRICE",
        tpOrderType: "MARKET",
        slPrice: "49000",
        slStopType: "MARK_PRICE",
        slOrderType: "MARKET",
        ...overrides,
    };
}

function mockLive(order: NormalizedOrder) {
    vi.spyOn(tradeService, "getOrderDetail").mockResolvedValue(order);
    return vi.spyOn(tradeService, "signedRequest").mockResolvedValue({ orderId: "o-9" });
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("modifyOrder — corrupt inputs refuse typed instead of throwing raw", () => {
    it("refuses a corrupt stop price with the stop field named", async () => {
        const wire = mockLive(liveOrder());

        await expect(
            tradeService.modifyOrder({ orderId: "o-9", slPrice: "bogus" }),
        ).rejects.toMatchObject({ refusal: { field: "stopLoss" } });
        expect(wire).not.toHaveBeenCalled();
    });

    it("refuses a corrupt target price with the target field named", async () => {
        const wire = mockLive(liveOrder());

        await expect(
            tradeService.modifyOrder({ orderId: "o-9", tpPrice: "bogus" }),
        ).rejects.toMatchObject({ refusal: { field: "takeProfit" } });
        expect(wire).not.toHaveBeenCalled();
    });

    it("refuses a corrupt quantity with the quantity field named", async () => {
        const wire = mockLive(liveOrder());

        await expect(
            tradeService.modifyOrder({ orderId: "o-9", qty: "bogus" }),
        ).rejects.toMatchObject({ refusal: { field: "modifyQuantity" } });
        expect(wire).not.toHaveBeenCalled();
    });

    it("refuses a corrupt live amount even when the caller states no quantity", async () => {
        const wire = mockLive(liveOrder({ amount: "bogus" }));

        await expect(tradeService.modifyOrder({ orderId: "o-9" })).rejects.toThrow(
            OrderRefusedError,
        );
        expect(wire).not.toHaveBeenCalled();
    });
});
