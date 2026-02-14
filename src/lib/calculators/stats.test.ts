import { describe, it, expect } from "vitest";
import { calculatePerformanceStats } from "./stats";
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
