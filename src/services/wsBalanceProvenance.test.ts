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
 * BUG-0565 — live pushes and paper hydration share one store.
 *
 * The private WS channels stay subscribed across a mode switch, so a live
 * wallet/position/order push arriving while paper mode is on used to
 * overwrite the simulated state — whichever writer ran last won regardless
 * of what the trader was trading against. Each test here stages exactly
 * that: paper on, then a live push, then the read the money path takes.
 * Without the fix the live value leaks into the paper measurement and the
 * assertions fail; with it the push is refused and the paper state stands.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Decimal } from "decimal.js";
import { migrateAccounts } from "../stores/settings/accounts";

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

const appFetchMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/appAuth", () => ({
    appFetch: appFetchMock,
    appAuthHeaders: () => ({}),
}));

import { tradeService } from "./tradeService";
import { paperTradingService } from "./paperTradingService";
import { paperState } from "../stores/paperTrading.svelte";
import { accountState } from "../stores/account.svelte";
import { tradeState } from "../stores/trade.svelte";
import { marketState } from "../stores/market.svelte";
import { registerKillSwitch, registerRiskLimitCheck, registerAuditRecorder } from "./orderGate";
import type { OrderAttempt } from "./orderGate";

let attempts: OrderAttempt[] = [];

beforeEach(() => {
    attempts = [];
    appFetchMock.mockReset();
    localStorage.clear();
    paperState.reloadFromStorage();
    paperState.resetBook();
    paperState.setConfig("startingBalance", "10000");
    paperState.resetBook();
    paperTradingService.setEnabled(false);
    accountState.reset();
    tradeState.clearRemoteAccountState();
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
    registerAuditRecorder((a) => attempts.push(a));
    marketState.setSymbolMeta("BTCUSDT", {
        symbol: "BTCUSDT",
        basePrecision: 4,
        quotePrecision: 2,
        minTradeVolume: null,
        maxLimitOrderVolume: null,
        maxMarketOrderVolume: null,
        minLeverage: 1,
        maxLeverage: 125,
        defaultLeverage: 10,
        priceProtectScope: null,
        symbolStatus: "OPEN",
        isApiSupported: true,
    });
    vi.spyOn(tradeService, "signedRequest").mockImplementation(async (_e, payload) => {
        return { code: "0", data: { orderId: "o-1", clientId: payload.clientId } };
    });
});

afterEach(() => {
    paperTradingService.setEnabled(false);
    accountState.reset();
    tradeState.clearRemoteAccountState();
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
    registerAuditRecorder(null);
    vi.restoreAllMocks();
});

/** A live wallet push, as `channelDispatch` delivers it. */
function liveWalletPush(available: string) {
    accountState.updateBalanceFromWs({ coin: "USDT", available, margin: "0", frozen: "0" });
}

function paperAvailable(): string | undefined {
    return accountState.readUsdtBalance("paper")?.available.toString();
}

describe("BUG-0565 — a live push while paper mode is on", () => {
    it("does not overwrite the simulated balance (AC1)", () => {
        paperTradingService.setEnabled(true);
        const before = paperAvailable();
        expect(before).toBe("10000");

        liveWalletPush("999999");

        // Without the fix the live value wins and this reads 999999.
        expect(paperAvailable()).toBe("10000");
        expect(accountState.readUsdtBalance("live")).toBeUndefined();
    });

    it("reads paper in paper and live in live across a toggle (AC2)", () => {
        paperTradingService.setEnabled(true);
        liveWalletPush("999999");
        expect(paperAvailable()).toBe("10000");

        paperTradingService.setEnabled(false);
        liveWalletPush("500");
        expect(accountState.readUsdtBalance("live")?.available.toString()).toBe("500");
        expect(paperAvailable()).toBeUndefined();

        paperTradingService.setEnabled(true);
        expect(paperAvailable()).toBe("10000");
        expect(accountState.readUsdtBalance("live")).toBeUndefined();
    });

    it("refuses live position and order pushes while paper is on", () => {
        paperTradingService.setEnabled(true);
        expect(accountState.positions).toHaveLength(0);

        accountState.updatePositionFromWs({
            positionId: "live-1",
            symbol: "BTCUSDT",
            side: "long",
            qty: "1",
            averagePrice: "50000",
            leverage: "10",
        });
        accountState.updateOrderFromWs({
            orderId: "live-o-1",
            symbol: "BTCUSDT",
            side: "buy",
            type: "limit",
            price: "49000",
            qty: "1",
            orderStatus: "NEW",
        });

        expect(accountState.positions).toHaveLength(0);
        expect(accountState.openOrders).toHaveLength(0);
    });

    it("measures a simulated open against the paper balance, ignoring the live push", async () => {
        paperTradingService.setEnabled(true);
        // A live $1 push while paper is on. Without the fix it overwrites
        // the simulated $10k and the gate refuses for insufficient margin.
        liveWalletPush("1");

        await tradeService.placeOrder({
            symbol: "BTCUSDT",
            side: "BUY",
            origin: "manual",
            orderType: "LIMIT",
            qty: new Decimal("0.02"),
            price: new Decimal(50000),
            takeProfit: { price: new Decimal(51000) },
            stopLoss: { price: new Decimal(49500) },
            displayed: {
                accountSize: new Decimal(1000),
                riskPercentage: new Decimal(1),
                entryPrice: new Decimal(50000),
                stopLossPrice: new Decimal(49500),
                takeProfits: [new Decimal(51000)],
                leverage: new Decimal(10),
                marginMode: "ISOLATED",
                accountStateAt: Date.now(),
            },
        });

        // Measured against the $10k paper balance (required: $100), not the
        // $1 live push — the order stands and the check is marked as run.
        expect(attempts).toHaveLength(1);
        expect(attempts[0]?.checked).toContain("availableMargin");
        expect(attempts[0]?.checked).not.toContain("availableMarginUnmeasured");
        expect(attempts[0]?.refusal).toBeUndefined();
    });
});
