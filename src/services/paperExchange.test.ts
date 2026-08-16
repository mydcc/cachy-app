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
 * FEAT-0012 — the simulated exchange.
 *
 * The simulator is exercised directly here; the seam that routes orders into
 * it is covered in paperTrading_seam.test.ts.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("$app/environment", () => ({ browser: true, dev: true }));

import {
    paperExchange,
    setPaperPriceFeed,
    PaperExchangeError,
} from "./paperExchange";
import { paperState } from "../stores/paperTrading.svelte";
import { CONSTANTS } from "../lib/constants";

const PRICE = new Decimal(50000);
let feed: Record<string, Decimal | null> = {};

beforeEach(() => {
    localStorage.clear();
    paperState.reloadFromStorage();
    paperState.resetBook();
    paperState.setConfig("failureMode", "none");
    paperState.setConfig("slippageBps", "0");
    paperState.setConfig("takerFeeBps", "0");
    paperState.setConfig("startingBalance", "10000");
    paperState.resetBook();
    feed = { BTCUSDT: PRICE };
    setPaperPriceFeed((symbol) => feed[symbol] ?? null);
});

function open(qty: string, side: "BUY" | "SELL" = "BUY") {
    return paperExchange.handle("/api/orders", {
        type: "place-order",
        symbol: "BTCUSDT",
        side,
        orderType: "MARKET",
        qty,
        leverage: "10",
    });
}

function close(qty: string, side: "BUY" | "SELL" = "BUY") {
    return paperExchange.handle("/api/orders", {
        type: "place-order",
        symbol: "BTCUSDT",
        side,
        orderType: "MARKET",
        qty,
        reduceOnly: true,
        tradeSide: "CLOSE",
    });
}

describe("paperExchange — opening", () => {
    it("opens a long and records it at the fill price", async () => {
        await open("0.5");
        expect(paperState.positions).toHaveLength(1);
        expect(paperState.positions[0]).toMatchObject({
            symbol: "BTCUSDT",
            side: "long",
            amount: "0.5",
            entryPrice: "50000",
        });
    });

    it("opens a short for a SELL", async () => {
        await open("0.5", "SELL");
        expect(paperState.positions[0].side).toBe("short");
    });

    it("averages the entry price when adding to a position", async () => {
        await open("1");
        feed.BTCUSDT = new Decimal(60000);
        await open("1");

        // Replacing the basis instead of averaging would make every later PnL
        // figure wrong.
        expect(paperState.positions).toHaveLength(1);
        expect(paperState.positions[0].amount).toBe("2");
        expect(new Decimal(paperState.positions[0].entryPrice).eq(55000)).toBe(true);
    });

    it("refuses to invent a price when the feed has none", async () => {
        feed = {};
        await expect(open("1")).rejects.toBeInstanceOf(PaperExchangeError);
        expect(paperState.positions).toHaveLength(0);
    });

    it("refuses a non-positive quantity", async () => {
        await expect(open("0")).rejects.toBeInstanceOf(PaperExchangeError);
    });
});

describe("paperExchange — slippage and fees", () => {
    it("applies slippage against the trader on both sides", async () => {
        paperState.setConfig("slippageBps", "100"); // 1 %

        await open("1", "BUY");
        expect(new Decimal(paperState.positions[0].entryPrice).eq(50500)).toBe(true);

        paperState.resetBook();
        await open("1", "SELL");
        expect(new Decimal(paperState.positions[0].entryPrice).eq(49500)).toBe(true);
    });

    it("charges the taker fee against the balance", async () => {
        paperState.setConfig("takerFeeBps", "10"); // 0.1 % of 50 000 = 50
        await open("1");
        expect(paperState.balance.eq(9950)).toBe(true);
    });

    it("computes with Decimal, not floating point", async () => {
        paperState.setConfig("startingBalance", "0");
        paperState.resetBook();
        feed.BTCUSDT = new Decimal("0.1");
        await open("3"); // 0.1 * 3 is 0.30000000000000004 in float

        await close("3");
        // A float path would leave a residue here instead of exactly zero.
        expect(paperState.balance.toString()).toBe("0");
    });
});

describe("paperExchange — closing", () => {
    it("realises a profit into the balance", async () => {
        await open("1");
        feed.BTCUSDT = new Decimal(51000);
        await close("1");

        expect(paperState.positions).toHaveLength(0);
        expect(paperState.balance.eq(11000)).toBe(true);
    });

    it("realises a loss into the balance", async () => {
        await open("1");
        feed.BTCUSDT = new Decimal(49000);
        await close("1");
        expect(paperState.balance.eq(9000)).toBe(true);
    });

    it("gets the sign right for a short", async () => {
        await open("1", "SELL");
        feed.BTCUSDT = new Decimal(49000);
        await close("1", "SELL");
        expect(paperState.balance.eq(11000)).toBe(true);
    });

    it("closes partially and keeps the remainder", async () => {
        await open("2");
        feed.BTCUSDT = new Decimal(51000);
        await close("1");

        expect(paperState.positions).toHaveLength(1);
        expect(paperState.positions[0].amount).toBe("1");
        expect(paperState.balance.eq(11000)).toBe(true);
    });

    it("never closes more than the position holds", async () => {
        await open("1");
        feed.BTCUSDT = new Decimal(51000);
        await close("5");
        expect(paperState.positions).toHaveLength(0);
        // Only the 1 that was actually held was realised.
        expect(paperState.balance.eq(11000)).toBe(true);
    });

    it("refuses a close with no position", async () => {
        await expect(close("1")).rejects.toBeInstanceOf(PaperExchangeError);
    });

    it("flash-closes by positionId", async () => {
        await open("1");
        const positionId = paperState.positions[0].positionId;
        feed.BTCUSDT = new Decimal(52000);

        await paperExchange.handle("/api/orders", {
            type: "flash-close-position",
            symbol: "BTCUSDT",
            positionId,
        });
        expect(paperState.positions).toHaveLength(0);
        expect(paperState.balance.eq(12000)).toBe(true);
    });

    it("closes everything on close-all", async () => {
        await open("1");
        feed.ETHUSDT = new Decimal(3000);
        await paperExchange.handle("/api/orders", {
            type: "place-order",
            symbol: "ETHUSDT",
            side: "BUY",
            orderType: "MARKET",
            qty: "2",
        });
        expect(paperState.positions).toHaveLength(2);

        await paperExchange.handle("/api/orders", {
            type: "close-all-positions",
            symbol: undefined,
        });
        expect(paperState.positions).toHaveLength(0);
    });
});

describe("paperExchange — resting orders", () => {
    it("holds a limit order instead of filling it immediately", async () => {
        await paperExchange.handle("/api/orders", {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "LIMIT",
            qty: "1",
            price: "45000",
        });

        // Filling a limit order at once would flatter every strategy that
        // uses them.
        expect(paperState.orders).toHaveLength(1);
        expect(paperState.positions).toHaveLength(0);
    });

    it("fills a buy when the feed drops to the level", async () => {
        await paperExchange.handle("/api/orders", {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "LIMIT",
            qty: "1",
            price: "45000",
        });

        paperExchange.settleRestingOrders("BTCUSDT", new Decimal(46000));
        expect(paperState.orders).toHaveLength(1); // not crossed yet

        paperExchange.settleRestingOrders("BTCUSDT", new Decimal(45000));
        expect(paperState.orders).toHaveLength(0);
        expect(paperState.positions).toHaveLength(1);
    });

    it("fills a sell when the feed rises to the level", async () => {
        await paperExchange.handle("/api/orders", {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "SELL",
            orderType: "LIMIT",
            qty: "1",
            price: "55000",
        });
        paperExchange.settleRestingOrders("BTCUSDT", new Decimal(55001));
        expect(paperState.positions).toHaveLength(1);
        expect(paperState.positions[0].side).toBe("short");
    });

    it("leaves another symbol's orders alone", async () => {
        await paperExchange.handle("/api/orders", {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "LIMIT",
            qty: "1",
            price: "45000",
        });
        paperExchange.settleRestingOrders("ETHUSDT", new Decimal(1));
        expect(paperState.orders).toHaveLength(1);
    });

    it("cancels a resting order", async () => {
        const placed = (await paperExchange.handle("/api/orders", {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "LIMIT",
            qty: "1",
            price: "45000",
        })) as { data: { orderId: string } };

        await paperExchange.handle("/api/orders", {
            type: "cancel-order",
            symbol: "BTCUSDT",
            orderId: placed.data.orderId,
        });
        expect(paperState.orders).toHaveLength(0);
    });

    it("cancels everything on cancel-all", async () => {
        for (const price of ["45000", "44000"]) {
            await paperExchange.handle("/api/orders", {
                type: "place-order",
                symbol: "BTCUSDT",
                side: "BUY",
                orderType: "LIMIT",
                qty: "1",
                price,
            });
        }
        await paperExchange.handle("/api/orders", { type: "cancel-all", symbol: undefined });
        expect(paperState.orders).toHaveLength(0);
    });
});

// AC: "Simulated rejection, timeout and partial fill are each reachable and
// each have a test."
describe("paperExchange — simulated failures", () => {
    it("rejects on demand", async () => {
        paperState.setConfig("failureMode", "reject");
        await expect(open("1")).rejects.toMatchObject({ code: "PAPER_REJECTED" });
        expect(paperState.positions).toHaveLength(0);
    });

    it("times out on demand", async () => {
        paperState.setConfig("failureMode", "timeout");
        await expect(open("1")).rejects.toMatchObject({ code: "PAPER_TIMEOUT" });
        expect(paperState.positions).toHaveLength(0);
    });

    it("fills partially on demand, and says so", async () => {
        paperState.setConfig("failureMode", "partial");
        paperState.setConfig("partialFillRatio", "0.5");

        const result = (await open("2")) as {
            data: { qty: string; requestedQty: string; partial: boolean };
        };

        expect(result.data.qty).toBe("1");
        expect(result.data.requestedQty).toBe("2");
        expect(result.data.partial).toBe(true);
        expect(paperState.positions[0].amount).toBe("1");
    });

    it("returns to succeeding when the mode is cleared", async () => {
        paperState.setConfig("failureMode", "reject");
        await expect(open("1")).rejects.toThrow();
        paperState.setConfig("failureMode", "none");
        await open("1");
        expect(paperState.positions).toHaveLength(1);
    });
});

// AC: "Paper state persists across reload and never leaves the device."
describe("paperExchange — persistence", () => {
    it("survives a reload", async () => {
        paperState.setEnabled(true);
        await open("1.5");

        paperState.reloadFromStorage();
        expect(paperState.enabled).toBe(true);
        expect(paperState.positions).toHaveLength(1);
        expect(paperState.positions[0].amount).toBe("1.5");
    });

    it("writes only to its own localStorage key and sends nothing", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
        try {
            await open("1");
            expect(fetchSpy).not.toHaveBeenCalled();
            expect(Object.keys(localStorage)).toEqual([
                CONSTANTS.LOCAL_STORAGE_PAPER_KEY,
            ]);
        } finally {
            fetchSpy.mockRestore();
        }
    });

    it("comes back with paper mode off after a corrupt blob", () => {
        paperState.setEnabled(true);
        localStorage.setItem(CONSTANTS.LOCAL_STORAGE_PAPER_KEY, "{not json");
        paperState.reloadFromStorage();
        // The dangerous direction is believing you are simulating, so a
        // state that cannot be read comes back live.
        expect(paperState.enabled).toBe(false);
    });
});

describe("paperExchange — unsupported requests", () => {
    it("refuses rather than silently succeeding", async () => {
        await expect(
            paperExchange.handle("/api/orders", { type: "something-else" }),
        ).rejects.toMatchObject({ code: "PAPER_UNSUPPORTED" });
    });
});
