import { bench, describe } from "vitest";
import { calculatePerformanceStats } from "../../src/lib/calculators/stats";
import type { JournalEntry } from "../../src/stores/types";

describe("calculatePerformanceStats", () => {
  const tradeCount = 10000;
  const journalData: JournalEntry[] = [];
  const startDate = new Date("2023-01-01").getTime();

  for (let i = 0; i < tradeCount; i++) {
    const isWin = Math.random() > 0.5;
    const pnl = isWin ? (Math.random() * 100 + 10) : -(Math.random() * 50 + 10);

    journalData.push({
      id: `trade-${i}`,
      date: new Date(startDate + i * 3600000).toISOString(),
      status: isWin ? "Won" : "Lost",
      totalNetProfit: pnl,
      riskAmount: 50,
      tradeType: Math.random() > 0.5 ? "Long" : "Short",
      entryDate: new Date(startDate + i * 3600000).toISOString(),
      exitDate: new Date(startDate + i * 3600000 + 1800000).toISOString(),
      symbol: "BTCUSDT",
      isManual: false,
    } as unknown as JournalEntry);
  }

  bench("Current (O(N log N) date parse)", () => {
    // Re-implementation of original sorting logic to measure exactly the slow part
    const closedTrades = journalData.filter((t) => t.status === "Won" || t.status === "Lost");
    const _sorted = [...closedTrades].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
  });

  bench("Optimized (Schwartzian transform)", () => {
    const closedTrades = journalData.filter((t) => t.status === "Won" || t.status === "Lost");
    const _sorted = closedTrades
        .map((t) => ({ t, ts: new Date(t.date).getTime() }))
        .sort((a, b) => a.ts - b.ts)
        .map(({ t }) => t);
  });

  bench("calculatePerformanceStats (10k trades)", () => {
    calculatePerformanceStats(journalData);
  });
});
