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
 * BUG-0548 review follow-up — the `modifyOrder` constructor does real
 * mapping work (live-order fallbacks, the `previousQuantity` the gate
 * compares against, the guarded `accountSize`), but every modify test
 * hand-builds its intent and bypasses the constructor. A regression in
 * the mapping would stay green and reopen the hole silently. These cases
 * go through `modifyOrder` with a mocked live read and assert what
 * reaches the gate and the wire.
 */

import { migrateAccounts } from "../stores/settings/accounts";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tradeService } from "./tradeService";
import { rmsService } from "./rmsService";
import { orderGate, OrderRefusedError, type OrderIntent } from "./orderGate";
import { tradeState } from "../stores/trade.svelte";
import { riskState } from "../stores/riskLimits.svelte";
import type { NormalizedOrder } from "../types/exchange";

vi.mock("$app/environment", () => ({ browser: true, dev: true }));

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
        feeRates: { bitunix: { maker: "0.02", taker: "0.05" } },
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

// Every intent the constructor verifies, in order — the mapping under test
// is what the gate saw, not what the test hand-built.
const seen: OrderIntent[] = [];
const realVerify = orderGate.verify.bind(orderGate);
vi.spyOn(orderGate, "verify").mockImplementation((intent: OrderIntent) => {
    seen.push(intent);
    return realVerify(intent);
});

const originalAccountSize = tradeState.accountSize;

function lastIntent(): OrderIntent {
    expect(seen).toHaveLength(1);
    return seen[0];
}

function mockLive(amount: Partial<NormalizedOrder> = {}) {
    vi.spyOn(tradeService, "getOrderDetail").mockResolvedValue(liveOrder(amount));
    return vi.spyOn(tradeService, "signedRequest").mockResolvedValue({ orderId: "o-9" });
}

function wireParams(spy: ReturnType<typeof mockLive>): Record<string, unknown> {
    return spy.mock.calls[0][1] as Record<string, unknown>;
}

beforeEach(() => {
    vi.clearAllMocks();
    seen.length = 0;
    riskState.resetLimits();
    tradeState.accountSize = "1000";
    rmsService.installGateHooks();
});

afterEach(() => {
    tradeState.accountSize = originalAccountSize;
    rmsService.uninstallGateHooks();
    riskState.resetLimits();
    vi.restoreAllMocks();
    // The module-level verify spy is re-armed after the restore so later
    // files sharing the module still record.
    vi.spyOn(orderGate, "verify").mockImplementation((intent: OrderIntent) => {
        seen.push(intent);
        return realVerify(intent);
    });
});

describe("modifyOrder — constructor mapping reaches the gate intact", () => {
    it("maps previousQuantity from the live amount and modifyQuantity from params", async () => {
        const wire = mockLive();

        await tradeService.modifyOrder({ orderId: "o-9", qty: "1" });

        const intent = lastIntent();
        expect(intent.displayed.previousQuantity?.toString()).toBe("0.2");
        expect(intent.displayed.modifyQuantity?.toString()).toBe("1");
        expect(wireParams(wire).qty).toBeDefined();
        expect(wire).toHaveBeenCalledTimes(1);
    });

    it("falls back qty, price and stops to the live order when params omit them", async () => {
        const wire = mockLive();

        await tradeService.modifyOrder({ orderId: "o-9" });

        const params = wireParams(wire);
        expect(params.qty).toBe("0.2");
        expect(params.price).toBe("50000");
        expect(params.slPrice).toBe("49000");
        expect(params.tpPrice).toBe("51000");
        // Same size as resting — an exempt price-only-shaped amendment.
        expect(lastIntent().displayed.modifyQuantity?.toString()).toBe("0.2");
    });

    it("keeps a price-only amendment approved and on the live size", async () => {
        const wire = mockLive();

        await tradeService.modifyOrder({ orderId: "o-9", price: "50100" });

        expect(wireParams(wire).qty).toBe("0.2");
        expect(wireParams(wire).price).not.toBe("50000");
        expect(wire).toHaveBeenCalledTimes(1);
    });

    it.each(["0", "-5", "bogus"])(
        "maps an unusable tradeState accountSize (%s) to undefined, not zero",
        async (size) => {
            mockLive();
            tradeState.accountSize = size;

            await tradeService.modifyOrder({ orderId: "o-9", qty: "0.1" });

            expect(lastIntent().displayed.accountSize).toBeUndefined();
        },
    );

    it("maps a funded accountSize through to the percent cap", async () => {
        mockLive();

        await tradeService.modifyOrder({ orderId: "o-9", qty: "0.1" });

        expect(lastIntent().displayed.accountSize?.toString()).toBe("1000");
    });

    it("refuses an enlargement the percent cap cannot measure", async () => {
        mockLive();
        tradeState.accountSize = "0";
        riskState.setLimit("maxPositionSizePercent", "1");

        await expect(
            tradeService.modifyOrder({ orderId: "o-9", qty: "1" }),
        ).rejects.toMatchObject({
            name: "OrderRefusedError",
            refusal: { field: "maxPositionSizePercent", reason: "missing" },
        });
    });

    it("treats a corrupt live amount as an increase, not a throw", async () => {
        mockLive({ amount: "bogus" });
        riskState.setLimit("maxPositionSizeUsdt", "10000");

        // A raw throw here would be the wrong taxonomy and no measurement;
        // undefined feeds the fail-closed increase path instead.
        await expect(
            tradeService.modifyOrder({ orderId: "o-9" }),
        ).rejects.toBeInstanceOf(OrderRefusedError);

        const intent = lastIntent();
        expect(intent.displayed.previousQuantity).toBeUndefined();
        expect(intent.displayed.modifyQuantity).toBeUndefined();
    });

    it("refuses an enlargement past the absolute cap end to end", async () => {
        mockLive();
        riskState.setLimit("maxPositionSizeUsdt", "10000");

        await expect(
            tradeService.modifyOrder({ orderId: "o-9", qty: "1" }),
        ).rejects.toMatchObject({
            refusal: { field: "maxPositionSize", values: { actual: "50000" } },
        });
    });

    it("approves a shrink against caps that would refuse an increase", async () => {
        const wire = mockLive();
        riskState.setLimit("maxPositionSizeUsdt", "1");
        riskState.setLimit("maxLossPerTradeUsdt", "1");

        await tradeService.modifyOrder({ orderId: "o-9", qty: "0.1" });

        expect(wire).toHaveBeenCalledTimes(1);
    });
});
