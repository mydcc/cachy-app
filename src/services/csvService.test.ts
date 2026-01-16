import { describe, it, expect } from "vitest";
import { csvService } from "./csvService";
import { Decimal } from "decimal.js";
import type { JournalEntry } from "../stores/types";

describe("csvService", () => {
  it("should generate CSV string correctly", () => {
    const mockJournal: JournalEntry[] = [
      {
        id: 12345,
        date: "2023-01-01T12:00:00.000Z",
        symbol: "BTCUSDT",
        tradeType: "long",
        status: "Won",
        accountSize: new Decimal(1000),
        riskPercentage: new Decimal(1),
        leverage: new Decimal(10),
        fees: new Decimal(0.1),
        entryPrice: new Decimal(50000),
        stopLossPrice: new Decimal(49000),
        totalRR: new Decimal(2),
        totalNetProfit: new Decimal(100),
        riskAmount: new Decimal(10),
        totalFees: new Decimal(5),
        maxPotentialProfit: new Decimal(200),
        notes: 'Test "Notes"',
        tags: ["tag1", "tag2"],
        targets: [
            { price: new Decimal(51000), percent: new Decimal(50), isLocked: false },
            { price: new Decimal(52000), percent: new Decimal(50), isLocked: false }
        ],
        calculatedTpDetails: []
      } as unknown as JournalEntry,
    ];

    const csv = csvService.generateCSV(mockJournal);
    expect(csv).toContain("BTCUSDT");
    expect(csv).toContain("long");
    expect(csv).toContain('"Test ""Notes"""'); // Escaped quotes
    expect(csv).toContain('"tag1;tag2"');
    expect(csv).toContain("51000.0000"); // TP1 Price
  });

  it("should escape CSV injection characters", () => {
    const mockJournal: JournalEntry[] = [
      {
        id: 1,
        date: "2023-01-01T10:00:00Z", // Required valid date for ISO conversion
        symbol: "=cmd|' /C calc'!A0", // Malicious payload
        notes: "+Sum(1+1)",
      } as unknown as JournalEntry,
    ];
    const csv = csvService.generateCSV(mockJournal);
    expect(csv).toContain("'=cmd|' /C calc'!A0");
    expect(csv).toContain("'+Sum(1+1)");
  });

  it("should parse CSV content correctly", () => {
    const csvContent = `ID,Datum,Uhrzeit,Symbol,Typ,Status,Einstieg,Stop Loss,Notizen,Tags,TP1 Preis,TP1 %
12345,01.01.2023,12:00:00,BTCUSDT,Long,Won,50000,49000,"Test ""Notes""","tag1;tag2",51000,50`;

    const entries = csvService.parseCSVContent(csvContent);
    expect(entries.length).toBe(1);
    const entry = entries[0];
    expect(entry.symbol).toBe("BTCUSDT");
    expect(entry.tradeType).toBe("long"); // Lowercased
    expect(entry.entryPrice.toNumber()).toBe(50000);
    expect(entry.notes).toBe('Test "Notes"');
    expect(entry.tags).toEqual(["tag1", "tag2"]);
    expect(entry.targets.length).toBeGreaterThan(0);
    expect(entry.targets[0].price.toNumber()).toBe(51000);
  });
});
