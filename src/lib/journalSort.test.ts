// Copyright (C) 2026 MYDCT
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/*
 * The journal sort helpers live in their own module precisely so these
 * contracts are reachable: `sortTradesList` in JournalTable is driven by
 * `internalSortField`, which is assigned once and never written again, so no
 * mounted table can exercise it. Testing through the UI would leave both
 * helpers unpinned — which is how a null-ordering regression once shipped.
 *
 * Each test names the behavior, not the function.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { sortJournalRows, sortJournalEntries } from "./journalSort";

interface Row {
    id: string;
    date?: string;
    exitDate?: string;
    entryDate?: string;
    symbol?: string | null;
    status?: string | null;
    pnl?: Decimal | number | null;
    entryPrice?: Decimal.Value;
    stopLossPrice?: Decimal.Value;
    atrValue?: Decimal.Value;
}

const ids = (rows: { id: string }[]) => rows.map(r => r.id);

describe("sortJournalRows", () => {
    it("sorts rows without a date first ascending and last descending", () => {
        const rows: Row[] = [
            { id: "with-3", date: "2026-01-03T00:00:00.000Z" },
            { id: "missing-a", date: undefined },
            { id: "with-1", date: "2026-01-01T00:00:00.000Z" },
            { id: "missing-b", date: null },
        ];

        // This helper normalises a missing value to -Infinity, so it leads the
        // ascending order and trails the descending one. That is the opposite
        // of sortJournalEntries, which pins blanks to the bottom in both
        // directions. The two conventions are pre-existing and deliberately
        // left alone: each is pinned here so neither drifts silently.
        expect(ids(sortJournalRows(rows, "date", "asc"))).toEqual([
            "missing-a",
            "missing-b",
            "with-1",
            "with-3",
        ]);
        expect(ids(sortJournalRows(rows, "date", "desc"))).toEqual([
            "with-3",
            "with-1",
            "missing-a",
            "missing-b",
        ]);
    });

    it("orders by exitDate correctly when some rows are still open", () => {
        // A row with no exitDate used to suppress the date conversion on BOTH
        // sides of the comparison, so the ISO string and the -Infinity sentinel
        // compared as equal and the order came out arbitrary. The still-open row
        // normalises to -Infinity, so it leads ascending and trails descending.
        const rows: Row[] = [
            { id: "closed-early", date: "2026-01-01T00:00:00.000Z", exitDate: "2026-01-02T00:00:00.000Z" },
            { id: "still-open", date: "2026-01-01T00:00:00.000Z" },
            { id: "closed-late", date: "2026-01-01T00:00:00.000Z", exitDate: "2026-01-05T00:00:00.000Z" },
        ];

        expect(ids(sortJournalRows(rows, "exitDate", "asc"))).toEqual([
            "still-open",
            "closed-early",
            "closed-late",
        ]);
        expect(ids(sortJournalRows(rows, "exitDate", "desc"))).toEqual([
            "closed-late",
            "closed-early",
            "still-open",
        ]);
    });

    it("sorts a row with an unparseable date with the blank rows, not in place", () => {
        const rows: Row[] = [
            { id: "jan-01", date: "2026-01-01T00:00:00.000Z" },
            { id: "jan-02", date: "2026-01-02T00:00:00.000Z" },
            { id: "corrupt", date: "13/45/2026" },
            { id: "jan-03", date: "2026-01-03T00:00:00.000Z" },
        ];

        // Date.parse returns NaN for a value it cannot read, and every
        // comparison against NaN is false, so the comparator used to answer
        // "equal to everything": the row never moved and acted as a barrier the
        // surrounding rows could not cross. An unparseable date is a missing
        // value, so it belongs in the same bucket -- first ascending, last
        // descending, exactly like a row with no date at all.
        expect(ids(sortJournalRows(rows, "date", "asc"))).toEqual([
            "corrupt",
            "jan-01",
            "jan-02",
            "jan-03",
        ]);
        expect(ids(sortJournalRows(rows, "date", "desc"))).toEqual([
            "jan-03",
            "jan-02",
            "jan-01",
            "corrupt",
        ]);
    });

    it("orders entryDate chronologically rather than as text", () => {
        // Not a claim that a column offers this today -- none does. The point is
        // that `entryDate` was missing from the date-parsing branch and fell
        // through to a string compare, where "2026-01-02…" sorts after
        // "2026-01-01…" no matter what the clock says, so the first column to
        // offer it would have inherited the bug. These two rows are 23:00Z and
        // 22:00Z; only the offset makes the two orders disagree.
        const rows: Row[] = [
            { id: "late-utc", entryDate: "2026-01-01T23:00:00.000Z" },
            { id: "early-offset", entryDate: "2026-01-02T00:00:00+02:00" },
        ];

        expect(ids(sortJournalRows(rows, "entryDate", "asc"))).toEqual(["early-offset", "late-utc"]);
        expect(ids(sortJournalRows(rows, "entryDate", "desc"))).toEqual(["late-utc", "early-offset"]);
    });

    it("sorts the duration column by elapsed milliseconds", () => {
        const rows: Row[] = [
            { id: "long", entryDate: "2026-01-01T00:00:00.000Z", exitDate: "2026-01-01T01:00:00.000Z" },
            { id: "short", entryDate: "2026-01-01T00:00:00.000Z", exitDate: "2026-01-01T00:01:00.000Z" },
            { id: "none", entryDate: "2026-01-01T00:00:00.000Z" },
        ];

        // "none" has no exitDate, so it falls back to date and measures 0.
        expect(ids(sortJournalRows(rows, "duration", "asc"))).toEqual(["none", "short", "long"]);
    });

    it("sorts missing values first for the textual symbol and status columns", () => {
        const rows: Row[] = [
            { id: "b", symbol: "BTCUSDT" },
            { id: "blank" },
            { id: "a", symbol: "ADAUSDT" },
        ];

        // "" sorts before every real symbol.
        expect(ids(sortJournalRows(rows, "symbol", "asc"))).toEqual(["blank", "a", "b"]);
    });

    it("compares Decimal amounts numerically, not lexicographically", () => {
        const rows: Row[] = [
            { id: "nine", pnl: new Decimal(9) },
            { id: "ten", pnl: new Decimal(10) },
            { id: "hundred", pnl: new Decimal(100) },
        ];

        expect(ids(sortJournalRows(rows, "pnl", "asc"))).toEqual(["nine", "ten", "hundred"]);
        expect(ids(sortJournalRows(rows, "pnl", "desc"))).toEqual(["hundred", "ten", "nine"]);
    });

    it("leaves the caller's array and its Decimal payloads untouched", () => {
        const pnl = new Decimal(42);
        const rows: Row[] = [
            { id: "a", date: "2026-01-02T00:00:00.000Z", pnl },
            { id: "b", date: "2026-01-01T00:00:00.000Z" },
        ];
        const snapshot = [...rows];

        const sorted = sortJournalRows(rows, "date", "asc");

        expect(ids(rows)).toEqual(["a", "b"]);
        expect(rows).toEqual(snapshot);
        expect(ids(sorted)).toEqual(["b", "a"]);
        // The key is computed into a scratch object; the row keeps its Decimal.
        expect(sorted[0].pnl).toBeUndefined();
        expect(rows[0].pnl).toBe(pnl);
    });

    it("preserves input order for rows with equal keys", () => {
        const rows: Row[] = [
            { id: "first", symbol: "BTCUSDT" },
            { id: "second", symbol: "BTCUSDT" },
            { id: "third", symbol: "BTCUSDT" },
        ];

        expect(ids(sortJournalRows(rows, "symbol", "asc"))).toEqual(["first", "second", "third"]);
        expect(ids(sortJournalRows(rows, "symbol", "desc"))).toEqual(["first", "second", "third"]);
    });
});

describe("sortJournalEntries", () => {
    it("keeps rows without a sort value last in both directions", () => {
        const rows: Row[] = [
            { id: "three", pnl: 3 },
            { id: "blank", pnl: undefined },
            { id: "one", pnl: 1 },
        ];

        expect(ids(sortJournalEntries(rows, "pnl", "asc"))).toEqual(["one", "three", "blank"]);
        // This is the exact regression: `direction === "asc" ? 1 : -1` moved
        // missing values to the top of every descending sort.
        expect(ids(sortJournalEntries(rows, "pnl", "desc"))).toEqual(["three", "one", "blank"]);
    });

    it("sorts the computed slAtr column instead of leaving it unordered", () => {
        // slAtr is a UI-computed column, not a JournalEntry property, so the
        // raw field read is always undefined. The null early-returns used to sit
        // ABOVE the slAtr branch, short-circuiting every comparison to 0 and
        // making the sort a silent no-op.
        const rows: Row[] = [
            { id: "hi", entryPrice: 10, stopLossPrice: 5, atrValue: 1 },
            { id: "mid", entryPrice: 5, stopLossPrice: 2.5, atrValue: 1 },
            { id: "lo", entryPrice: 1, stopLossPrice: 0.5, atrValue: 1 },
        ];

        expect(ids(sortJournalEntries(rows, "slAtr", "asc"))).toEqual(["lo", "mid", "hi"]);
        expect(ids(sortJournalEntries(rows, "slAtr", "desc"))).toEqual(["hi", "mid", "lo"]);
    });

    it("sorts incomplete and zero-ATR slAtr rows first", () => {
        const rows: Row[] = [
            { id: "good", entryPrice: 10, stopLossPrice: 5, atrValue: 2.5 },
            { id: "no-atr", entryPrice: 10, stopLossPrice: 5 },
            { id: "zero-atr", entryPrice: 10, stopLossPrice: 5, atrValue: 0 },
        ];

        // Both incomplete cases collapse to -1 and tie; input order breaks the tie.
        expect(ids(sortJournalEntries(rows, "slAtr", "asc"))).toEqual(["no-atr", "zero-atr", "good"]);
    });

    it("sorts status strings with locale comparison", () => {
        const rows: Row[] = [{ id: "open", status: "open" }, { id: "closed", status: "closed" }];

        expect(ids(sortJournalEntries(rows, "status", "asc"))).toEqual(["closed", "open"]);
        expect(ids(sortJournalEntries(rows, "status", "desc"))).toEqual(["open", "closed"]);
    });

    it("leaves the caller's array untouched", () => {
        const rows: Row[] = [{ id: "b", pnl: 2 }, { id: "a", pnl: 1 }];
        const snapshot = [...rows];

        sortJournalEntries(rows, "pnl", "asc");

        expect(ids(rows)).toEqual(["b", "a"]);
        expect(rows).toEqual(snapshot);
    });
});
