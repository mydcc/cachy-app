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
 * BUG-0249 — used margin and available balance stayed stale after closing a
 * position because no mutating order path eagerly refreshed accountState.
 * `gatedRequest` (the single choke point every mutating order goes through)
 * now calls `accountState.requestSync()` on every successful submission;
 * this locks that behaviour in for the three paths the bug named explicitly.
 */

import { migrateAccounts } from "../stores/settings/accounts";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("$app/environment", () => ({ browser: true, dev: true }));
vi.mock("./logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../stores/settings.svelte", () => ({
    settingsState: {
        apiProvider: "bitunix",
        ...migrateAccounts({ apiKeys: { bitunix: { key: "test-key-1234", secret: "s" } } }),
    },
}));
vi.mock("./toastService.svelte", () => ({
    toastService: { error: vi.fn(), success: vi.fn(), add: vi.fn() },
}));
vi.mock("../stores/market.svelte", async () => {
    const { Decimal } = await import("decimal.js");
    return {
        marketState: {
            data: { BTCUSDT: { lastPrice: new Decimal(50000) } },
            symbolMeta: {},
        },
    };
});

import { tradeService } from "./tradeService";
import { omsService } from "./omsService";
import { accountState } from "../stores/account.svelte";
import { registerKillSwitch, registerRiskLimitCheck } from "./orderGate";

function displayed() {
    return {
        accountSize: new Decimal(1000),
        riskPercentage: new Decimal(1),
        entryPrice: new Decimal(50000),
        stopLossPrice: new Decimal(49500),
        takeProfits: [new Decimal(51000)],
        leverage: new Decimal(10),
        marginMode: "ISOLATED",
        accountStateAt: Date.now(),
    };
}

describe("BUG-0249 — post-action account reconciliation", () => {
    let requestSyncSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.spyOn(tradeService, "signedRequest").mockImplementation(async () => ({
            code: "0",
            data: { orderId: "o-1" },
        }));
        requestSyncSpy = vi.spyOn(accountState, "requestSync").mockImplementation(() => {});
        registerKillSwitch(null);
        registerRiskLimitCheck(null);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        registerKillSwitch(null);
        registerRiskLimitCheck(null);
    });

    it("closePosition triggers an eager account sync", async () => {
        vi.spyOn(omsService, "getPositions").mockReturnValue([
            {
                symbol: "BTCUSDT",
                side: "long",
                amount: new Decimal("0.02"),
                positionId: "p-1",
                lastUpdated: Date.now(),
            } as never,
        ]);

        await tradeService.closePosition({
            symbol: "BTCUSDT",
            positionSide: "long",
            forceFullClose: true,
        });

        expect(requestSyncSpy).toHaveBeenCalled();
    });

    it("placeOrder triggers an eager account sync", async () => {
        await tradeService.placeOrder({
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "LIMIT",
            qty: new Decimal("0.02"),
            price: new Decimal(50000),
            takeProfit: { price: new Decimal(51000) },
            stopLoss: { price: new Decimal(49500) },
            displayed: displayed(),
        });

        expect(requestSyncSpy).toHaveBeenCalled();
    });

    it("flashClosePosition triggers an eager account sync", async () => {
        vi.spyOn(omsService, "getPositions").mockReturnValue([
            {
                symbol: "BTCUSDT",
                side: "long",
                amount: new Decimal("0.02"),
                positionId: "p-1",
                lastUpdated: Date.now(),
            } as never,
        ]);
        vi.spyOn(omsService, "addOptimisticOrder").mockImplementation(() => {});
        vi.spyOn(omsService, "removeOrder").mockImplementation(() => {});
        vi.spyOn(omsService, "getOrder").mockReturnValue(undefined as never);
        vi.spyOn(omsService, "updateOrder").mockImplementation(() => {});

        const result = await tradeService.flashClosePosition("BTCUSDT", "long");

        expect(result.success).toBe(true);
        expect(requestSyncSpy).toHaveBeenCalled();
    });

    it("does NOT sync when the order is refused before submission", async () => {
        registerKillSwitch(() => true);

        await expect(
            tradeService.placeOrder({
                symbol: "BTCUSDT",
                side: "BUY",
                orderType: "LIMIT",
                qty: new Decimal("0.02"),
                price: new Decimal(50000),
                takeProfit: { price: new Decimal(51000) },
                stopLoss: { price: new Decimal(49500) },
                displayed: displayed(),
            }),
        ).rejects.toBeDefined();

        expect(requestSyncSpy).not.toHaveBeenCalled();
    });
});
