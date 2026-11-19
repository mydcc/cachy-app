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

/**
 * FEAT-0812 — the per-bot track record, as arithmetic.
 *
 * Every figure here is money or a ratio of money, so every figure is a
 * `Decimal` and every assertion compares against a string rather than a
 * float: an expectancy that is right to fifteen places and wrong at the
 * sixteenth is the failure this discipline exists to catch.
 */

import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";

import {
    botTrackRecords,
    unattributedClosedCount,
    type BotTrackRecord,
} from "./botTrackRecord";
import type { JournalEntry } from "../stores/types";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

interface EntryOverrides {
    id?: string;
    status?: JournalEntry["status"];
    origin?: "bot" | "manual";
    botId?: string;
    strategyHash?: string;
    exitOrigin?: "bot" | "manual";
    netProfit?: string;
    rr?: string;
    entryDate?: string;
    exitDate?: string;
}

let seq = 0;

/** A journal entry carrying only the fields the track record reads. */
function entry(overrides: EntryOverrides = {}): JournalEntry {
    seq += 1;
    const status = overrides.status ?? "Won";
    return {
        id: overrides.id ?? `e-${seq}`,
        date: overrides.entryDate ?? "2026-01-01T00:00:00.000Z",
        entryDate: overrides.entryDate ?? "2026-01-01T00:00:00.000Z",
        exitDate: overrides.exitDate,
        symbol: "BTCUSDT",
        tradeType: "long",
        status,
        accountSize: new Decimal(10000),
        riskPercentage: new Decimal(1),
        leverage: new Decimal(1),
        fees: new Decimal(0),
        entryPrice: new Decimal(100),
        stopLossPrice: new Decimal(90),
        totalRR: new Decimal(overrides.rr ?? "0"),
        totalNetProfit: new Decimal(overrides.netProfit ?? "0"),
        riskAmount: new Decimal(100),
        totalFees: new Decimal(0),
        maxPotentialProfit: new Decimal(0),
        notes: "",
        targets: [],
        calculatedTpDetails: [],
        isPaper: true,
        origin: overrides.origin,
        botId: overrides.botId,
        ruleId: overrides.botId,
        strategyHash: overrides.strategyHash,
        exitOrigin: overrides.exitOrigin,
    };
}

/** A closed trade the bot itself exited. */
function botTrade(overrides: EntryOverrides = {}): JournalEntry {
    return entry({
        origin: "bot",
        botId: "bot-1",
        strategyHash: HASH_A,
        exitOrigin: "bot",
        exitDate: "2026-01-01T06:00:00.000Z",
        ...overrides,
    });
}

function recordOf(records: BotTrackRecord[], botId: string): BotTrackRecord {
    const found = records.find((r) => r.botId === botId);
    if (found === undefined) throw new Error(`no record for ${botId}`);
    return found;
}

describe("FEAT-0812 — botTrackRecords", () => {
    it("returns no records when the journal holds no bot trades", () => {
        const records = botTrackRecords([entry({ origin: "manual" }), entry()]);

        expect(records).toEqual([]);
    });

    it("leaves unattributed legacy trades out of every bot record", () => {
        const records = botTrackRecords([
            botTrade({ netProfit: "50", exitDate: "2026-01-02T00:00:00.000Z" }),
            // No origin at all — written before FEAT-0806 attributed anything.
            entry({ netProfit: "999", exitDate: "2026-01-03T00:00:00.000Z" }),
        ]);

        expect(records).toHaveLength(1);
        expect(recordOf(records, "bot-1").trades).toBe(1);
        expect(recordOf(records, "bot-1").totalPnl.toString()).toBe("50");
    });

    it("reports how many closed trades carry no attribution at all", () => {
        const count = unattributedClosedCount([
            botTrade(),
            entry({ origin: "manual", status: "Lost" }),
            entry({ status: "Won" }),
            entry({ status: "Closed" }),
            entry({ status: "Open" }),
        ]);

        expect(count).toBe(2);
    });

    it("groups one bot's trades per strategy version", () => {
        const records = botTrackRecords([
            botTrade({ strategyHash: HASH_A, netProfit: "10" }),
            botTrade({ strategyHash: HASH_A, netProfit: "20" }),
            botTrade({ strategyHash: HASH_B, netProfit: "5" }),
        ]);

        expect(records).toHaveLength(2);
        const versions = records.map((r) => r.strategyHash).sort();
        expect(versions).toEqual([HASH_A, HASH_B]);
    });

    it("computes win rate, average R, expectancy, total PnL and max drawdown as Decimal", () => {
        // Three closed trades: +200 (R 2), -100 (R -1), +100 (R 1).
        // Cumulative: 200, 100, 200 → peak 200, trough 100 → drawdown 100.
        const records = botTrackRecords([
            botTrade({
                netProfit: "200",
                rr: "2",
                status: "Won",
                exitDate: "2026-01-01T10:00:00.000Z",
            }),
            botTrade({
                netProfit: "-100",
                rr: "-1",
                status: "Lost",
                exitDate: "2026-01-02T10:00:00.000Z",
            }),
            botTrade({
                netProfit: "100",
                rr: "1",
                status: "Won",
                exitDate: "2026-01-03T10:00:00.000Z",
            }),
        ]);

        const record = recordOf(records, "bot-1");
        expect(record.trades).toBe(3);
        expect(record.wins).toBe(2);
        expect(record.totalPnl.toString()).toBe("200");
        expect(record.maxDrawdown.toString()).toBe("100");
        // 2/3 of 100, exact in Decimal and not in a float.
        expect(record.winRate.toFixed(4)).toBe("66.6667");
        // (2 + -1 + 1) / 3
        expect(record.avgR.toFixed(4)).toBe("0.6667");
        // winRate × avgWin − lossRate × avgLoss = 2/3 × 150 − 1/3 × 100
        expect(record.expectancy.toFixed(4)).toBe("66.6667");
        expect(record.winRate).toBeInstanceOf(Decimal);
        expect(record.expectancy).toBeInstanceOf(Decimal);
        expect(record.maxDrawdown).toBeInstanceOf(Decimal);
        expect(record.avgR).toBeInstanceOf(Decimal);
        expect(record.totalPnl).toBeInstanceOf(Decimal);
    });

    it("builds the equity curve in close order, oldest first", () => {
        const records = botTrackRecords([
            botTrade({ netProfit: "100", exitDate: "2026-01-03T00:00:00.000Z" }),
            botTrade({ netProfit: "-40", exitDate: "2026-01-01T00:00:00.000Z" }),
            botTrade({ netProfit: "10", exitDate: "2026-01-02T00:00:00.000Z" }),
        ]);

        const curve = recordOf(records, "bot-1").equityCurve.map((p) => p.toString());
        expect(curve).toEqual(["-40", "-30", "70"]);
    });

    it("counts a bot-opened, manually closed trade apart and keeps it out of the win rate", () => {
        const records = botTrackRecords([
            botTrade({ netProfit: "100", status: "Won" }),
            botTrade({
                netProfit: "-500",
                status: "Lost",
                exitOrigin: "manual",
                exitDate: "2026-01-05T00:00:00.000Z",
            }),
        ]);

        const record = recordOf(records, "bot-1");
        expect(record.trades).toBe(1);
        expect(record.winRate.toString()).toBe("100");
        expect(record.totalPnl.toString()).toBe("100");
        expect(record.manualExits).toBe(1);
        expect(record.manualExitPnl.toString()).toBe("-500");
    });

    it("treats a bot trade closed before exit attribution existed as the bot's own exit", () => {
        const records = botTrackRecords([
            botTrade({ netProfit: "70", exitOrigin: undefined }),
        ]);

        const record = recordOf(records, "bot-1");
        expect(record.trades).toBe(1);
        expect(record.manualExits).toBe(0);
    });

    it("counts a still-open bot trade apart from the closed track record", () => {
        const records = botTrackRecords([
            botTrade({ netProfit: "40" }),
            botTrade({ status: "Open", netProfit: "0", exitDate: undefined }),
        ]);

        const record = recordOf(records, "bot-1");
        expect(record.trades).toBe(1);
        expect(record.openTrades).toBe(1);
    });

    it("keeps a deleted bot's closed trades in their own record", () => {
        // Nothing here knows the rule store; a record is built from entries
        // alone, so deleting the rule cannot erase the track record.
        const records = botTrackRecords([
            botTrade({ botId: "bot-gone", netProfit: "15" }),
        ]);

        expect(records).toHaveLength(1);
        expect(recordOf(records, "bot-gone").totalPnl.toString()).toBe("15");
    });

    it("averages the holding time over trades that carry both ends", () => {
        const records = botTrackRecords([
            botTrade({
                entryDate: "2026-01-01T00:00:00.000Z",
                exitDate: "2026-01-01T02:00:00.000Z",
            }),
            botTrade({
                entryDate: "2026-01-02T00:00:00.000Z",
                exitDate: "2026-01-02T04:00:00.000Z",
            }),
        ]);

        const avg = recordOf(records, "bot-1").avgHoldingMs;
        expect(avg).not.toBeNull();
        expect(avg?.toString()).toBe(String(3 * 60 * 60 * 1000));
    });

    it("orders records by the most recently active bot first", () => {
        const records = botTrackRecords([
            botTrade({ botId: "older", exitDate: "2026-01-01T00:00:00.000Z" }),
            botTrade({ botId: "newer", exitDate: "2026-03-01T00:00:00.000Z" }),
        ]);

        expect(records.map((r) => r.botId)).toEqual(["newer", "older"]);
    });
});
