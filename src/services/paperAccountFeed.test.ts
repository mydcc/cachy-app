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
 * FEAT-0327 — the read seam.
 *
 * FEAT-0012's seam decides where an order *goes*. This one decides where
 * account state *comes from*, and the claim it rests on is the mirror of that
 * one: while paper mode is off it answers nothing at all, so no read site can
 * behave differently in live mode than it did before this existed.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Decimal } from "decimal.js";
import { readFileSync } from "node:fs";

vi.mock("$app/environment", () => ({ browser: true, dev: true }));

import { paperExchange, setPaperPriceFeed } from "./paperExchange";
import { paperAccountFeed } from "./paperAccountFeed";
import { paperState } from "../stores/paperTrading.svelte";
import { marketState } from "../stores/market.svelte";

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
    paperState.setEnabled(true);
    feed = { BTCUSDT: PRICE };
    setPaperPriceFeed((symbol) => feed[symbol] ?? null);
    marketState.data = {};
});

function open(qty: string, extra: Record<string, unknown> = {}) {
    return paperExchange.handle("/api/orders", {
        type: "place-order",
        symbol: "BTCUSDT",
        side: "BUY",
        orderType: "MARKET",
        qty,
        leverage: "10",
        ...extra,
    });
}

function close(qty: string) {
    return paperExchange.handle("/api/orders", {
        type: "place-order",
        symbol: "BTCUSDT",
        side: "BUY",
        orderType: "MARKET",
        qty,
        reduceOnly: true,
        tradeSide: "CLOSE",
    });
}

describe("paperAccountFeed — the seam only answers in paper mode", () => {
    it("answers nothing while paper mode is off", () => {
        paperState.setEnabled(false);
        expect(paperAccountFeed()).toBeNull();
    });

    it("answers while paper mode is on", () => {
        expect(paperAccountFeed()).not.toBeNull();
    });

    it("stops answering the moment the mode is switched back", async () => {
        await open("1");
        expect(paperAccountFeed()?.positions()).toHaveLength(1);
        paperState.setEnabled(false);
        expect(paperAccountFeed()).toBeNull();
    });
});

describe("paperAccountFeed — positions", () => {
    it("reports an open position in the shape the store hydrates from", async () => {
        await open("2");
        const [position] = paperAccountFeed()!.positions();

        expect(position.symbol).toBe("BTCUSDT");
        expect(position.side).toBe("long");
        expect(position.size).toBe("2");
        expect(position.entryPrice).toBe("50000");
        expect(position.leverage).toBe("10");
        expect(position.positionId).toBeTruthy();
    });

    it("marks to the live price, not the entry price", async () => {
        await open("2");
        marketState.data = {
            BTCUSDT: { lastPrice: new Decimal(51000) },
        } as unknown as typeof marketState.data;

        const [position] = paperAccountFeed()!.positions();
        expect(position.markPrice).toBe("51000");
        // 1000 × 2, long.
        expect(new Decimal(position.unrealizedPnL!).toString()).toBe("2000");
    });

    it("gets the sign right for a short", async () => {
        await paperExchange.handle("/api/orders", {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "SELL",
            orderType: "MARKET",
            qty: "2",
        });
        marketState.data = {
            BTCUSDT: { lastPrice: new Decimal(51000) },
        } as unknown as typeof marketState.data;

        const [position] = paperAccountFeed()!.positions();
        expect(new Decimal(position.unrealizedPnL!).toString()).toBe("-2000");
    });

    it("reports the initial margin the position would have required", async () => {
        await open("2");
        const [position] = paperAccountFeed()!.positions();
        // 2 × 50 000 / 10x.
        expect(new Decimal(position.margin!).toString()).toBe("10000");
    });

    it("reports no liquidation price, because it models no liquidation", async () => {
        await open("2");
        expect(paperAccountFeed()!.positions()[0].liquidationPrice).toBeUndefined();
    });

    it("drops a closed position", async () => {
        await open("1");
        await close("1");
        expect(paperAccountFeed()!.positions()).toHaveLength(0);
    });

    it("keeps the remainder of a partial close", async () => {
        await open("2");
        await close("0.5");
        const [position] = paperAccountFeed()!.positions();
        expect(position.size).toBe("1.5");
    });
});

describe("paperAccountFeed — resting orders", () => {
    it("reports a resting limit order", async () => {
        await paperExchange.handle("/api/orders", {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "LIMIT",
            qty: "1",
            price: "49000",
        });

        const [order] = paperAccountFeed()!.pendingOrders();
        expect(order.symbol).toBe("BTCUSDT");
        expect(order.price).toBe("49000");
        expect(order.status).toBe("NEW");
        expect(order.amount).toBe("1");
    });

    it("keeps plans out of the orders tab, where the venue keeps them too", async () => {
        await open("1", { slPrice: "49000", tpPrice: "52000" });
        // Both plans exist in the book …
        expect(paperState.orders).toHaveLength(2);
        // … and neither is a pending *order*; they belong to the TP/SL tab,
        // which the simulator answers separately. Listing them twice would
        // give every stop two rows and two cancel buttons.
        expect(paperAccountFeed()!.pendingOrders()).toHaveLength(0);
    });

    it("does not hide a plain limit order behind that rule", async () => {
        await paperExchange.handle("/api/orders", {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "LIMIT",
            qty: "1",
            price: "49000",
        });
        await open("1", { slPrice: "49000" });
        expect(paperAccountFeed()!.pendingOrders()).toHaveLength(1);
    });

    it("drops both plans when the position they protect closes", async () => {
        await open("1", { slPrice: "49000", tpPrice: "52000" });
        expect(paperState.orders).toHaveLength(2);

        await close("1");
        expect(paperState.orders).toHaveLength(0);
    });
});

describe("paperAccountFeed — history", () => {
    it("was empty before fills were recorded, and is not now", async () => {
        await open("1");
        await close("1");

        const history = paperAccountFeed()!.historyOrders();
        expect(history).toHaveLength(2);
        expect(history.every((o) => o.status === "FILLED")).toBe(true);
    });

    it("puts the newest fill first", async () => {
        await open("1");
        await close("1");
        const [newest, oldest] = paperAccountFeed()!.historyOrders();
        expect(newest.reduceOnly).toBe(true);
        expect(oldest.reduceOnly).toBe(false);
    });

    it("carries the fee and the realised PnL of each fill", async () => {
        paperState.setConfig("takerFeeBps", "6");
        await open("1");
        feed.BTCUSDT = new Decimal(51000);
        await close("1");

        const [exit, entry] = paperAccountFeed()!.historyOrders();
        // 50 000 × 0.0006.
        expect(new Decimal(entry.fee).toString()).toBe("30");
        expect(new Decimal(entry.realizedPNL).toString()).toBe("0");
        // 1000 gross − 51 000 × 0.0006 exit fee.
        expect(new Decimal(exit.realizedPNL).toString()).toBe("969.4");
    });

    it("honours the requested window", async () => {
        await open("1");
        const future = Date.now() + 60_000;
        expect(paperAccountFeed()!.historyOrders({ startTime: future })).toHaveLength(0);
    });

    it("honours the requested limit", async () => {
        await open("1");
        await close("0.5");
        await close("0.5");
        expect(paperAccountFeed()!.historyOrders({ limit: 2 })).toHaveLength(2);
    });
});

describe("paperAccountFeed — the account", () => {
    it("reports the simulated balance as available", async () => {
        paperState.setConfig("takerFeeBps", "6");
        await open("1");
        // 10 000 − 30 of entry fee.
        expect(paperAccountFeed()!.accountInfo().available).toBe("9970");
        expect(paperAccountFeed()!.balance()).toBe("9970");
    });

    it("reports no used margin, because none is reserved", async () => {
        await open("1");
        const info = paperAccountFeed()!.accountInfo();
        // The store adds available + margin + frozen to get the account
        // total; a used-margin figure the balance was never reduced by would
        // inflate the equity the whole panel reports.
        expect(info.margin).toBe("0");
        expect(info.frozen).toBe("0");
    });

    it("sums unrealised PnL across positions", async () => {
        await open("2");
        marketState.data = {
            BTCUSDT: { lastPrice: new Decimal(51000) },
        } as unknown as typeof marketState.data;
        expect(
            new Decimal(paperAccountFeed()!.accountInfo().totalUnrealizedPnL).toString(),
        ).toBe("2000");
    });
});

describe("FEAT-0327 — the read seam has one module", () => {
    it("is asked at exactly the sites that read account state", () => {
        const sites: Array<[string, number]> = [
            // Four account reads, one balance read.
            ["src/components/shared/PositionsSidebar.svelte", 5],
            ["src/components/inputs/PortfolioInputs.svelte", 1],
        ];
        for (const [file, expected] of sites) {
            const source = readFileSync(file, "utf8");
            expect(source.match(/paperAccountFeed\(\)/g) ?? []).toHaveLength(expected);
        }
    });

    it("is the only module that maps the book into wire shapes", () => {
        // A second mapper would be a second seam, and the two would drift.
        const source = readFileSync("src/services/paperAccountFeed.ts", "utf8");
        expect(source).toMatch(/NormalizedPosition/);
        expect(source).toMatch(/NormalizedOrder/);
        // It reads the book; it never writes it, and it imports nothing that
        // could — hydrating the stores is `paperTradingService`'s job.
        expect(source).not.toMatch(/paperState\.set/);
        expect(source).not.toMatch(/^import .*stores\/account/m);
        expect(source).not.toMatch(/^import .*journal/m);
    });
});
