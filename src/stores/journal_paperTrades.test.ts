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

/*
 * Paper trades in the journal.
 *
 * Two things have to hold at once, and they pull in opposite directions:
 * simulated fills are *kept* so they can be reviewed, and they are *absent*
 * from every number that claims to describe real money.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("$app/environment", () => ({ browser: false, dev: true }));

const settings = vi.hoisted(() => ({ journalPaperTrades: true }));
vi.mock("./settings.svelte", () => ({ settingsState: settings }));

import { journalState } from "./journal.svelte";
import type { JournalEntry } from "./types";

function entry(id: string, pnl: string, isPaper?: boolean): JournalEntry {
    return {
        id,
        date: new Date("2026-08-16T10:00:00Z").toISOString(),
        exitDate: new Date("2026-08-16T11:00:00Z").toISOString(),
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
        ...(isPaper === undefined ? {} : { isPaper }),
    } as JournalEntry;
}

beforeEach(() => {
    settings.journalPaperTrades = true;
    journalState.set([]);
});

describe("journal — the save toggle", () => {
    it("records a paper trade when the setting is on", () => {
        expect(journalState.addEntry(entry("p1", "-50", true))).toBe(true);
        expect(journalState.entries).toHaveLength(1);
    });

    it("drops a paper trade at the door when the setting is off", () => {
        settings.journalPaperTrades = false;
        expect(journalState.addEntry(entry("p1", "-50", true))).toBe(false);
        expect(journalState.entries).toHaveLength(0);
    });

    it("never drops a real trade, whatever the setting", () => {
        settings.journalPaperTrades = false;
        expect(journalState.addEntry(entry("r1", "120"))).toBe(true);
        expect(journalState.addEntry(entry("r2", "-30", false))).toBe(true);
        expect(journalState.entries).toHaveLength(2);
    });

    it("leaves entries already stored alone when the setting is turned off", () => {
        journalState.addEntry(entry("p1", "-50", true));
        settings.journalPaperTrades = false;
        // Turning the setting off stops new ones being recorded; it does not
        // retroactively delete a trader's history.
        expect(journalState.entries).toHaveLength(1);
    });
});

describe("journal — paper trades never reach the statistics", () => {
    it("excludes them from analysisEntries while keeping them in entries", () => {
        journalState.addEntry(entry("r1", "100"));
        journalState.addEntry(entry("p1", "-500", true));
        journalState.addEntry(entry("r2", "-40"));

        expect(journalState.entries).toHaveLength(3);
        expect(journalState.analysisEntries.map((e) => e.id)).toEqual(["r1", "r2"]);
        expect(journalState.paperEntryCount).toBe(1);
    });

    it("keeps a losing paper trade out of the performance numbers", () => {
        journalState.addEntry(entry("r1", "100"));
        const realOnly = journalState.performanceMetrics;

        journalState.addEntry(entry("p1", "-100000", true));

        // A simulated disaster must not move a figure that claims to describe
        // real money.
        expect(journalState.performanceMetrics).toEqual(realOnly);
    });

    it("treats an entry with no isPaper flag as real", () => {
        journalState.addEntry(entry("legacy", "75"));
        expect(journalState.analysisEntries).toHaveLength(1);
        expect(journalState.paperEntryCount).toBe(0);
    });

    it("reports zero paper entries for a journal of real trades", () => {
        journalState.addEntry(entry("r1", "10"));
        journalState.addEntry(entry("r2", "-10", false));
        expect(journalState.paperEntryCount).toBe(0);
        expect(journalState.analysisEntries).toHaveLength(2);
    });
});
