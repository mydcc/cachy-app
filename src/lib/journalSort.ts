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

/**
 * Journal row sorting.
 *
 * Both helpers use a Schwartzian transform: the sort key is computed once per
 * row up front instead of twice per comparison. They are plain functions in
 * their own module so the ordering contracts they encode — null placement,
 * date-key parsing, the `slAtr` ratio — are reachable from unit tests instead
 * of only through a mounted table.
 *
 * Neither helper mutates the array it is given, and neither reorders rows with
 * equal keys relative to each other: `Array.prototype.sort` is stable, and the
 * decorated array preserves input order before sorting.
 */

import Decimal from "decimal.js";

type SortableValue = string | number | Decimal | undefined | null;
type RawRow = Record<string, SortableValue>;
export type SortDirection = "asc" | "desc";

function toRaw(row: unknown): RawRow {
    return row as unknown as RawRow;
}

function parseDateish(value: SortableValue): number {
    // `date`/`entryDate`/`exitDate` are always ISO-8601 strings in practice, but
    // a hand-edited or externally-written localStorage blob can hold a number
    // instead, and `new Date(number)` treats it as epoch milliseconds.
    return typeof value === "string" ? Date.parse(value) : (value as number);
}

/**
 * Sorts journal rows for `JournalContent`, including the `duration` derived
 * column (milliseconds between entry and exit, floored at 0).
 *
 * Missing values sort as `""` for the textual columns `symbol` and `status`,
 * and as `-Infinity` everywhere else, which places them first when ascending
 * and last when descending.
 */
export function sortJournalRows<T>(rows: T[], field: string, direction: SortDirection): T[] {
    return rows
        .map(row => {
            const raw = toRaw(row);
            let val = raw[field];

            if (field === "duration") {
                const startValue = raw.entryDate || raw.date;
                const endValue = raw.exitDate || raw.date;
                const start = parseDateish(startValue);
                const end = parseDateish(endValue);
                val = isNaN(start) || isNaN(end) ? 0 : Math.max(0, end - start);
            } else {
                if (val instanceof Decimal) val = val.toNumber();
                if (val === undefined || val === null) {
                    val = field === "symbol" || field === "status" ? "" : -Infinity;
                }
                // Parsed per value rather than under a shared guard: an entry
                // without `exitDate` used to suppress the conversion on BOTH
                // sides, so the neighbour's ISO string was compared as a string
                // against a millisecond number and the two compared equal.
                if ((field === "date" || field === "exitDate") && typeof val === "string") {
                    val = Date.parse(val);
                }
            }

            return { row, val };
        })
        .sort((a, b) => {
            const valA = a.val;
            const valB = b.val;

            if (typeof valA === "string" && typeof valB === "string") {
                return direction === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }

            if ((valA as number) < (valB as number)) return direction === "asc" ? -1 : 1;
            if ((valA as number) > (valB as number)) return direction === "asc" ? 1 : -1;
            return 0;
        })
        .map(entry => entry.row);
}

/** Inputs the `slAtr` column needs, all optional because the column degrades. */
interface SlAtrInput {
    entryPrice?: Decimal.Value | null;
    stopLossPrice?: Decimal.Value | null;
    atrValue?: Decimal.Value | null;
}

/**
 * Sorts journal entries for `JournalTable`, including the computed `slAtr`
 * column: |entryPrice - stopLossPrice| / atrValue, or -1 when the ratio is
 * undefined (missing inputs, or a zero ATR) so incomplete rows sort first.
 *
 * Rows missing the sort field always sort to the bottom, in both directions.
 * That is the long-standing table convention; making it direction-dependent
 * would surface blank rows above real ones as soon as a descending sort ran.
 */
export function sortJournalEntries<T extends SlAtrInput>(
    entries: T[],
    field: string,
    direction: SortDirection,
): T[] {
    return entries
        .map(entry => {
            const raw = toRaw(entry);
            let val: SortableValue = raw[field];

            if (field === "slAtr") {
                if (!entry.entryPrice || !entry.stopLossPrice || !entry.atrValue) {
                    val = -1;
                } else {
                    const entryPrice = new Decimal(entry.entryPrice);
                    const stopLoss = new Decimal(entry.stopLossPrice);
                    const atr = new Decimal(entry.atrValue);
                    val = atr.isZero() ? -1 : entryPrice.minus(stopLoss).abs().div(atr).toNumber();
                }
            } else if (val instanceof Decimal) {
                val = val.toNumber();
            }

            return { entry, val };
        })
        .sort((a, b) => {
            const valA = a.val;
            const valB = b.val;

            if (valA == null && valB == null) return 0;
            if (valA == null) return 1;
            if (valB == null) return -1;

            let comparison: number;
            if (typeof valA === "string" && typeof valB === "string") {
                comparison = valA.localeCompare(valB);
            } else {
                comparison =
                    (valA as number) < (valB as number)
                        ? -1
                        : (valA as number) > (valB as number)
                          ? 1
                          : 0;
            }

            return direction === "asc" ? comparison : -comparison;
        })
        .map(entry => entry.entry);
}
