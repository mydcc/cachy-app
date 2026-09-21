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
 * FEAT-0013 — acceptance criteria for the risk limits and the kill switch.
 *
 * Every limit test goes through `orderGate.verify` or `orderGate.submit`
 * rather than calling the check directly, because the criterion is that the
 * limit is enforced *at the gate*: an order constructed programmatically,
 * bypassing every form in the app, must still be refused.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("$app/environment", () => ({ browser: true, dev: true }));

vi.mock("./logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const positions = vi.hoisted(() => ({ list: [] as Array<{ symbol: string; side?: "long" | "short"; positionMode?: "one_way" | "hedge" }> }));
vi.mock("./omsService", () => ({
    omsService: { getPositions: () => positions.list },
}));

const journal = vi.hoisted(() => ({ entries: [] as Array<Record<string, unknown>> }));
vi.mock("../stores/journal.svelte", () => ({
    journalState: {
        get entries() {
            return journal.entries;
        },
    },
}));

import { rmsService, utcDayStart } from "./rmsService";
import { riskState } from "../stores/riskLimits.svelte";
import { settingsState } from "../stores/settings.svelte";
import { orderGate, OrderRefusedError, type OrderIntent } from "./orderGate";
import { CONSTANTS } from "../lib/constants";

const ACCOUNT = { provider: "bitunix", accountFingerprint: "abcd…wxyz" };

/** 0.02 BTC at 50 000 = 1000 USDT notional, 500 stop distance = 10 USDT risk. */
function openIntent(): OrderIntent {
    return {
        kind: "open",
        endpoint: "/api/orders",
        payload: {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "LIMIT",
            qty: "0.02",
            price: "50000",
            slPrice: "49500",
            tpPrice: "51000",
            leverage: "10",
            marginMode: "ISOLATED",
        },
        displayed: {
            ...ACCOUNT,
            symbol: "BTCUSDT",
            side: "BUY",
            accountSize: new Decimal(1000),
            riskPercentage: new Decimal(1),
            entryPrice: new Decimal(50000),
            stopLossPrice: new Decimal(49500),
            takeProfits: [new Decimal(51000)],
            leverage: new Decimal(10),
            marginMode: "ISOLATED",
            stepSize: new Decimal("0.0001"),
            accountStateAt: Date.now(),
        },
    };
}

function closeIntent(): OrderIntent {
    return {
        kind: "reduce",
        endpoint: "/api/orders",
        payload: {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "MARKET",
            qty: "0.5",
            reduceOnly: true,
            tradeSide: "CLOSE",
            positionId: "pos-1",
        },
        displayed: {
            ...ACCOUNT,
            symbol: "BTCUSDT",
            side: "BUY",
            positionAmount: new Decimal("0.5"),
            fullClose: true,
            positionId: "pos-1",
        },
    };
}

function cancelIntent(): OrderIntent {
    return {
        kind: "cancel",
        endpoint: "/api/orders",
        payload: { type: "cancel-order", symbol: "BTCUSDT", orderId: "o-1" },
        displayed: { ...ACCOUNT, symbol: "BTCUSDT", orderId: "o-1" },
    };
}

function tpSlModifyIntent(): OrderIntent {
    return {
        kind: "modify",
        endpoint: "/api/tpsl",
        payload: {
            action: "modify",
            symbol: "BTCUSDT",
            orderId: "tp-1",
            params: { orderId: "tp-1", symbol: "BTCUSDT", triggerPrice: "48000" },
        },
        displayed: {
            ...ACCOUNT,
            symbol: "BTCUSDT",
            orderId: "tp-1",
            stopLossPrice: new Decimal(48000),
        },
        priceFields: { stopLoss: "params.triggerPrice", takeProfit: "params.triggerPrice" },
    };
}

function pendingOrderModifyIntent(): OrderIntent {
    return {
        kind: "modify",
        endpoint: "/api/orders",
        payload: {
            type: "modify-order",
            orderId: "o-9",
            symbol: "BTCUSDT",
            qty: "1",
            price: "50000",
        },
        displayed: {
            ...ACCOUNT,
            symbol: "BTCUSDT",
            orderId: "o-9",
            entryPrice: new Decimal(50000),
        },
    };
}

/** A closed journal entry that realised `pnl` at `at`. */
function closedTrade(pnl: string, at: number, extra: Record<string, unknown> = {}) {
    return {
        id: `t-${at}-${pnl}`,
        status: new Decimal(pnl).isNegative() ? "Lost" : "Won",
        date: new Date(at).toISOString(),
        exitDate: new Date(at).toISOString(),
        totalNetProfit: new Decimal(pnl),
        ...extra,
    };
}

beforeEach(() => {
    localStorage.clear();
    riskState.reloadFromStorage();
    riskState.resetLimits();
    positions.list = [];
    journal.entries = [];
    rmsService.installGateHooks();
});

afterEach(() => {
    rmsService.uninstallGateHooks();
    riskState.releaseKillSwitch({ confirmed: true });
    riskState.resetLimits();
    localStorage.clear();
});

describe("FEAT-0013 — no limits configured", () => {
    it("approves an ordinary order", () => {
        expect(orderGate.verify(openIntent()).approved).toBe(true);
    });
});

// AC: "Each limit has a test that submits an order exceeding it and asserts
// refusal with the limit named."
describe("FEAT-0013 — each limit refuses, and names itself", () => {
    it("max position size (absolute)", () => {
        riskState.setLimit("maxPositionSizeUsdt", "500"); // order is 1000
        const refusal = orderGate.verify(openIntent()).refusal;
        expect(refusal?.field).toBe("maxPositionSize");
        expect(refusal?.values.limit).toBe("500");
        expect(refusal?.values.actual).toBe("1000");
    });

    it("max position size (share of account equity)", () => {
        // 1000 USDT account, 50 % cap = 500; the order is 1000.
        riskState.setLimit("maxPositionSizePercent", "50");
        const refusal = orderGate.verify(openIntent()).refusal;
        expect(refusal?.field).toBe("maxPositionSizePercent");
        expect(refusal?.values.limit).toBe("500");
    });

    it("max leverage", () => {
        riskState.setLimit("maxLeverage", "5"); // order is 10x
        const refusal = orderGate.verify(openIntent()).refusal;
        expect(refusal?.field).toBe("maxLeverage");
        expect(refusal?.values.actual).toBe("10");
    });

    it("max loss per trade", () => {
        riskState.setLimit("maxLossPerTradeUsdt", "5"); // stop risk is 10.5558 with fees
        const refusal = orderGate.verify(openIntent()).refusal;
        expect(refusal?.field).toBe("maxLossPerTrade");
        expect(refusal?.values.actual).toBe("10.5558");
    });

    it("max loss per day", () => {
        riskState.setLimit("maxDailyLossUsdt", "100");
        journal.entries = [closedTrade("-120", Date.now())];
        const refusal = orderGate.verify(openIntent()).refusal;
        expect(refusal?.field).toBe("maxDailyLoss");
        expect(refusal?.values.actual).toBe("120");
        expect(refusal?.values.limit).toBe("100");
    });

    it("max concurrent open positions", () => {
        riskState.setLimit("maxOpenPositions", 2);
        positions.list = [{ symbol: "ETHUSDT" }, { symbol: "SOLUSDT" }];
        const refusal = orderGate.verify(openIntent()).refusal;
        expect(refusal?.field).toBe("maxOpenPositions");
        expect(refusal?.values.limit).toBe("2");
        expect(refusal?.values.actual).toBe("3");
    });
});

describe("FEAT-0013 — limits allow what they should", () => {
    it("approves an order exactly at the limit", () => {
        riskState.setLimit("maxPositionSizeUsdt", "1000");
        riskState.setLimit("maxLeverage", "10");
        // Fee-inclusive stop risk is 10.5558; exactly at the limit passes.
        riskState.setLimit("maxLossPerTradeUsdt", "10.5558");
        expect(orderGate.verify(openIntent()).approved).toBe(true);
    });

    it("does not count adding to a position already held", () => {
        riskState.setLimit("maxOpenPositions", 1);
        positions.list = [{ symbol: "BTCUSDT" }];
        expect(orderGate.verify(openIntent()).approved).toBe(true);
    });

    // BUG-0515: in hedge mode the opposite side on a held symbol is a
    // second position, not a change to the first — the ceiling counts it.
    it("counts the opposite side on a held symbol in hedge mode", () => {
        riskState.setLimit("maxOpenPositions", 1);
        positions.list = [{ symbol: "BTCUSDT", side: "long", positionMode: "hedge" }];
        const intent = openIntent();
        intent.displayed.side = "SELL";
        intent.payload.side = "SELL";
        const refusal = orderGate.verify(intent).refusal;
        expect(refusal?.field).toBe("maxOpenPositions");
        expect(refusal?.values.actual).toBe("2");
    });

    it("still exempts the same side on a held symbol in hedge mode", () => {
        riskState.setLimit("maxOpenPositions", 1);
        positions.list = [{ symbol: "BTCUSDT", side: "long", positionMode: "hedge" }];
        expect(orderGate.verify(openIntent()).approved).toBe(true);
    });

    it("keeps the symbol exemption when no position proves hedge mode", () => {
        riskState.setLimit("maxOpenPositions", 1);
        positions.list = [{ symbol: "BTCUSDT", side: "long", positionMode: "one_way" }];
        const intent = openIntent();
        intent.displayed.side = "SELL";
        intent.payload.side = "SELL";
        expect(orderGate.verify(intent).approved).toBe(true);
    });

    it("refuses a limit it cannot measure rather than waving it through", () => {
        riskState.setLimit("maxLeverage", "5");
        const intent = openIntent();
        delete intent.displayed.leverage;
        delete intent.payload.leverage;
        const refusal = orderGate.verify(intent).refusal;
        expect(refusal?.field).toBe("maxLeverage");
        expect(refusal?.reason).toBe("missing");
    });
});

/** 0.5 BTC held at 50 000, adding 0.1 BTC at 50 000 → resulting 30 000 USDT. */
function addIntent(positionAmount = "0.5", addQty = "0.1"): OrderIntent {
    return {
        kind: "add",
        endpoint: "/api/orders",
        payload: {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "MARKET",
            qty: addQty,
            reduceOnly: false,
            tradeSide: "OPEN",
            positionId: "pos-1",
        },
        displayed: {
            ...ACCOUNT,
            symbol: "BTCUSDT",
            side: "BUY",
            addQuantity: new Decimal(addQty),
            entryPrice: new Decimal(50000),
            positionAmount: new Decimal(positionAmount),
            positionId: "pos-1",
            leverage: new Decimal(10),
            marginMode: "ISOLATION",
            availableMargin: new Decimal(100000),
            accountStateAt: Date.now(),
            accountSize: new Decimal(100000),
        },
    };
}

/** The same add under a resting stop: entry price doubles as the old average. */
function protectedAddIntent(stopPrice: string): OrderIntent {
    const intent = addIntent();
    intent.displayed.positionEntryPrice = new Decimal(50000);
    intent.displayed.restingStopPrice = new Decimal(stopPrice);
    return intent;
}

describe("BUG-0508 — adds are measured against the position-size cap", () => {
    it("refuses an add that takes the resulting position past the absolute cap", () => {
        // The leg alone is 5 000, inside the cap — the resulting 30 000 is not.
        riskState.setLimit("maxPositionSizeUsdt", "25000");
        const refusal = orderGate.verify(addIntent()).refusal;
        expect(refusal?.field).toBe("maxPositionSize");
        expect(refusal?.values.limit).toBe("25000");
        expect(refusal?.values.actual).toBe("30000");
    });

    it("allows an add that stays inside the cap", () => {
        riskState.setLimit("maxPositionSizeUsdt", "30000");
        expect(orderGate.verify(addIntent()).approved).toBe(true);
    });

    it("refuses the add that cumulatively crosses the cap", () => {
        riskState.setLimit("maxPositionSizeUsdt", "25750");
        // 0.5 + 0.01 → 25 500: inside.
        expect(orderGate.verify(addIntent("0.5", "0.01")).approved).toBe(true);
        // 0.51 + 0.01 → 26 000: past it.
        const refusal = orderGate.verify(addIntent("0.51", "0.01")).refusal;
        expect(refusal?.field).toBe("maxPositionSize");
        expect(refusal?.values.actual).toBe("26000");
    });

    it("measures the percentage cap instead of refusing unmeasurable", () => {
        // 25 % of 100 000 = 25 000 < resulting 30 000.
        riskState.setLimit("maxPositionSizePercent", "25");
        const refusal = orderGate.verify(addIntent()).refusal;
        expect(refusal?.field).toBe("maxPositionSizePercent");
        expect(refusal?.values.limit).toBe("25000");
        expect(refusal?.values.actual).toBe("30000");
    });

    it("refuses an add the percentage cap cannot measure", () => {
        riskState.setLimit("maxPositionSizePercent", "25");
        const intent = addIntent();
        delete intent.displayed.accountSize;
        const refusal = orderGate.verify(intent).refusal;
        expect(refusal?.field).toBe("maxPositionSizePercent");
        expect(refusal?.reason).toBe("missing");
    });

    it("refuses an add that states no position to grow", () => {
        riskState.setLimit("maxPositionSizeUsdt", "25000");
        const intent = addIntent();
        delete intent.displayed.positionAmount;
        const refusal = orderGate.verify(intent).refusal;
        expect(refusal?.field).toBe("maxPositionSize");
        expect(refusal?.reason).toBe("missing");
    });
});

describe("BUG-0510 — adds are measured against the loss-per-trade limit", () => {
    it("refuses an add that pushes the resulting stop risk past the limit", () => {
        // 0.5 @ 50 000 plus 0.1 @ 50 000 → 0.6 @ 50 000 under a 49 000
        // stop: 600 risk, past the 500 limit. The leg alone (100) would pass.
        riskState.setLimit("maxLossPerTradeUsdt", "500");
        const refusal = orderGate.verify(protectedAddIntent("49000")).refusal;
        expect(refusal?.field).toBe("maxLossPerTrade");
        expect(refusal?.values.actual).toBe("624.948");
        expect(refusal?.values.limit).toBe("500");
    });

    it("allows an add that improves the average entry enough to reduce risk", () => {
        // 0.5 @ 50 000 plus 0.5 @ 49 000 → 1.0 @ 49 500 under a 49 000
        // stop: 500 risk on a 600 limit. The size doubled; the risk fell.
        riskState.setLimit("maxLossPerTradeUsdt", "600");
        const intent = protectedAddIntent("49000");
        intent.displayed.positionAmount = new Decimal("0.5");
        intent.displayed.addQuantity = new Decimal("0.5");
        intent.displayed.entryPrice = new Decimal(49000);
        intent.payload.qty = "0.5";
        expect(orderGate.verify(intent).approved).toBe(true);
    });

    it("refuses an add on a stop-less position as unmeasurable, not approved", () => {
        riskState.setLimit("maxLossPerTradeUsdt", "500");
        const refusal = orderGate.verify(addIntent()).refusal;
        expect(refusal?.field).toBe("maxLossPerTrade");
        expect(refusal?.reason).toBe("missing");
    });
});

describe("BUG-0500 — the per-trade loss limit includes round-trip fees", () => {
    // openIntent: 0.02 BTC at 50 000, stop 49 500. Pre-fee stop loss is 10;
    // fee-inclusive with bitunix defaults (maker 0.014 %, taker 0.042 %):
    // 10 + 1000 × 0.00014 + 990 × 0.00042 = 10.5558 (LIMIT entry is maker).
    it("refuses a pre-fee-exact order the fees push over the limit", () => {
        riskState.setLimit("maxLossPerTradeUsdt", "10");
        const refusal = orderGate.verify(openIntent()).refusal;
        expect(refusal?.field).toBe("maxLossPerTrade");
        expect(refusal?.values.actual).toBe("10.5558");
    });

    it("still passes a trade whose fee-inclusive loss is under the limit", () => {
        riskState.setLimit("maxLossPerTradeUsdt", "11");
        expect(orderGate.verify(openIntent()).approved).toBe(true);
    });

    it("charges the entry leg at the taker rate for a market order", () => {
        // 10 + 1000 × 0.00042 + 990 × 0.00042 = 10.8358 — pins that the
        // legs do not share one flat rate.
        riskState.setLimit("maxLossPerTradeUsdt", "5");
        const intent = openIntent();
        intent.payload.orderType = "MARKET";
        const refusal = orderGate.verify(intent).refusal;
        expect(refusal?.field).toBe("maxLossPerTrade");
        expect(refusal?.values.actual).toBe("10.8358");
    });

    it("refuses as unmeasurable when a leg's rate cannot be resolved", () => {
        const previous = settingsState.feeRates.bitunix.taker;
        try {
            settingsState.feeRates.bitunix.taker = "n/a";
            riskState.setLimit("maxLossPerTradeUsdt", "500");
            const refusal = orderGate.verify(openIntent()).refusal;
            expect(refusal?.field).toBe("maxLossPerTrade");
            expect(refusal?.reason).toBe("missing");
        } finally {
            settingsState.feeRates.bitunix.taker = previous;
        }
    });

    it("refuses an add whose pre-fee risk passes but fees push over", () => {
        // Resulting 0.6 @ 50 000 under a 49 000 stop: pre-fee 600 passes a
        // 610 limit; fee-inclusive (MARKET entry, taker both legs)
        // 600 + 12.6 + 12.348 = 624.948 does not.
        riskState.setLimit("maxLossPerTradeUsdt", "610");
        const refusal = orderGate.verify(protectedAddIntent("49000")).refusal;
        expect(refusal?.field).toBe("maxLossPerTrade");
        expect(refusal?.values.actual).toBe("624.948");
    });
});

// AC: "Limits are enforced at the gate, not in the form — proven by a test
// that constructs an over-limit order programmatically."
describe("FEAT-0013 — limits are enforced at the gate, not in the form", () => {
    it("refuses an over-limit order built directly, with no UI involved", async () => {
        riskState.setLimit("maxPositionSizeUsdt", "100");
        const transport = vi.fn();

        // Nothing here went near an input field.
        await expect(orderGate.submit(openIntent(), transport)).rejects.toBeInstanceOf(
            OrderRefusedError,
        );
        expect(transport).not.toHaveBeenCalled();
    });

    it("never blocks a close, whatever the limits say", () => {
        riskState.setLimit("maxPositionSizeUsdt", "1");
        riskState.setLimit("maxDailyLossUsdt", "1");
        riskState.setLimit("maxOpenPositions", 0);
        riskState.setLimit("maxLeverage", "1");
        journal.entries = [closedTrade("-9999", Date.now())];
        positions.list = [{ symbol: "BTCUSDT" }, { symbol: "ETHUSDT" }];

        // A limit that blocked getting out would leave the user over their
        // limit *and* stuck in the position.
        expect(orderGate.verify(closeIntent()).approved).toBe(true);
        expect(orderGate.verify(cancelIntent()).approved).toBe(true);
    });
});

// AC: "The kill switch blocks a live submission attempt, asserted with no
// outbound request."
describe("FEAT-0013 — kill switch", () => {
    it("blocks an opening order with no outbound request", async () => {
        riskState.engageKillSwitch();
        const transport = vi.fn();

        await expect(orderGate.submit(openIntent(), transport)).rejects.toMatchObject({
            refusal: { field: "killSwitch" },
        });
        expect(transport).not.toHaveBeenCalled();
    });

    it("makes no network call of its own", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("{}"),
        );
        try {
            riskState.engageKillSwitch();
            await expect(orderGate.submit(openIntent(), vi.fn())).rejects.toBeInstanceOf(
                OrderRefusedError,
            );
            expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
            fetchSpy.mockRestore();
        }
    });

    it("blocks a pending-order amendment", () => {
        riskState.engageKillSwitch();
        expect(orderGate.verify(pendingOrderModifyIntent()).refusal?.field).toBe(
            "killSwitch",
        );
    });

    it("lets closes, cancels and bulk closes through", () => {
        riskState.engageKillSwitch();
        expect(orderGate.verify(closeIntent()).approved).toBe(true);
        expect(orderGate.verify(cancelIntent()).approved).toBe(true);
        expect(
            orderGate.verify({
                kind: "bulk",
                endpoint: "/api/orders",
                payload: { type: "close-all-positions", symbol: undefined },
                displayed: { ...ACCOUNT },
            }).approved,
        ).toBe(true);
    });

    it("lets a stop-loss adjustment through", () => {
        // Blocking a stop move mid-panic is worse than allowing one.
        riskState.engageKillSwitch();
        expect(orderGate.verify(tpSlModifyIntent()).approved).toBe(true);
    });

    it("is idempotent — repeated clicks keep the original timestamp", () => {
        riskState.engageKillSwitch(1000);
        riskState.engageKillSwitch(9999);
        expect(riskState.killSwitchEngagedAt).toBe(1000);
    });

    it("classifies exposure the same way for every intent kind", () => {
        expect(rmsService.increasesExposure(openIntent())).toBe(true);
        expect(rmsService.increasesExposure(pendingOrderModifyIntent())).toBe(true);
        expect(rmsService.increasesExposure(closeIntent())).toBe(false);
        expect(rmsService.increasesExposure(cancelIntent())).toBe(false);
        expect(rmsService.increasesExposure(tpSlModifyIntent())).toBe(false);
    });
});

// AC: "The switch survives reload." AC: "Clearing it requires an explicit
// confirmation."
describe("FEAT-0013 — kill switch persistence and release", () => {
    it("survives a reload", () => {
        riskState.engageKillSwitch();
        expect(localStorage.getItem(CONSTANTS.LOCAL_STORAGE_RISK_KEY)).toContain(
            "killSwitchEngagedAt",
        );

        // A fresh session reads the same storage.
        riskState.reloadFromStorage();
        expect(riskState.isKillSwitchEngaged).toBe(true);
        expect(orderGate.verify(openIntent()).refusal?.field).toBe("killSwitch");
    });

    it("refuses to release without an explicit confirmation", () => {
        riskState.engageKillSwitch();

        expect(riskState.releaseKillSwitch({ confirmed: false } as unknown as { confirmed: true })).toBe(false);
        expect(riskState.releaseKillSwitch(undefined as unknown as { confirmed: true })).toBe(false);
        expect(riskState.releaseKillSwitch({} as unknown as { confirmed: true })).toBe(false);
        expect(riskState.isKillSwitchEngaged).toBe(true);
    });

    it("releases with an explicit confirmation", () => {
        riskState.engageKillSwitch();
        expect(riskState.releaseKillSwitch({ confirmed: true })).toBe(true);
        expect(riskState.isKillSwitchEngaged).toBe(false);

        riskState.reloadFromStorage();
        expect(riskState.isKillSwitchEngaged).toBe(false);
    });

    it("keeps limits across a reload too", () => {
        riskState.setLimit("maxLeverage", "7");
        riskState.setLimit("maxOpenPositions", 3);
        riskState.reloadFromStorage();
        expect(riskState.limit("maxLeverage")?.toString()).toBe("7");
        expect(riskState.maxOpenPositions).toBe(3);
    });
});

// AC: "The daily-loss counter is computed with Decimal and resets on a
// defined boundary stated in this item."
describe("FEAT-0013 — daily loss counter", () => {
    const noonUtc = Date.UTC(2026, 7, 16, 12, 0, 0);

    it("resets at 00:00 UTC", () => {
        expect(utcDayStart(noonUtc)).toBe(Date.UTC(2026, 7, 16));
        expect(utcDayStart(Date.UTC(2026, 7, 16, 23, 59, 59))).toBe(Date.UTC(2026, 7, 16));
        expect(utcDayStart(Date.UTC(2026, 7, 17, 0, 0, 0))).toBe(Date.UTC(2026, 7, 17));
    });

    it("ignores trades closed before the boundary", () => {
        journal.entries = [
            closedTrade("-500", Date.UTC(2026, 7, 15, 23, 59, 0)), // yesterday
            closedTrade("-40", noonUtc - 1000),
        ];
        expect(rmsService.realizedLossToday(noonUtc).toString()).toBe("40");
    });

    it("nets wins against losses", () => {
        journal.entries = [
            closedTrade("-100", noonUtc - 3000),
            closedTrade("30", noonUtc - 2000),
        ];
        expect(rmsService.realizedPnlToday(noonUtc).toString()).toBe("-70");
        expect(rmsService.realizedLossToday(noonUtc).toString()).toBe("70");
    });

    it("reports zero loss on a green day", () => {
        journal.entries = [closedTrade("250", noonUtc - 1000)];
        expect(rmsService.realizedLossToday(noonUtc).toString()).toBe("0");
    });

    it("computes with Decimal, not floating point", () => {
        // 0.1 + 0.2 in float is 0.30000000000000004.
        journal.entries = [
            closedTrade("-0.1", noonUtc - 2000),
            closedTrade("-0.2", noonUtc - 1000),
        ];
        const loss = rmsService.realizedLossToday(noonUtc);
        expect(loss).toBeInstanceOf(Decimal);
        expect(loss.toString()).toBe("0.3");
        expect(loss.eq("0.3")).toBe(true);
    });

    it("never counts paper trades", () => {
        journal.entries = [
            closedTrade("-1000", noonUtc - 2000, { isPaper: true }),
            closedTrade("-25", noonUtc - 1000),
        ];
        expect(rmsService.realizedLossToday(noonUtc).toString()).toBe("25");
    });

    it("ignores entries that are not closed", () => {
        journal.entries = [
            { ...closedTrade("-999", noonUtc - 1000), status: "Open" },
            { ...closedTrade("-999", noonUtc - 1000), status: "Planned" },
        ];
        expect(rmsService.realizedLossToday(noonUtc).toString()).toBe("0");
    });

    it("survives an unparseable date without counting it", () => {
        journal.entries = [
            { ...closedTrade("-50", noonUtc - 1000), date: "not-a-date", exitDate: undefined },
        ];
        expect(rmsService.realizedLossToday(noonUtc).toString()).toBe("0");
    });

    it("blocks at the limit, not only past it", () => {
        riskState.setLimit("maxDailyLossUsdt", "100");
        journal.entries = [closedTrade("-100", Date.now())];
        expect(orderGate.verify(openIntent()).refusal?.field).toBe("maxDailyLoss");

        journal.entries = [closedTrade("-99.99", Date.now())];
        expect(orderGate.verify(openIntent()).approved).toBe(true);
    });
});

// BUG-0499 — the daily-loss limit measures the journal, so it must refuse
// when the journal cannot be measured instead of reading zero.
describe("BUG-0499 — an unmeasurable day refuses opens", () => {
    it("refuses when a Lost entry for today carries no amount", () => {
        riskState.setLimit("maxDailyLossUsdt", "100");
        const entry = closedTrade("-50", Date.now());
        delete (entry as Record<string, unknown>).totalNetProfit;
        journal.entries = [entry];

        const refusal = orderGate.verify(openIntent()).refusal;
        expect(refusal?.field).toBe("maxDailyLoss");
        expect(refusal?.reason).toBe("missing");
    });

    it("refuses when a closed entry has no exitDate to attribute it by", () => {
        riskState.setLimit("maxDailyLossUsdt", "100");
        journal.entries = [
            {
                id: "t-no-exit",
                status: "Lost",
                date: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
                // No exitDate: dating this by its open day would hide an
                // overnight loss from today's limit.
                totalNetProfit: new Decimal("-50"),
            },
        ];

        const refusal = orderGate.verify(openIntent()).refusal;
        expect(refusal?.field).toBe("maxDailyLoss");
        expect(refusal?.reason).toBe("missing");
    });

    it("refuses when an entry carries a status outside the known set", () => {
        riskState.setLimit("maxDailyLossUsdt", "100");
        journal.entries = [
            {
                id: "t-foreign",
                status: "Breakeven",
                date: new Date(Date.now()).toISOString(),
                exitDate: new Date(Date.now()).toISOString(),
                totalNetProfit: new Decimal("0"),
            },
        ];

        const refusal = orderGate.verify(openIntent()).refusal;
        expect(refusal?.field).toBe("maxDailyLoss");
        expect(refusal?.reason).toBe("missing");
    });

    it("refuses when synced trades exist but no history sync ran today", () => {
        riskState.setLimit("maxDailyLossUsdt", "10000");
        journal.entries = [
            { ...closedTrade("-10", Date.now()), isManual: false, isPaper: false },
        ];

        // The venue may have closed more since — the journal cannot prove
        // otherwise without a same-day sync.
        expect(orderGate.verify(openIntent()).refusal?.reason).toBe("missing");

        riskState.recordHistorySync(Date.now());
        expect(orderGate.verify(openIntent()).approved).toBe(true);
    });

    it("still passes a complete journal under the limit", () => {
        riskState.setLimit("maxDailyLossUsdt", "100");
        journal.entries = [closedTrade("-40", Date.now())];
        expect(orderGate.verify(openIntent()).approved).toBe(true);
    });

    it("never blocks a close, cancel or TP/SL modification on an unmeasurable day", () => {
        riskState.setLimit("maxDailyLossUsdt", "100");
        const entry = closedTrade("-50", Date.now());
        delete (entry as Record<string, unknown>).totalNetProfit;
        journal.entries = [entry];

        // A limit that blocked getting out would leave the user over their
        // limit *and* stuck in the position.
        expect(orderGate.verify(openIntent()).approved).toBe(false);
        expect(orderGate.verify(closeIntent()).approved).toBe(true);
        expect(orderGate.verify(cancelIntent()).approved).toBe(true);
        expect(orderGate.verify(tpSlModifyIntent()).approved).toBe(true);
    });

    it("attributes an overnight close to its exitDate, not its open day", () => {
        const now = Date.now();
        journal.entries = [
            {
                id: "t-overnight",
                status: "Lost",
                date: new Date(now - 24 * 3600 * 1000).toISOString(),
                exitDate: new Date(now - 1000).toISOString(),
                totalNetProfit: new Decimal("-50"),
            },
        ];
        expect(rmsService.realizedLossToday(now).toString()).toBe("50");
    });

    it("ignores history provably outside today instead of refusing on it", () => {
        riskState.setLimit("maxDailyLossUsdt", "100");
        const old = new Date("2024-05-01T12:00:00Z").toISOString();
        journal.entries = [
            // A legacy row with everything filled in, but last year.
            {
                id: "t-old",
                status: "Lost",
                date: old,
                exitDate: old,
                totalNetProfit: new Decimal("-9999"),
            },
            // And a synced one: no same-day history sync, yet nothing about
            // it can belong to today either.
            {
                ...closedTrade("-9999", new Date("2024-05-02T12:00:00Z").getTime()),
                isManual: false,
                isPaper: false,
            },
        ];
        expect(orderGate.verify(openIntent()).approved).toBe(true);
    });

    it("still refuses when an old entry cannot be placed in time", () => {
        riskState.setLimit("maxDailyLossUsdt", "100");
        journal.entries = [
            {
                id: "t-timeless",
                status: "Lost",
                date: new Date("2024-05-01T12:00:00Z").toISOString(),
                // No exitDate and no backfill on this path: the close could
                // be anywhere, so the day stays unmeasurable.
                totalNetProfit: new Decimal("-50"),
            },
        ];
        expect(orderGate.verify(openIntent()).refusal?.reason).toBe("missing");
    });
});

// BUG-0523 — a synced zero is a measured zero, and every unmeasurable day
// names its cause.
describe("BUG-0523 — synced scratch and refusal causes", () => {
    it("keeps the day complete for a synced scratch (Lost with amount 0)", () => {
        riskState.setLimit("maxDailyLossUsdt", "100");
        journal.entries = [
            {
                ...closedTrade("0", Date.now()),
                id: "t-sync-scratch",
                status: "Lost",
                isManual: false,
                isPaper: false,
            },
        ];
        riskState.recordHistorySync(Date.now());

        expect(orderGate.verify(openIntent()).approved).toBe(true);
        expect(rmsService.realizedLossToday(Date.now()).toString()).toBe("0");
    });

    it("still refuses a manual scratch (Lost with amount 0) and names the cause", () => {
        riskState.setLimit("maxDailyLossUsdt", "100");
        journal.entries = [
            { ...closedTrade("0", Date.now()), id: "t-manual-scratch", status: "Lost" },
        ];

        const refusal = orderGate.verify(openIntent()).refusal;
        expect(refusal?.field).toBe("maxDailyLoss");
        expect(refusal?.reason).toBe("missing");
        expect(refusal?.messageKey).toBe("orderGate.dailyLossUnmeasurableNoAmount");
    });

    it("names a missing amount when the entry carries none at all", () => {
        riskState.setLimit("maxDailyLossUsdt", "100");
        const entry = closedTrade("-50", Date.now());
        delete (entry as Record<string, unknown>).totalNetProfit;
        journal.entries = [entry];

        expect(orderGate.verify(openIntent()).refusal?.messageKey).toBe(
            "orderGate.dailyLossUnmeasurableNoAmount",
        );
    });

    it("names a missing exit date", () => {
        riskState.setLimit("maxDailyLossUsdt", "100");
        journal.entries = [
            {
                id: "t-no-exit",
                status: "Lost",
                date: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
                totalNetProfit: new Decimal("-50"),
            },
        ];

        expect(orderGate.verify(openIntent()).refusal?.messageKey).toBe(
            "orderGate.dailyLossUnmeasurableNoExitDate",
        );
    });

    it("names an unattributable status", () => {
        riskState.setLimit("maxDailyLossUsdt", "100");
        journal.entries = [
            {
                id: "t-foreign",
                status: "Breakeven",
                date: new Date(Date.now()).toISOString(),
                exitDate: new Date(Date.now()).toISOString(),
                totalNetProfit: new Decimal("0"),
            },
        ];

        expect(orderGate.verify(openIntent()).refusal?.messageKey).toBe(
            "orderGate.dailyLossUnmeasurableUnknownStatus",
        );
    });

    it("names a stale history sync", () => {
        riskState.setLimit("maxDailyLossUsdt", "10000");
        journal.entries = [
            { ...closedTrade("-10", Date.now()), isManual: false, isPaper: false },
        ];

        expect(orderGate.verify(openIntent()).refusal?.messageKey).toBe(
            "orderGate.dailyLossUnmeasurableStaleSync",
        );

        riskState.recordHistorySync(Date.now());
        expect(orderGate.verify(openIntent()).approved).toBe(true);
    });
});

describe("FEAT-0013 — limit input validation", () => {
    it("rejects a value that is not a non-negative number", () => {
        expect(riskState.setLimit("maxLeverage", "abc")).toBe(false);
        expect(riskState.setLimit("maxLeverage", "-3")).toBe(false);
        expect(riskState.limits.maxLeverage).toBeNull();
    });

    it("treats an empty value as 'not configured', which is not zero", () => {
        riskState.setLimit("maxPositionSizeUsdt", "0");
        expect(riskState.limit("maxPositionSizeUsdt")?.toString()).toBe("0");
        // Zero refuses everything; unconfigured refuses nothing.
        expect(orderGate.verify(openIntent()).refusal?.field).toBe("maxPositionSize");

        riskState.setLimit("maxPositionSizeUsdt", null);
        expect(riskState.limit("maxPositionSizeUsdt")).toBeNull();
        expect(orderGate.verify(openIntent()).approved).toBe(true);
    });

    it("clears every limit but leaves the kill switch alone", () => {
        riskState.setLimit("maxLeverage", "5");
        riskState.engageKillSwitch();
        riskState.resetLimits();
        expect(riskState.limit("maxLeverage")).toBeNull();
        expect(riskState.isKillSwitchEngaged).toBe(true);
    });
});

// AC: "Limit and switch state never leave the device."
describe("FEAT-0013 — Class A", () => {
    it("writes only to localStorage, under its own key, and sends nothing", () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
        try {
            riskState.engageKillSwitch();
            riskState.setLimit("maxDailyLossUsdt", "250");

            expect(fetchSpy).not.toHaveBeenCalled();
            expect(Object.keys(localStorage)).toEqual([
                CONSTANTS.LOCAL_STORAGE_RISK_KEY,
            ]);
        } finally {
            fetchSpy.mockRestore();
        }
    });

    it("keeps no reference to a remote endpoint in what it persists", () => {
        riskState.engageKillSwitch();
        riskState.setLimit("maxLeverage", "5");
        const blob = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_RISK_KEY) ?? "";
        expect(blob).not.toMatch(/https?:\/\//);
        expect(JSON.parse(blob)).toEqual({
            limits: expect.objectContaining({ maxLeverage: "5" }),
            killSwitchEngagedAt: expect.any(Number),
            lastHistorySyncAt: null,
        });
    });
});

describe("FEAT-0013 — the hooks are actually wired up", () => {
    it("does nothing until installGateHooks has run", () => {
        riskState.setLimit("maxPositionSizeUsdt", "1");
        riskState.engageKillSwitch();

        // Unregistered hooks mean the gate approves on those two checks —
        // which is why installation is not optional wiring.
        rmsService.uninstallGateHooks();
        expect(orderGate.verify(openIntent()).approved).toBe(true);

        rmsService.installGateHooks();
        expect(orderGate.verify(openIntent()).approved).toBe(false);
    });

    it("is installed during app startup", async () => {
        // A unit test cannot run app.init() without a browser, so this reads
        // the startup path instead. Without this line the whole feature is
        // inert in the shipped app while every test above still passes.
        const { readFileSync } = await import("node:fs");
        const source = readFileSync("src/services/app.ts", "utf8");
        expect(source).toMatch(/rmsService\.installGateHooks\(\)/);
    });
});

describe("FEAT-0013 — corrupt persisted state", () => {
    it("falls back to defaults rather than throwing", () => {
        localStorage.setItem(CONSTANTS.LOCAL_STORAGE_RISK_KEY, "{not json");
        expect(() => riskState.reloadFromStorage()).not.toThrow();
        expect(riskState.isKillSwitchEngaged).toBe(false);
        expect(riskState.limit("maxLeverage")).toBeNull();
    });

    it("drops a limit it cannot validate instead of trusting it", () => {
        localStorage.setItem(
            CONSTANTS.LOCAL_STORAGE_RISK_KEY,
            JSON.stringify({
                limits: { maxLeverage: "-5", maxDailyLossUsdt: "300" },
                killSwitchEngagedAt: null,
            }),
        );
        riskState.reloadFromStorage();
        expect(riskState.limit("maxLeverage")).toBeNull();
        expect(riskState.limit("maxDailyLossUsdt")?.toString()).toBe("300");
    });
});
