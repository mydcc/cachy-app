// @vitest-environment happy-dom
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
 * FEAT-0526 — the configurable kill switch and its auto-engage.
 *
 * The switch's scope is asserted through `orderGate.verify`, and the risk
 * limits on the same intents are asserted alongside it: narrowing the switch
 * must never narrow `checkLimits`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("$app/env", () => ({ browser: true, dev: true }));

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

import { rmsService } from "./rmsService";
import { riskState } from "../stores/riskLimits.svelte";
import { StorageHelper } from "../utils/storageHelper";
import { orderGate, type OrderIntent } from "./orderGate";

const ACCOUNT = { provider: "bitunix", accountFingerprint: "abcd…wxyz" };
const NOON = Date.UTC(2026, 9, 28, 12, 0, 0);

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
            accountStateAt: NOON,
        },
    };
}

/** 0.5 BTC held at 50 000, adding 0.1 BTC at 50 000. */
function addIntent(): OrderIntent {
    return {
        kind: "add",
        endpoint: "/api/orders",
        payload: {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "MARKET",
            qty: "0.1",
            reduceOnly: false,
            tradeSide: "OPEN",
            positionId: "pos-1",
        },
        displayed: {
            ...ACCOUNT,
            symbol: "BTCUSDT",
            side: "BUY",
            addQuantity: new Decimal("0.1"),
            entryPrice: new Decimal(50000),
            positionAmount: new Decimal("0.5"),
            positionId: "pos-1",
            leverage: new Decimal(10),
            marginMode: "ISOLATION",
            availableMargin: new Decimal(100000),
            accountStateAt: NOON,
            accountSize: new Decimal(100000),
        },
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

function resetConfig(): void {
    riskState.setKillSwitchOption("blockAdds", true);
    riskState.setKillSwitchOption("blockNonTpSlModifies", true);
    riskState.setKillSwitchOption("confirmEngage", true);
    riskState.setKillSwitchOption("autoEngageDailyLossUsdt", null);
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOON);
    localStorage.clear();
    riskState.reloadFromStorage();
    riskState.resetLimits();
    resetConfig();
    positions.list = [];
    journal.entries = [];
    rmsService.installGateHooks();
});

afterEach(() => {
    rmsService.uninstallGateHooks();
    riskState.releaseKillSwitch({ confirmed: true });
    riskState.resetLimits();
    resetConfig();
    localStorage.clear();
    vi.useRealTimers();
});

describe("FEAT-0526 — default scope equals the pre-existing rule", () => {
    it("classifies every intent kind exactly as increasesExposure does", () => {
        for (const intent of [
            openIntent(),
            addIntent(),
            pendingOrderModifyIntent(),
            tpSlModifyIntent(),
            closeIntent(),
            cancelIntent(),
        ]) {
            expect(rmsService.killSwitchBlocks(intent)).toBe(
                rmsService.increasesExposure(intent),
            );
        }
    });

    it("reports the same scope the explanation renders", () => {
        expect(rmsService.killSwitchScope()).toEqual({
            addsBlocked: true,
            nonTpSlModifiesBlocked: true,
        });
    });
});

describe("FEAT-0526 — block-scope toggles", () => {
    it("opens are always blocked while engaged", () => {
        riskState.engageKillSwitch(NOON);

        expect(orderGate.verify(openIntent()).refusal?.field).toBe("killSwitch");
    });

    it("block adds off lets an add through — but the risk limits still apply", () => {
        riskState.setKillSwitchOption("blockAdds", false);
        riskState.engageKillSwitch(NOON);

        expect(orderGate.verify(addIntent()).approved).toBe(true);

        // The classification the limits read is unchanged: turning off the
        // switch's add rule must not disable maxPositionSize for adds.
        riskState.setLimit("maxPositionSizeUsdt", "1000");
        expect(orderGate.verify(addIntent()).refusal?.field).toBe("maxPositionSize");
    });

    it("block non-TP/SL modifies off lets a pending amendment through — limits still apply", () => {
        riskState.setKillSwitchOption("blockNonTpSlModifies", false);
        riskState.engageKillSwitch(NOON);

        // The full gate has its own payload-parity checks this fixture does
        // not satisfy; the switch predicate and the limit hook are the units
        // under test here.
        expect(rmsService.isBlockedByKillSwitch(pendingOrderModifyIntent(), NOON)).toBe(false);

        riskState.setLimit("maxPositionSizeUsdt", "1000");
        expect(rmsService.checkLimits(pendingOrderModifyIntent())?.field).toBe(
            "maxPositionSize",
        );
    });

    it("TP/SL adjusts stay permitted with both toggles on", () => {
        riskState.engageKillSwitch(NOON);

        expect(orderGate.verify(tpSlModifyIntent()).approved).toBe(true);
        expect(orderGate.verify(closeIntent()).approved).toBe(true);
        expect(orderGate.verify(cancelIntent()).approved).toBe(true);
    });
});

describe("FEAT-0526 — auto-engage on a daily loss", () => {
    it("is off by default", () => {
        journal.entries = [closedTrade("-1000", NOON)];

        expect(orderGate.verify(openIntent()).approved).toBe(true);
        expect(riskState.isKillSwitchEngaged).toBe(false);
    });

    it("arms at the threshold and refuses the order that saw it", () => {
        riskState.setKillSwitchOption("autoEngageDailyLossUsdt", "300");
        journal.entries = [closedTrade("-300", NOON)];

        expect(orderGate.verify(openIntent()).refusal?.field).toBe("killSwitch");
        expect(riskState.isKillSwitchEngaged).toBe(true);
    });

    it("does not arm before the threshold", () => {
        riskState.setKillSwitchOption("autoEngageDailyLossUsdt", "300");
        journal.entries = [closedTrade("-299.99", NOON)];

        expect(orderGate.verify(openIntent()).approved).toBe(true);
        expect(riskState.isKillSwitchEngaged).toBe(false);
    });

    it("never arms on a profitable day", () => {
        riskState.setKillSwitchOption("autoEngageDailyLossUsdt", "100");
        journal.entries = [closedTrade("+500", NOON)];

        expect(orderGate.verify(openIntent()).approved).toBe(true);
        expect(riskState.isKillSwitchEngaged).toBe(false);
    });

    it("does not guess when the day cannot be measured", () => {
        riskState.setKillSwitchOption("autoEngageDailyLossUsdt", "100");
        journal.entries = [closedTrade("-500", NOON, { exitDate: undefined })];

        expect(orderGate.verify(openIntent()).approved).toBe(true);
        expect(riskState.isKillSwitchEngaged).toBe(false);
    });

    it("can arm on a non-exposure intent, so the next open is refused", () => {
        riskState.setKillSwitchOption("autoEngageDailyLossUsdt", "100");
        journal.entries = [closedTrade("-200", NOON)];

        expect(orderGate.verify(cancelIntent()).approved).toBe(true);
        expect(riskState.isKillSwitchEngaged).toBe(true);
    });

    it("does not re-arm after a manual release on the same UTC day", () => {
        riskState.setKillSwitchOption("autoEngageDailyLossUsdt", "100");
        journal.entries = [closedTrade("-200", NOON)];
        expect(orderGate.verify(openIntent()).refusal?.field).toBe("killSwitch");

        riskState.releaseKillSwitch({ confirmed: true }, NOON);
        expect(riskState.isKillSwitchEngaged).toBe(false);

        // The next order would otherwise arm it again immediately.
        expect(orderGate.verify(openIntent()).approved).toBe(true);
        expect(riskState.isKillSwitchEngaged).toBe(false);
    });

    it("arms again on the next UTC day when that day crosses the threshold", () => {
        const nextDay = NOON + 24 * 60 * 60 * 1000;
        riskState.setKillSwitchOption("autoEngageDailyLossUsdt", "100");
        journal.entries = [closedTrade("-200", NOON)];
        expect(orderGate.verify(openIntent()).refusal?.field).toBe("killSwitch");
        riskState.releaseKillSwitch({ confirmed: true }, NOON);

        vi.setSystemTime(nextDay);
        journal.entries = [...journal.entries, closedTrade("-150", nextDay)];

        expect(orderGate.verify(openIntent()).refusal?.field).toBe("killSwitch");
        expect(riskState.isKillSwitchEngaged).toBe(true);
    });

    it("stays engaged across time; nothing releases it automatically", () => {
        riskState.setKillSwitchOption("autoEngageDailyLossUsdt", "100");
        journal.entries = [closedTrade("-500", NOON)];
        expect(orderGate.verify(openIntent()).refusal?.field).toBe("killSwitch");

        // Ten days later, a fresh day that crosses the threshold again: the
        // switch must still be engaged. A profitable day would prove nothing
        // about auto-release, because nothing would have armed it either.
        const later = NOON + 10 * 24 * 60 * 60 * 1000;
        vi.setSystemTime(later);
        journal.entries = [closedTrade("-250", later)];

        expect(orderGate.verify(openIntent()).refusal?.field).toBe("killSwitch");
        expect(riskState.isKillSwitchEngaged).toBe(true);
    });

    it("keeps a close working when the daily-loss assessment throws", () => {
        riskState.setKillSwitchOption("autoEngageDailyLossUsdt", "100");
        const assessment = vi
            .spyOn(rmsService, "assessDailyLoss")
            .mockImplementation(() => {
                throw new Error("journal unreadable");
            });

        try {
            // Before FEAT-0526 a close never reached the assessment. A throw
            // here would turn "exit my position" into an exception at the
            // gate — the one failure worse than refusing.
            expect(orderGate.verify(closeIntent()).approved).toBe(true);
            expect(riskState.isKillSwitchEngaged).toBe(false);
        } finally {
            assessment.mockRestore();
        }
    });

    it("persists an auto-engage once across repeated verifies", () => {
        riskState.setKillSwitchOption("autoEngageDailyLossUsdt", "100");
        journal.entries = [closedTrade("-200", NOON)];
        const writes = vi.spyOn(StorageHelper, "safeSave");

        try {
            expect(orderGate.verify(openIntent()).refusal?.field).toBe("killSwitch");
            const engagedAt = riskState.killSwitchEngagedAt;
            const afterFirst = writes.mock.calls.length;
            expect(afterFirst).toBeGreaterThan(0);

            // `verify` documents this write; it must not repeat it.
            expect(orderGate.verify(openIntent()).refusal?.field).toBe("killSwitch");
            expect(riskState.killSwitchEngagedAt).toBe(engagedAt);
            expect(writes.mock.calls.length).toBe(afterFirst);
        } finally {
            writes.mockRestore();
        }
    });
});
