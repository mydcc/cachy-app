// @vitest-environment node
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

import { describe, it, expect } from "vitest";
import { calculatePerformanceStats, getTagData, getCalendarData, getDurationStats } from "./stats";
import { Decimal } from "decimal.js";
import type { JournalEntry } from "../../stores/types";

// Helper to create dummy trades
const createTrade = (overrides: Partial<JournalEntry>): JournalEntry => ({
  id: 1,
  date: new Date().toISOString(),
  symbol: "BTCUSDT",
  tradeType: "Long",
  status: "Won",
  accountSize: new Decimal(10000),
  riskPercentage: new Decimal(1),
  leverage: new Decimal(10),
  fees: new Decimal(0),
  entryPrice: new Decimal(30000),
  stopLossPrice: new Decimal(29700),
  totalRR: new Decimal(2),
  totalNetProfit: new Decimal(300),
  riskAmount: new Decimal(100),
  totalFees: new Decimal(5),
  maxPotentialProfit: new Decimal(500),
  notes: "",
  targets: [],
  calculatedTpDetails: [],
  ...overrides,
});

describe("calculatePerformanceStats (Summary)", () => {
    it("returns null if no closed trades", () => {
        const trades = [createTrade({ status: "Open" })];
        expect(calculatePerformanceStats(trades)).toBeNull();
    });

    it("calculates summary stats correctly for mixed trades", () => {
        const trades: JournalEntry[] = [
            createTrade({ id: 1, status: "Won", totalNetProfit: new Decimal(200), riskAmount: new Decimal(100), totalRR: new Decimal(2), tradeType: "Long" }),
            createTrade({ id: 2, status: "Lost", totalNetProfit: new Decimal(-100), riskAmount: new Decimal(100), totalRR: new Decimal(-1), tradeType: "Long" }),
            createTrade({ id: 3, status: "Won", totalNetProfit: new Decimal(300), riskAmount: new Decimal(100), totalRR: new Decimal(3), tradeType: "Long" }),
            createTrade({ id: 4, status: "Lost", totalNetProfit: new Decimal(-100), riskAmount: new Decimal(100), totalRR: new Decimal(-1), tradeType: "Long" }),
        ];

        const stats = calculatePerformanceStats(trades);
        expect(stats).not.toBeNull();
        if (!stats) return;

        expect(stats.totalTrades).toBe(4);
        expect(stats.winRate).toBe(50);
        expect(stats.profitFactor.toNumber()).toBe(2.5);
        expect(stats.avgWin.toNumber()).toBe(250);
        expect(stats.avgLossOnly.toNumber()).toBe(100);
        expect(stats.avgRR.toNumber()).toBe(0.75);
        expect(stats.avgRMultiple.toNumber()).toBe(0.75);
        expect(stats.maxDrawdown.toNumber()).toBe(100);
    });

    it("calculates streaks correctly", () => {
        // W, W, L, W, W, W, L, L
        const statuses = ["Won", "Won", "Lost", "Won", "Won", "Won", "Lost", "Lost"];
        const trades = statuses.map((s, i) => createTrade({
            id: i,
            date: new Date(Date.now() + i * 1000).toISOString(),
            status: s,
            totalNetProfit: new Decimal(s === "Won" ? 100 : -100),
            riskAmount: new Decimal(100)
        }));

        const stats = calculatePerformanceStats(trades);
        expect(stats).not.toBeNull();
        if (!stats) return;

        expect(stats.longestWinningStreak).toBe(3);
        expect(stats.longestLosingStreak).toBe(2);

        // Current Streak: Last are L, L. So L2.
        expect(stats.currentStreakText).toBe("L2");
    });

    it("handles streak logic with non-Won/Lost trades correctly", () => {
        // This test verifies that ANY trade not status "Won" breaks the winning streak.
        // Even though calculatePerformanceStats filters for Won/Lost by default,
        // if context provides other trades, the logic should handle them.
        // We simulate this by passing a trade with status "Open" in the input,
        // but note that calculatePerformanceStats internally filters by Won/Lost if context is not provided.
        // To test the logic inside the loop (which iterates sortedTrades), we need sortedTrades to contain the "Open" trade.
        // But sortedTrades is derived from closedTrades, which is filtered.
        // SO: Standard usage will NOT see "Open" trades.
        // BUT: if context.closedTrades is provided, it might contain them?
        // aggregator.ts constructs closedTrades with strict filtering.
        // So in practice, "Open" trades never reach the loop.

        // HOWEVER, "BreakEven" or other statuses might be added later.
        // The regression concern was valid for future-proofing or custom contexts.

        // Let's create a context with a weird trade to force it into the loop.
        const mixedTrades = [
            createTrade({ id: 1, status: "Won", date: "2023-01-01" }),
            createTrade({ id: 2, status: "Won", date: "2023-01-02" }),
            createTrade({ id: 3, status: "BreakEven", date: "2023-01-03" }),
            createTrade({ id: 4, status: "Won", date: "2023-01-04" }),
        ];

        const context = {
            closedTrades: mixedTrades, // Pre-sorted
            openTrades: []
        };

        // Pass context to bypass internal filtering
        const stats = calculatePerformanceStats([], context);

        expect(stats).not.toBeNull();
        if (!stats) return;

        // W, W, BE (Loss for streak), W
        // Longest Win Streak: 2 (First two)
        // Current Streak: W1 (Last one)

        expect(stats.longestWinningStreak).toBe(2);
        expect(stats.currentStreakText).toBe("W1");
    });
});

describe("getDurationStats (BUG-0601)", () => {
    it("returns localization keys for the duration buckets instead of hardcoded English labels", () => {
        // 10 minutes and 2 hours open — one trade per bucket, the rest empty.
        const trades = [
            createTrade({
                id: 1,
                status: "Won",
                totalNetProfit: new Decimal(50),
                entryDate: "2026-01-01T00:00:00.000Z",
                exitDate: "2026-01-01T00:10:00.000Z",
            }),
            createTrade({
                id: 2,
                status: "Lost",
                totalNetProfit: new Decimal(-20),
                entryDate: "2026-01-02T00:00:00.000Z",
                exitDate: "2026-01-02T02:00:00.000Z",
            }),
        ];

        const { labelKeys, pnlData, winRateData } = getDurationStats(trades);

        // The calculator hands the host keys, not display text: only the UI
        // boundary can translate them, and a wrong key is a type error.
        expect(labelKeys).toEqual([
            "journal.deepDive.charts.labels.durationUnder15m",
            "journal.deepDive.charts.labels.durationM15to1h",
            "journal.deepDive.charts.labels.durationH1to4h",
            "journal.deepDive.charts.labels.durationH4to24h",
            "journal.deepDive.charts.labels.durationOver24h",
        ]);

        // Bucket math must be untouched by the label change.
        expect(pnlData[0]?.toString()).toBe("50");
        expect(pnlData[2]?.toString()).toBe("-20");
        expect(winRateData[0]).toBe(100);
        expect(winRateData[2]).toBe(0);
    });
});

describe("Decimal precision (BUG-0594)", () => {
    it("keeps tag PnL exact past float64 range instead of collapsing to one double", () => {
        // 9007199254740993 is not representable as a double; `.toNumber()`
        // silently rounded it to 9007199254740992 before the UI saw it.
        const trades = [
            createTrade({ id: 1, status: "Won", totalNetProfit: new Decimal("9007199254740993"), tags: ["scalp"] }),
        ];

        const tagData = getTagData(trades);

        expect(tagData.pnlData[0]).toBeInstanceOf(Decimal);
        expect((tagData.pnlData[0] as Decimal).toString()).toBe("9007199254740993");
    });

    it("keeps calendar PnL exact past float64 range", () => {
        const trades = [
            createTrade({ id: 1, status: "Won", totalNetProfit: new Decimal("9007199254740993"), date: "2026-01-02T12:00:00.000Z" }),
        ];

        const calendar = getCalendarData(trades);

        expect(calendar).toHaveLength(1);
        expect(calendar[0].pnl).toBeInstanceOf(Decimal);
        expect((calendar[0].pnl as Decimal).toString()).toBe("9007199254740993");
    });
});
