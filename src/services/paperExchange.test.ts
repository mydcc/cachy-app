// @vitest-environment happy-dom
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

// FEAT-0069: TP/SL sent with the entry become resting plans on the position
// the entry created — the atomic form, simulated atomically.
describe("paperExchange — TP/SL attached at entry", () => {
    it("creates both plans from a single request", async () => {
        await paperExchange.handle("/api/orders", {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "MARKET",
            qty: "1",
            tpPrice: "55000",
            slPrice: "45000",
        });

        expect(paperState.positions).toHaveLength(1);
        expect(paperState.orders).toHaveLength(2);
        expect(paperState.orders.every((o) => o.reduceOnly)).toBe(true);
    });

    it("gives the target and the stop opposite trigger directions", async () => {
        await paperExchange.handle("/api/orders", {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "MARKET",
            qty: "1",
            tpPrice: "55000",
            slPrice: "45000",
        });

        const byLevel = Object.fromEntries(
            paperState.orders.map((o) => [o.triggerPrice, o.triggerDirection]),
        );
        // Both are closing BUY-side orders; only the level tells them apart.
        expect(byLevel["55000"]).toBe("above");
        expect(byLevel["45000"]).toBe("below");
    });

    it("fires the target when the feed rises to it, not immediately", async () => {
        await paperExchange.handle("/api/orders", {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "MARKET",
            qty: "1",
            tpPrice: "55000",
            slPrice: "45000",
        });

        // Deriving direction from the order side would have filled the
        // take-profit here, at a price below it.
        paperExchange.settleRestingOrders("BTCUSDT", new Decimal(50000));
        expect(paperState.positions).toHaveLength(1);

        feed.BTCUSDT = new Decimal(55000);
        paperExchange.settleRestingOrders("BTCUSDT", new Decimal(55000));
        expect(paperState.positions).toHaveLength(0);
        expect(paperState.balance.eq(15000)).toBe(true);
    });

    it("fires the stop when the feed falls to it", async () => {
        await paperExchange.handle("/api/orders", {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "MARKET",
            qty: "1",
            tpPrice: "55000",
            slPrice: "45000",
        });

        feed.BTCUSDT = new Decimal(45000);
        paperExchange.settleRestingOrders("BTCUSDT", new Decimal(45000));
        expect(paperState.positions).toHaveLength(0);
        expect(paperState.balance.eq(5000)).toBe(true);
    });

    it("attaches nothing to a closing order", async () => {
        await open("1");
        await paperExchange.handle("/api/orders", {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "MARKET",
            qty: "1",
            reduceOnly: true,
            tradeSide: "CLOSE",
            tpPrice: "55000",
        });
        expect(paperState.orders).toHaveLength(0);
    });

    it("attaches only what was asked for", async () => {
        await paperExchange.handle("/api/orders", {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "MARKET",
            qty: "1",
            slPrice: "45000",
        });
        expect(paperState.orders).toHaveLength(1);
        expect(paperState.orders[0].triggerPrice).toBe("45000");
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

/*
 * FEAT-0327 — the simulator keeps a record of what it did.
 *
 * `history` used to answer with an empty list, so a paper account had no way
 * to say what had happened to it: no order history, and nothing for the
 * journal to be reconstructed from.
 */
describe("paperExchange — the fill record", () => {
    it("records a fill for an opening market order", async () => {
        await open("1");

        expect(paperState.fills).toHaveLength(1);
        const [fill] = paperState.fills;
        expect(fill.tradeSide).toBe("OPEN");
        expect(fill.qty).toBe("1");
        expect(fill.price).toBe("50000");
        expect(fill.positionId).toBe(paperState.positions[0].positionId);
    });

    it("records the realised PnL of a closing fill, net of its own fee", async () => {
        paperState.setConfig("takerFeeBps", "6");
        await open("1");
        feed.BTCUSDT = new Decimal(51000);
        await close("1");

        const closing = paperState.fills.find((f) => f.tradeSide === "CLOSE")!;
        // 1000 gross − 51 000 × 0.0006.
        expect(closing.realizedPnl).toBe("969.4");
    });

    it("records a fill for a flash close", async () => {
        await open("1");
        const positionId = paperState.positions[0].positionId;
        await paperExchange.handle("/api/orders", {
            type: "flash-close-position",
            positionId,
        });

        expect(paperState.fills.filter((f) => f.tradeSide === "CLOSE")).toHaveLength(1);
    });

    it("records a fill when a resting order is crossed", async () => {
        await paperExchange.handle("/api/orders", {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "LIMIT",
            qty: "1",
            price: "49000",
        });
        expect(paperState.fills).toHaveLength(0);

        paperExchange.settleRestingOrders("BTCUSDT", new Decimal(48900));
        expect(paperState.fills).toHaveLength(1);
        expect(paperState.fills[0].price).toBe("48900");
    });

    it("answers a history request from the record, newest first", async () => {
        await open("1");
        await close("1");

        const response = (await paperExchange.handle("/api/orders", {
            type: "history",
        })) as { data: { orders: Array<Record<string, unknown>> } };

        expect(response.data.orders).toHaveLength(2);
        expect(response.data.orders[0].reduceOnly).toBe(true);
        expect(response.data.orders.every((o) => o.status === "FILLED")).toBe(true);
    });

    it("keeps the record bounded rather than growing without limit", async () => {
        // 500 is the cap; proving the cap exists matters more than the number.
        for (let i = 0; i < 3; i++) {
            await open("1");
        }
        expect(paperState.fills.length).toBeLessThanOrEqual(500);
        expect(paperState.fills.length).toBe(3);
    });

    it("goes with the book on a reset", async () => {
        await open("1");
        expect(paperState.fills).toHaveLength(1);
        paperState.resetBook();
        expect(paperState.fills).toHaveLength(0);
    });
});

describe("paperExchange — plans are cancelled with their position", () => {
    it("drops both plans when the position closes in full", async () => {
        await paperExchange.handle("/api/orders", {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "MARKET",
            qty: "1",
            tpPrice: "52000",
            slPrice: "49000",
        });
        expect(paperState.orders).toHaveLength(2);

        await close("1");
        // The venue cancels a closed position's plans; leaving them resting
        // would fire them later against nothing — or against a new position
        // that reused the symbol.
        expect(paperState.orders).toHaveLength(0);
    });

    it("cancels the stop when the target fires, not just the target", async () => {
        await paperExchange.handle("/api/orders", {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "MARKET",
            qty: "1",
            tpPrice: "52000",
            slPrice: "49000",
        });

        paperExchange.settleRestingOrders("BTCUSDT", new Decimal(52000));

        expect(paperState.positions).toHaveLength(0);
        expect(paperState.orders).toHaveLength(0);
    });

    it("keeps both plans through a partial close", async () => {
        await paperExchange.handle("/api/orders", {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "MARKET",
            qty: "2",
            tpPrice: "52000",
            slPrice: "49000",
        });

        await close("0.5");
        expect(paperState.positions).toHaveLength(1);
        expect(paperState.orders).toHaveLength(2);
    });
});

/*
 * FEAT-0327 — the simulator reports the plans it holds.
 *
 * `handleTpSl` answered every read with an empty list, so
 * `orderPlacementService.confirmProtection` looked for the stop it had just
 * attached, did not find it, and told the trader the position was
 * unprotected. The stop was there; nothing would say so.
 */
describe("paperExchange — TP/SL plans are reported", () => {
    async function openWithPlans() {
        await paperExchange.handle("/api/orders", {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "MARKET",
            qty: "1",
            tpPrice: "52000",
            slPrice: "49000",
        });
    }

    // `/api/tpsl` returns the venue's payload unwrapped — `{ rows }` at the
    // top level, not inside an envelope. The simulator sits behind the route,
    // so it answers in the route's shape.
    async function pending() {
        const response = (await paperExchange.handle("/api/tpsl", {
            action: "pending",
            params: {},
        })) as { rows: Array<Record<string, unknown>> };
        return response.rows;
    }

    it("returns the attached stop and target as one row, the way the venue does", async () => {
        await openWithPlans();
        const rows = await pending();

        // One row carrying both legs, no planType and no triggerPrice — the
        // shape `normalizeTpSlRows` exists to split (BUG-0292).
        expect(rows).toHaveLength(1);
        expect(rows[0].tpPrice).toBe("52000");
        expect(rows[0].slPrice).toBe("49000");
        expect(rows[0].planType).toBeUndefined();
        expect(rows[0].triggerPrice).toBeUndefined();
    });

    it("names no quantity on a plan attached at entry, because it is position-wide", async () => {
        await openWithPlans();
        const [row] = await pending();
        // Whether the leg names a quantity is how the normaliser tells a
        // position-wide plan from a partial one.
        expect(row.slQty).toBeUndefined();
    });

    it("filters by symbol", async () => {
        await openWithPlans();
        const response = (await paperExchange.handle("/api/tpsl", {
            action: "pending",
            params: { symbol: "ETHUSDT" },
        })) as { rows: unknown[] };
        expect(response.rows).toHaveLength(0);
    });

    it("reports nothing once the position is closed", async () => {
        await openWithPlans();
        await close("1");
        expect(await pending()).toHaveLength(0);
    });

    it("creates a position-wide plan on demand", async () => {
        await open("1");
        const positionId = paperState.positions[0].positionId;
        await paperExchange.handle("/api/tpsl", {
            action: "place-position",
            params: { symbol: "BTCUSDT", positionId, slPrice: "49000" },
        });

        const [row] = await pending();
        expect(row.slPrice).toBe("49000");
        expect(row.tpPrice).toBeUndefined();
    });

    it("replaces the position-wide plan rather than stacking a second one", async () => {
        await openWithPlans();
        const positionId = paperState.positions[0].positionId;
        await paperExchange.handle("/api/tpsl", {
            action: "place-position",
            params: { symbol: "BTCUSDT", positionId, slPrice: "48000" },
        });

        const rows = await pending();
        expect(rows).toHaveLength(1);
        expect(rows[0].slPrice).toBe("48000");
    });

    it("creates a partial plan that names its quantity", async () => {
        await open("2");
        const positionId = paperState.positions[0].positionId;
        await paperExchange.handle("/api/tpsl", {
            action: "place",
            params: { symbol: "BTCUSDT", positionId, tpPrice: "52000", tpQty: "0.5" },
        });

        const [row] = await pending();
        expect(row.tpQty).toBe("0.5");
    });

    it("refuses a plan with no leg", async () => {
        await open("1");
        await expect(
            paperExchange.handle("/api/tpsl", {
                action: "place-position",
                params: { symbol: "BTCUSDT" },
            }),
        ).rejects.toMatchObject({ code: "PAPER_TPSL_NO_LEG" });
    });

    it("refuses a plan against a position that does not exist", async () => {
        await expect(
            paperExchange.handle("/api/tpsl", {
                action: "place-position",
                params: { symbol: "BTCUSDT", slPrice: "49000" },
            }),
        ).rejects.toMatchObject({ code: "PAPER_NO_POSITION" });
    });

    it("cancels one leg when the caller names a plan type", async () => {
        await openWithPlans();
        const [row] = await pending();
        await paperExchange.handle("/api/tpsl", {
            action: "cancel",
            params: { orderId: row.id, symbol: "BTCUSDT", planType: "LOSS" },
        });

        const [remaining] = await pending();
        expect(remaining.slPrice).toBeUndefined();
        expect(remaining.tpPrice).toBe("52000");
    });

    it("cancels the whole row when no type is named", async () => {
        await openWithPlans();
        const [row] = await pending();
        await paperExchange.handle("/api/tpsl", {
            action: "cancel",
            params: { orderId: row.id, symbol: "BTCUSDT" },
        });
        expect(await pending()).toHaveLength(0);
    });

    it("refuses to cancel a plan it has never heard of", async () => {
        await expect(
            paperExchange.handle("/api/tpsl", {
                action: "cancel",
                params: { orderId: "nope", symbol: "BTCUSDT" },
            }),
        ).rejects.toMatchObject({ code: "PAPER_NO_ORDER" });
    });

    it("moves a stop where the trader put it", async () => {
        await openWithPlans();
        const [row] = await pending();
        await paperExchange.handle("/api/tpsl", {
            action: "modify",
            params: { orderId: row.id, slPrice: "49500", slStopType: "LAST_PRICE" },
        });

        const [moved] = await pending();
        expect(moved.slPrice).toBe("49500");
        expect(moved.slStopType).toBe("LAST_PRICE");
        // The other leg is untouched.
        expect(moved.tpPrice).toBe("52000");
    });

    it("re-derives the trigger direction when a stop is moved past the entry", async () => {
        await openWithPlans();
        const [row] = await pending();
        await paperExchange.handle("/api/tpsl", {
            action: "modify",
            params: { orderId: row.id, slPrice: "51000" },
        });

        // Above the entry now, so it must wait for a rise, not a fall — a
        // stale direction would leave it waiting for a move that never comes.
        const stop = paperState.orders.find((o) => o.planType === "SL")!;
        expect(stop.triggerDirection).toBe("above");
    });
});

describe("paperExchange — a position-wide plan tracks the position", () => {
    it("closes the whole position after an add, not the original size", async () => {
        await paperExchange.handle("/api/orders", {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "MARKET",
            qty: "1",
            slPrice: "49000",
        });
        await open("1");
        expect(paperState.positions[0].amount).toBe("2");

        paperExchange.settleRestingOrders("BTCUSDT", new Decimal(49000));

        // Freezing the plan at the entry quantity would have left 1 BTC open
        // with a stop on screen claiming it was covered.
        expect(paperState.positions).toHaveLength(0);
    });
});
