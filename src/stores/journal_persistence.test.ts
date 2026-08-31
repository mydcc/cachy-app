// @vitest-environment happy-dom
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("$app/environment", () => ({
  browser: true,
}));

const mockUiState = vi.hoisted(() => ({
  showError: vi.fn(),
  showFeedback: vi.fn(),
}));
vi.mock("./ui.svelte", () => ({
  uiState: mockUiState,
}));

const mockSettings = vi.hoisted(() => ({
  journalPaperTrades: true,
}));
vi.mock("./settings.svelte", () => ({
  settingsState: mockSettings,
}));

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(global, "localStorage", { value: localStorageMock });

import { JournalManager } from "./journal.svelte";
import type { JournalEntry } from "./types";
import { CONSTANTS } from "../lib/constants";
import { StorageHelper } from "../utils/storageHelper";

function createTestEntry(id: string, pnl = "100", isPaper = false): JournalEntry {
  return {
    id,
    date: new Date("2026-08-31T10:00:00Z").toISOString(),
    exitDate: new Date("2026-08-31T11:00:00Z").toISOString(),
    symbol: "BTCUSDT",
    tradeType: "long",
    status: new Decimal(pnl).isNegative() ? "Lost" : "Won",
    accountSize: new Decimal(1000),
    riskPercentage: new Decimal(1),
    leverage: new Decimal(10),
    fees: new Decimal("0.05"),
    entryPrice: new Decimal(50000),
    stopLossPrice: new Decimal(49500),
    totalRR: new Decimal(1),
    totalNetProfit: new Decimal(pnl),
    riskAmount: new Decimal(10),
    totalFees: new Decimal(1),
    maxPotentialProfit: new Decimal(20),
    notes: "",
    targets: [],
    calculatedTpDetails: [],
    isPaper,
  } as JournalEntry;
}

describe("JournalManager — Debounced Persistence (FEAT-0258)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorageMock.clear();
    mockSettings.journalPaperTrades = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("batches a rapid burst of mutations into exactly one persistence write after debounce window", async () => {
    const journal = new JournalManager();
    const setItemCallsBefore = localStorageMock.setItem.mock.calls.length;

    // 5 rapid mutations within the debounce window
    journal.addEntry(createTestEntry("trade-1"));
    journal.addEntry(createTestEntry("trade-2"));
    journal.addEntry(createTestEntry("trade-3"));
    journal.updateEntry(createTestEntry("trade-1", "200"));
    journal.deleteEntry("trade-2");

    // Immediately after mutations, no synchronous write should have run yet (0 writes during burst)
    const setItemCallsDuringBurst = localStorageMock.setItem.mock.calls.length - setItemCallsBefore;
    expect(setItemCallsDuringBurst).toBe(0);

    // Fast-forward past debounce window (500ms)
    await vi.advanceTimersByTimeAsync(600);

    // Exactly 1 write after debounce elapses
    const setItemCallsAfter = localStorageMock.setItem.mock.calls.length - setItemCallsBefore;
    expect(setItemCallsAfter).toBe(1);

    // Verify stored data integrity
    const savedJson = localStorageMock.getItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY);
    expect(savedJson).not.toBeNull();
    const parsed = JSON.parse(savedJson!);
    expect(parsed).toHaveLength(2); // trade-1 (updated) and trade-3
    expect(parsed.find((t: JournalEntry) => t.id === "trade-1").totalNetProfit).toBe("200");
    expect(parsed.find((t: JournalEntry) => t.id === "trade-2")).toBeUndefined();
    expect(parsed.find((t: JournalEntry) => t.id === "trade-3")).toBeDefined();

    journal.destroy();
  });

  it("commits pending mutations immediately when flush() is called", async () => {
    const journal = new JournalManager();
    journal.addEntry(createTestEntry("trade-flush"));

    // Flush immediately before timer expires
    await journal.flush();

    const savedJson = localStorageMock.getItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY);
    expect(savedJson).not.toBeNull();
    const parsed = JSON.parse(savedJson!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("trade-flush");

    // Advancing timers should not cause a duplicate write
    const writeCountAfterFlush = localStorageMock.setItem.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(localStorageMock.setItem.mock.calls.length).toBe(writeCountAfterFlush);

    journal.destroy();
  });

  it("surfaces journal.saveFailed error toast when StorageHelper.safeSave fails on quota limit", async () => {
    vi.spyOn(StorageHelper, "safeSave").mockReturnValue(false);

    const journal = new JournalManager();
    journal.addEntry(createTestEntry("trade-fail"));

    await journal.flush();

    expect(mockUiState.showError).toHaveBeenCalledWith("journal.saveFailed");

    journal.destroy();
  });

  it("does not perform redundant writes when entries have not changed (dirty check)", async () => {
    const initialTrades = [createTestEntry("trade-1")];
    localStorageMock.setItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY, JSON.stringify(initialTrades));

    const journal = new JournalManager();
    const initialWriteCount = localStorageMock.setItem.mock.calls.length;

    // Trigger save without changing data
    await journal.flush();

    expect(localStorageMock.setItem.mock.calls.length).toBe(initialWriteCount);

    journal.destroy();
  });

  it("preserves paper-trade filtering behavior in addEntry", () => {
    mockSettings.journalPaperTrades = false;
    const journal = new JournalManager();

    const paperAdded = journal.addEntry(createTestEntry("paper-1", "50", true));
    expect(paperAdded).toBe(false);
    expect(journal.entries).toHaveLength(0);

    const realAdded = journal.addEntry(createTestEntry("real-1", "50", false));
    expect(realAdded).toBe(true);
    expect(journal.entries).toHaveLength(1);

    journal.destroy();
  });
});
