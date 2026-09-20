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

// The journal singleton kicks off a background ATR repair scan on every
// load(), i.e. on every `new JournalManager()` in this file. Left real, it
// mutates journalState via dataRepairService.updateEntry() out of band and
// schedules a save on the singleton — a second, untracked write racing the
// debounced one under test. Mocked to a no-op scan so it never fires.
vi.mock("../services/dataRepairService", () => ({
  dataRepairService: {
    scanForMissingAtr: vi.fn(() => 0),
    repairMissingAtr: vi.fn(async () => {}),
  },
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

import { JournalManager, journalState } from "./journal.svelte";
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
    // The module above also instantiates a singleton at import time, on the
    // real clock: its 500ms auto-save can otherwise fire mid-test and add a
    // second write to the debounced one under test (load-dependent CI flake).
    journalState.destroy();
    vi.clearAllTimers();
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorageMock.clear();
    mockSettings.journalPaperTrades = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    const spy = vi.spyOn(StorageHelper, "safeSave").mockReturnValue(false);

    const journal = new JournalManager();
    journal.addEntry(createTestEntry("trade-fail"));

    await journal.flush();

    expect(mockUiState.showError).toHaveBeenCalledWith("journal.saveFailed");

    journal.destroy();
    spy.mockRestore();
  });

  it("does not perform redundant writes when entries have not changed (dirty check)", async () => {
    const journal = new JournalManager();
    journal.addEntry(createTestEntry("trade-1"));
    await journal.flush();

    const writeCountAfterFirstSave = localStorageMock.setItem.mock.calls.length;

    // Flush again without changing entries
    await journal.flush();

    expect(localStorageMock.setItem.mock.calls.length).toBe(writeCountAfterFirstSave);

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

  it("handles mutations during in-flight save and commits latest state upon flush()", async () => {
    const journal = new JournalManager();
    journal.addEntry(createTestEntry("trade-initial"));

    // Start a flush (which initiates an in-flight save)
    const firstFlush = journal.flush();

    // Immediately while the first save is in-flight, add another entry and flush again
    journal.addEntry(createTestEntry("trade-concurrent"));
    const secondFlush = journal.flush();

    await Promise.all([firstFlush, secondFlush]);

    const savedJson = localStorageMock.getItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY);
    expect(savedJson).not.toBeNull();
    const parsed = JSON.parse(savedJson!);
    expect(parsed).toHaveLength(2);
    expect(parsed.find((t: JournalEntry) => t.id === "trade-initial")).toBeDefined();
    expect(parsed.find((t: JournalEntry) => t.id === "trade-concurrent")).toBeDefined();

    journal.destroy();
  });

  describe("BUG-0442 — destroy() has to disarm the store, not just tidy up after it", () => {
    it("writes nothing when a mutation schedules a save after destroy", async () => {
      const journal = new JournalManager();
      journal.destroy();
      const before = localStorageMock.setItem.mock.calls.length;

      journal.addEntry(createTestEntry("after-destroy"));
      await vi.advanceTimersByTimeAsync(1000);

      // Fails without the fix: destroy() cleared the pending timer but left
      // `effectActive` true, so scheduleSave() armed a fresh one and a store
      // the app had torn down still wrote the journal to localStorage.
      expect(localStorageMock.setItem.mock.calls.length).toBe(before);
    });

    it("writes nothing when flush() is called after destroy", async () => {
      const journal = new JournalManager();
      journal.addEntry(createTestEntry("pending-at-destroy"));
      journal.destroy();
      const before = localStorageMock.setItem.mock.calls.length;

      await journal.flush();

      // flush() reaches save() directly, bypassing the timer destroy() clears —
      // so the timer is not what makes a destroyed store safe. The flag is.
      expect(localStorageMock.setItem.mock.calls.length).toBe(before);
    });

    it("writes nothing on the synchronous unload path after destroy", () => {
      const journal = new JournalManager();
      journal.addEntry(createTestEntry("pending-at-destroy"));
      journal.destroy();
      const before = localStorageMock.setItem.mock.calls.length;

      // destroy() removes the listeners, so this reaches saveSync() only if
      // something re-registered them — and the assertion holds either way.
      // The unload path must not be the hole the other two close.
      window.dispatchEvent(new Event("pagehide"));
      window.dispatchEvent(new Event("beforeunload"));

      expect(localStorageMock.setItem.mock.calls.length).toBe(before);
    });

    it("still persists normally in a store created after another was destroyed", async () => {
      const doomed = new JournalManager();
      doomed.destroy();

      const fresh = new JournalManager();
      const before = localStorageMock.setItem.mock.calls.length;
      fresh.addEntry(createTestEntry("fresh-instance"));
      await vi.advanceTimersByTimeAsync(600);

      // The fix must disarm one instance, not the class: `effectActive` is
      // per-instance and set in the constructor, so a fresh store is live.
      expect(localStorageMock.setItem.mock.calls.length).toBe(before + 1);
      const saved = localStorageMock.getItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY);
      expect(JSON.parse(saved!)).toHaveLength(1);
      fresh.destroy();
    });
  });

  it("synchronously commits pending debounced mutations on pagehide/beforeunload event", () => {
    const journal = new JournalManager();
    journal.addEntry(createTestEntry("trade-unload"));

    // Mutation is pending in debounce timer (no write yet)
    expect(localStorageMock.getItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY)).toBeNull();

    // Trigger pagehide event
    window.dispatchEvent(new Event("pagehide"));

    // Verify synchronous persistence
    const savedJson = localStorageMock.getItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY);
    expect(savedJson).not.toBeNull();
    const parsed = JSON.parse(savedJson!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("trade-unload");

    journal.destroy();
  });
});

describe("JournalManager.updateEntry — BUG-0499 (writers guarantee a close day)", () => {
  it("stamps exitDate when an open entry transitions to closed without one", () => {
    const journal = new JournalManager();
    try {
      const open = { ...createTestEntry("t-open", "0"), status: "Open" } as JournalEntry;
      delete open.exitDate;
      journal.addEntry(open);

      journal.updateEntry({ ...open, status: "Lost" });

      const stored = journal.entries.find((e) => e.id === "t-open");
      expect(stored?.status).toBe("Lost");
      expect(stored?.exitDate).toBeTruthy();
    } finally {
      journal.destroy();
    }
  });

  it("never rewrites exitDate on unrelated edits to an already-closed entry", () => {
    const journal = new JournalManager();
    try {
      const closed = createTestEntry("t-closed", "-50");
      journal.addEntry(closed);
      const originalExit = closed.exitDate;

      journal.updateEntry({ ...closed, notes: "edited later" });

      const stored = journal.entries.find((e) => e.id === "t-closed");
      expect(stored?.exitDate).toBe(originalExit);
    } finally {
      journal.destroy();
    }
  });

  it("keeps an explicitly provided exitDate on close", () => {
    const journal = new JournalManager();
    try {
      const open = { ...createTestEntry("t-explicit", "0"), status: "Open" } as JournalEntry;
      delete open.exitDate;
      journal.addEntry(open);

      const pinned = "2026-08-30T12:00:00.000Z";
      journal.updateEntry({ ...open, status: "Won", exitDate: pinned });

      const stored = journal.entries.find((e) => e.id === "t-explicit");
      expect(stored?.exitDate).toBe(pinned);
    } finally {
      journal.destroy();
    }
  });
});

describe("JournalManager.load — BUG-0499 (legacy migration is explicit)", () => {
  beforeEach(() => {
    journalState.destroy();
    localStorageMock.clear();
  });

  afterEach(() => {
    journalState.destroy();
  });

  it("coerces a foreign stored status to Closed and backfills its close day", () => {
    // A pre-existing closed trade from before `exitDate` existed: no close
    // day on the record, and a status wording no counter understands. Load
    // must migrate it to something measurable instead of silently dropping
    // it from every filter.
    const legacy = {
      ...createTestEntry("t-legacy", "-50"),
      status: "Breakeven",
    } as unknown as Record<string, unknown>;
    delete legacy.exitDate;
    localStorageMock.setItem(
      CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY,
      JSON.stringify([legacy]),
    );

    const journal = new JournalManager();
    try {
      const stored = journal.entries.find((e) => e.id === "t-legacy");
      expect(stored?.status).toBe("Closed");
      expect(stored?.exitDate).toBe(stored?.date);
    } finally {
      journal.destroy();
    }
  });

  it("leaves open entries without a close day on load", () => {
    const open = {
      ...createTestEntry("t-open-load", "0"),
      status: "Open",
    } as unknown as Record<string, unknown>;
    delete open.exitDate;
    localStorageMock.setItem(
      CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY,
      JSON.stringify([open]),
    );

    const journal = new JournalManager();
    try {
      const stored = journal.entries.find((e) => e.id === "t-open-load");
      expect(stored?.status).toBe("Open");
      expect(stored?.exitDate).toBeUndefined();
    } finally {
      journal.destroy();
    }
  });
});
