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
 * BUG-0839 — a resting paper LIMIT entry carrying tpPrice / slPrice must
 * preserve its attached plans through storage reload, attach them onto the
 * opened position when the feed crosses it (with the position's owner), and
 * log unexpected errors inside settleRestingOrders instead of swallowing them.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("$app/env", () => ({ browser: true, dev: true }));

vi.mock("./logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { logger } from "./logger";
import { paperExchange, setPaperPriceFeed } from "./paperExchange";
import { paperState } from "../stores/paperTrading.svelte";

const PRICE = new Decimal(50000);
const HASH = "ab".repeat(32);

const BOT_STAMP = {
    origin: "bot",
    botId: "rule-bot-1",
    ruleId: "rule-bot-1",
    strategyHash: HASH,
};

let feed: Record<string, Decimal | null> = {};

beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
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
});

async function placeLimitEntry(payload: Record<string, unknown> = {}) {
    return paperExchange.handle("/api/orders", {
        type: "place-order",
        symbol: "BTCUSDT",
        side: "BUY",
        orderType: "LIMIT",
        price: "49000",
        qty: "0.02",
        tradeSide: "OPEN",
        ...payload,
    });
}

describe("BUG-0839 — paper LIMIT entry fills with attached TP/SL plans", () => {
    it("attaches TP and SL plans carrying the bot owner when a bot LIMIT entry fills", async () => {
        await placeLimitEntry({
            ...BOT_STAMP,
            tpPrice: "52000",
            slPrice: "48000",
        });

        expect(paperState.positions).toHaveLength(0);
        expect(paperState.orders).toHaveLength(1);

        paperExchange.settleRestingOrders("BTCUSDT", new Decimal(48900));

        expect(paperState.positions).toHaveLength(1);
        const position = paperState.positions[0];
        expect(position.origin).toBe("bot");
        expect(position.botId).toBe("rule-bot-1");
        expect(position.ruleId).toBe("rule-bot-1");
        expect(position.strategyHash).toBe(HASH);

        const plans = paperState.orders.filter((o) => o.planGroupId !== undefined);
        expect(plans).toHaveLength(2);
        const tp = plans.find((o) => o.planType === "TP");
        const sl = plans.find((o) => o.planType === "SL");

        expect(tp).toMatchObject({
            symbol: "BTCUSDT",
            positionId: position.positionId,
            planScope: "position",
            triggerPrice: "52000",
            triggerDirection: "above",
            reduceOnly: true,
            tradeSide: "CLOSE",
            origin: "bot",
            botId: "rule-bot-1",
            ruleId: "rule-bot-1",
            strategyHash: HASH,
        });
        expect(sl).toMatchObject({
            symbol: "BTCUSDT",
            positionId: position.positionId,
            planScope: "position",
            triggerPrice: "48000",
            triggerDirection: "below",
            reduceOnly: true,
            tradeSide: "CLOSE",
            origin: "bot",
            botId: "rule-bot-1",
            ruleId: "rule-bot-1",
            strategyHash: HASH,
        });
    });

    it("attaches TP and SL plans with no bot owner when a manual LIMIT entry fills", async () => {
        await placeLimitEntry({
            origin: "manual",
            tpPrice: "52000",
            slPrice: "48000",
        });

        paperExchange.settleRestingOrders("BTCUSDT", new Decimal(48900));

        expect(paperState.positions).toHaveLength(1);
        const position = paperState.positions[0];
        expect(position.origin).toBe("manual");
        expect(position.botId).toBeUndefined();

        const plans = paperState.orders.filter((o) => o.planGroupId !== undefined);
        expect(plans).toHaveLength(2);
        for (const plan of plans) {
            expect(plan.positionId).toBe(position.positionId);
            expect(plan.planScope).toBe("position");
            expect(plan.origin).toBe("manual");
            expect(plan.botId).toBeUndefined();
            expect(plan.ruleId).toBeUndefined();
            expect(plan.strategyHash).toBeUndefined();
        }
    });

    it("preserves attached TP/SL fields across a storage reload and attaches plans on later fill", async () => {
        await placeLimitEntry({
            ...BOT_STAMP,
            tpPrice: "52000",
            tpStopType: "LAST_PRICE",
            tpOrderType: "LIMIT",
            slPrice: "48000",
            slStopType: "MARK_PRICE",
            slOrderType: "MARKET",
        });

        paperState.reloadFromStorage();

        expect(paperState.orders).toHaveLength(1);
        const reloaded = paperState.orders[0];
        expect(reloaded.tpPrice).toBe("52000");
        expect(reloaded.tpStopType).toBe("LAST_PRICE");
        expect(reloaded.tpOrderType).toBe("LIMIT");
        expect(reloaded.slPrice).toBe("48000");
        expect(reloaded.slStopType).toBe("MARK_PRICE");
        expect(reloaded.slOrderType).toBe("MARKET");

        paperExchange.settleRestingOrders("BTCUSDT", new Decimal(48900));

        const plans = paperState.orders.filter((o) => o.planGroupId !== undefined);
        expect(plans).toHaveLength(2);
        const tp = plans.find((o) => o.planType === "TP");
        const sl = plans.find((o) => o.planType === "SL");
        expect(tp?.stopType).toBe("LAST_PRICE");
        expect(tp?.orderType).toBe("LIMIT");
        expect(sl?.stopType).toBe("MARK_PRICE");
        expect(sl?.orderType).toBe("MARKET");
    });

    it("logs an opening fill failure in settleRestingOrders while keeping a missing-position close quiet", async () => {
        // 1. A closing resting order against no position stays quiet.
        await placeLimitEntry({
            side: "BUY",
            price: "51000",
            reduceOnly: true,
            tradeSide: "CLOSE",
        });
        paperExchange.settleRestingOrders("BTCUSDT", new Decimal(51000));
        expect(logger.error).not.toHaveBeenCalled();
        expect(paperState.orders).toHaveLength(0);

        // 2. An unexpected throw during an opening fill is logged, not swallowed.
        await placeLimitEntry({ ...BOT_STAMP, price: "49000" });
        const spy = vi
            .spyOn(paperExchange as unknown as { applyOpen: () => never }, "applyOpen")
            .mockImplementationOnce(() => {
                throw new Error("boom during open");
            });
        try {
            paperExchange.settleRestingOrders("BTCUSDT", new Decimal(48900));
        } finally {
            spy.mockRestore();
        }

        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(paperState.positions).toHaveLength(0);
    });
});
