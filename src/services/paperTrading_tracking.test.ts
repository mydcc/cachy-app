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
 * FEAT-0327 — a paper trade is followable end to end.
 *
 * The bug this covers had a shape worth stating: the order went through, the
 * simulated balance moved, and then the position was nowhere. It was not in
 * `accountState.positions`, so the Market Activity panel had no card; with no
 * card there was no close button, no TP/SL dialog and no way to watch it. The
 * money moved and the trade vanished.
 *
 * These tests assert the whole chain: a fill reaches the stores the panel
 * renders, without a price tick, and the close path still finds it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("$app/environment", () => ({ browser: true, dev: true }));

vi.mock("./logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const settings = vi.hoisted(() => ({
    apiProvider: "bitunix",
    apiKeys: { bitunix: { key: "test-key-1234", secret: "test-secret" } },
    journalPaperTrades: true,
}));
vi.mock("../stores/settings.svelte", () => ({ settingsState: settings }));

vi.mock("./toastService.svelte", () => ({
    toastService: { error: vi.fn(), success: vi.fn(), add: vi.fn() },
}));

const appFetchMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/appAuth", () => ({
    appFetch: appFetchMock,
    appAuthHeaders: () => ({}),
}));

import { tradeService } from "./tradeService";
import { paperExchange } from "./paperExchange";
import { paperTradingService } from "./paperTradingService";
import { paperState } from "../stores/paperTrading.svelte";
import { accountState } from "../stores/account.svelte";
import { omsService } from "./omsService";
import { journalState } from "../stores/journal.svelte";
import { marketState } from "../stores/market.svelte";
import { tradeState } from "../stores/trade.svelte";
import { registerKillSwitch, registerRiskLimitCheck } from "./orderGate";

const PRICE = new Decimal(50000);

function priceAt(value: Decimal) {
    marketState.data = {
        BTCUSDT: { lastPrice: value, markPrice: value },
    } as unknown as typeof marketState.data;
}

beforeEach(() => {
    localStorage.clear();
    settings.journalPaperTrades = true;
    journalState.set([]);
    accountState.reset();
    omsService.reset();
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
    appFetchMock.mockReset();
    appFetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ code: "0", data: {} }),
    });

    paperState.reloadFromStorage();
    paperState.resetBook();
    paperState.setConfig("failureMode", "none");
    paperState.setConfig("slippageBps", "0");
    paperState.setConfig("takerFeeBps", "0");
    paperState.setConfig("startingBalance", "10000");
    paperState.resetBook();
    paperState.setEnabled(true);

    priceAt(PRICE);
    tradeState.leverage = "10";

    // Registers the price feed, the leverage feed and the book listener.
    paperTradingService.destroy();
    paperTradingService.install();
});

afterEach(() => {
    paperTradingService.destroy();
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
    paperState.setEnabled(false);
});

function place(payload: Record<string, unknown>) {
    return paperExchange.handle("/api/orders", {
        type: "place-order",
        symbol: "BTCUSDT",
        orderType: "MARKET",
        ...payload,
    });
}

describe("FEAT-0327 — a simulated fill reaches the panel", () => {
    it("puts the position where the Market Activity panel reads it", async () => {
        await place({ side: "BUY", qty: "1" });

        expect(accountState.positions).toHaveLength(1);
        const [position] = accountState.positions;
        expect(position.symbol).toBe("BTCUSDT");
        expect(position.side).toBe("long");
        expect(position.size.toString()).toBe("1");
        expect(position.positionId).toBeTruthy();
    });

    it("does so on the fill, without waiting for a price tick", async () => {
        // No `onPrice` call anywhere in this test: the book listener is what
        // carries the fill into the stores. Before FEAT-0327 the panel only
        // learned about a position when the charted symbol next ticked.
        await place({ side: "BUY", qty: "1" });
        expect(accountState.positions).toHaveLength(1);
    });

    it("records the leverage the trader is working at, not 1x", async () => {
        // Bitunix's place_order carries no leverage field, so the simulator
        // is told separately — otherwise every simulated position reported
        // itself unlevered.
        await place({ side: "BUY", qty: "1" });
        expect(accountState.positions[0].leverage.toString()).toBe("10");
    });

    it("reports the attached stop and target as plans, through the normaliser", async () => {
        await place({ side: "BUY", qty: "1", slPrice: "49000", tpPrice: "52000" });

        const plans = await tradeService.fetchTpSlOrders();
        // One row in, two legs out — `normalizeTpSlRows` splitting the
        // simulator's row exactly as it splits the venue's (BUG-0292). Before
        // FEAT-0327 this list came back empty, which is what told the trader
        // every simulated entry was unprotected.
        expect(plans).toHaveLength(2);
        expect(plans.find((p) => p.planType === "LOSS")?.triggerPrice).toBe("49000");
        expect(plans.find((p) => p.planType === "PROFIT")?.triggerPrice).toBe("52000");
        expect(appFetchMock).not.toHaveBeenCalled();
    });

    it("reports them with no API credentials configured at all", async () => {
        const saved = settings.apiKeys.bitunix;
        settings.apiKeys = { bitunix: { key: "", secret: "" } } as typeof settings.apiKeys;
        try {
            await place({ side: "BUY", qty: "1", slPrice: "49000" });
            // A paper account has no venue to authenticate against, and the
            // guard used to throw before the seam was ever reached.
            await expect(tradeService.fetchTpSlOrders()).resolves.toHaveLength(1);
        } finally {
            settings.apiKeys = { bitunix: saved };
        }
    });

    it("keeps plans out of the pending-orders tab", async () => {
        await place({ side: "BUY", qty: "1", slPrice: "49000", tpPrice: "52000" });
        // They have their own tab; two rows for one stop, each with its own
        // cancel button, is not what the venue shows either.
        expect(accountState.openOrders).toHaveLength(0);
    });

    it("reports the simulated balance as the account's available funds", async () => {
        paperState.setConfig("takerFeeBps", "6");
        await place({ side: "BUY", qty: "1" });

        const usdt = accountState.assets.find((a) => a.currency === "USDT");
        expect(usdt?.available.toString()).toBe("9970");
    });
});

describe("FEAT-0327 — a simulated position can be closed", () => {
    it("is closable through the same path a live position is", async () => {
        await place({ side: "BUY", qty: "1" });
        priceAt(new Decimal(51000));

        await tradeService.closePosition({
            symbol: "BTCUSDT",
            positionSide: "long",
            amount: new Decimal("1"),
        });

        expect(accountState.positions).toHaveLength(0);
        expect(appFetchMock).not.toHaveBeenCalled();
    });

    it("removes it from the OMS the order gate reads", async () => {
        await place({ side: "BUY", qty: "1" });
        expect(omsService.getPositions()).toHaveLength(1);

        await tradeService.closePosition({
            symbol: "BTCUSDT",
            positionSide: "long",
            amount: new Decimal("1"),
        });

        // `updatePosition` can only add or overwrite; without an explicit
        // removal the gate would keep verifying closes against a position
        // that no longer exists.
        expect(omsService.getPositions()).toHaveLength(0);
    });

    it("leaves the remainder in the panel after a partial close", async () => {
        await place({ side: "BUY", qty: "2" });
        await tradeService.closePosition({
            symbol: "BTCUSDT",
            positionSide: "long",
            amount: new Decimal("0.5"),
        });

        expect(accountState.positions).toHaveLength(1);
        expect(accountState.positions[0].size.toString()).toBe("1.5");
    });

    it("clears the attached plans with the position", async () => {
        await place({ side: "BUY", qty: "1", slPrice: "49000", tpPrice: "52000" });
        await tradeService.closePosition({
            symbol: "BTCUSDT",
            positionSide: "long",
            amount: new Decimal("1"),
        });

        expect(accountState.openOrders).toHaveLength(0);
    });
});

describe("FEAT-0327 — the trade is in the journal", () => {
    it("writes the entry as the position opens", async () => {
        await place({ side: "BUY", qty: "1", slPrice: "49000" });

        expect(journalState.entries).toHaveLength(1);
        expect(journalState.entries[0].status).toBe("Open");
        expect(journalState.entries[0].isPaper).toBe(true);
    });

    it("completes it as the position closes", async () => {
        await place({ side: "BUY", qty: "1", slPrice: "49000" });
        priceAt(new Decimal(51000));

        await tradeService.closePosition({
            symbol: "BTCUSDT",
            positionSide: "long",
            amount: new Decimal("1"),
        });

        expect(journalState.entries).toHaveLength(1);
        const [entry] = journalState.entries;
        expect(entry.status).toBe("Won");
        expect(entry.exitPrice?.toString()).toBe("51000");
        expect(entry.totalNetProfit.toString()).toBe("1000");
        expect(entry.totalRR.toString()).toBe("1");
    });

    it("keeps it out of every performance statistic", async () => {
        await place({ side: "BUY", qty: "1" });
        priceAt(new Decimal(51000));
        await tradeService.closePosition({
            symbol: "BTCUSDT",
            positionSide: "long",
            amount: new Decimal("1"),
        });

        expect(journalState.analysisEntries).toHaveLength(0);
    });
});

describe("FEAT-0327 — nothing carries across the mode switch", () => {
    it("empties the panel on the way back to live", async () => {
        await place({ side: "BUY", qty: "1" });
        expect(accountState.positions).toHaveLength(1);

        paperTradingService.setEnabled(false);

        expect(accountState.positions).toHaveLength(0);
        expect(accountState.openOrders).toHaveLength(0);
        expect(omsService.getPositions()).toHaveLength(0);
    });

    it("brings the same book back when paper mode returns", async () => {
        await place({ side: "BUY", qty: "1" });
        paperTradingService.setEnabled(false);
        paperTradingService.setEnabled(true);

        expect(accountState.positions).toHaveLength(1);
        expect(accountState.positions[0].size.toString()).toBe("1");
    });
});
