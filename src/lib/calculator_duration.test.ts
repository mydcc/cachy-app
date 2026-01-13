import { describe, it, expect } from "vitest";
import { calculator } from "./calculator";
import type { JournalEntry } from "../stores/types";
import { Decimal } from "decimal.js";

describe("calculator.getDurationData", () => {
  it("should calculate duration for synced trades using entryDate and date", () => {
    const entryTime = new Date("2023-01-01T10:00:00Z").getTime();
    const exitTime = new Date("2023-01-01T11:00:00Z").getTime(); // 1 hour duration

    const trade: JournalEntry = {
      id: 1,
      date: new Date(exitTime).toISOString(), // Exit time for synced
      entryDate: new Date(entryTime).toISOString(),
      isManual: false,
      status: "Won",
      symbol: "BTCUSDT",
      tradeType: "long",
      totalNetProfit: new Decimal(100),
      accountSize: new Decimal(1000),
      riskPercentage: new Decimal(1),
      leverage: new Decimal(1),
      fees: new Decimal(0),
      entryPrice: new Decimal(20000),
      stopLossPrice: new Decimal(19000),
      totalRR: new Decimal(1),
      riskAmount: new Decimal(10),
      totalFees: new Decimal(0),
      maxPotentialProfit: new Decimal(0),
      notes: "",
      targets: [],
      calculatedTpDetails: [],
    };

    const result = calculator.getDurationData([trade]);

    // Strictly expect length 1 and correct duration
    expect(result.scatterData).toHaveLength(1);
    expect(result.scatterData[0].x).toBeCloseTo(60);
  });

  it("should calculate duration for manual trades using date and exitDate", () => {
    const entryTime = new Date("2023-01-01T10:00:00Z").getTime();
    const exitTime = new Date("2023-01-01T11:30:00Z").getTime(); // 90 min duration

    const trade: JournalEntry = {
      id: 2,
      date: new Date(entryTime).toISOString(), // Entry time for manual
      entryDate: new Date(entryTime).toISOString(),
      exitDate: new Date(exitTime).toISOString(),
      isManual: true,
      status: "Won",
      symbol: "BTCUSDT",
      tradeType: "long",
      totalNetProfit: new Decimal(100),
      accountSize: new Decimal(1000),
      riskPercentage: new Decimal(1),
      leverage: new Decimal(1),
      fees: new Decimal(0),
      entryPrice: new Decimal(20000),
      stopLossPrice: new Decimal(19000),
      totalRR: new Decimal(1),
      riskAmount: new Decimal(10),
      totalFees: new Decimal(0),
      maxPotentialProfit: new Decimal(0),
      notes: "",
      targets: [],
      calculatedTpDetails: [],
    };

    const result = calculator.getDurationData([trade]);
    expect(result.scatterData).toHaveLength(1);
    expect(result.scatterData[0].x).toBeCloseTo(90);
  });
});
