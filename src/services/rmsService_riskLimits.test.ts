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

const positions = vi.hoisted(() => ({ list: [] as Array<{ symbol: string }> }));
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
        riskState.setLimit("maxLossPerTradeUsdt", "5"); // stop risk is 10
        const refusal = orderGate.verify(openIntent()).refusal;
        expect(refusal?.field).toBe("maxLossPerTrade");
        expect(refusal?.values.actual).toBe("10");
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
        riskState.setLimit("maxLossPerTradeUsdt", "10");
        expect(orderGate.verify(openIntent()).approved).toBe(true);
    });

    it("does not count adding to a position already held", () => {
        riskState.setLimit("maxOpenPositions", 1);
        positions.list = [{ symbol: "BTCUSDT" }];
        expect(orderGate.verify(openIntent()).approved).toBe(true);
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
