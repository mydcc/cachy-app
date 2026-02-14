import { bench, describe } from "vitest";
import { Decimal } from "decimal.js";
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
    } as any);
  }

  bench("calculatePerformanceStats (10k trades)", () => {
    calculatePerformanceStats(journalData);
  });
});
