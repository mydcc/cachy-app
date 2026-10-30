/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * BUG-0757 — both journal date-filter bounds live in one time domain.
 *
 * `new Date("2026-01-01")` reads a date-only string as **UTC** midnight, so the
 * old local end-of-day (`setHours(23, 59, 59, 999)`) ended the range up to two
 * hours before the start's day did: in Europe/Berlin (CEST) the filter dropped
 * every trade logged between 22:00 and 24:00 UTC on the selected end day, in
 * CET the last hour. The bounds here are always UTC, and the accepted input
 * shape is explicit so a zone-less date-time can never sneak in and shift a
 * day.
 */
export interface JournalDateRange {
    /** Inclusive lower bound, or `null` when the start field is empty. */
    startMs: number | null;
    /** Inclusive upper bound, or `null` when the end field is empty. */
    endMs: number | null;
}

/** The `<input type="date">` value shape; anything else is not a journal bound. */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses `YYYY-MM-DD` as UTC midnight, or returns `null`.
 *
 * The round-trip check rejects date-only lookalikes that `Date` would roll
 * over (`2026-02-31` becomes March 3rd), and the regex rejects a date-time:
 * `new Date("2026-01-01T00:30")` is parsed in the *local* zone, which would
 * move the bound to a different UTC day before `setUTCHours` ever runs.
 */
function parseUtcDay(value: string): number | null {
    const match = DATE_ONLY.exec(value);
    if (!match) return null;

    const [, year, month, day] = match;
    const ms = Date.UTC(Number(year), Number(month) - 1, Number(day));

    // `Date.UTC` rolls impossible dates over; the filter must not invent one.
    const parsed = new Date(ms);
    if (
        parsed.getUTCFullYear() !== Number(year) ||
        parsed.getUTCMonth() !== Number(month) - 1 ||
        parsed.getUTCDate() !== Number(day)
    ) {
        return null;
    }
    return ms;
}

/** Start- and end-of-day bounds for the journal's date filter, both in UTC. */
export function journalDateRange(start: string, end: string): JournalDateRange {
    const startMs = parseUtcDay(start);
    const endMs = parseUtcDay(end);

    return {
        startMs,
        endMs:
            endMs === null
                ? null
                : endMs + 24 * 60 * 60 * 1000 - 1,
    };
}

/**
 * Whether a journal entry's ISO timestamp falls inside the filter.
 *
 * Kept next to the bounds so the comparison domain is not re-derived at the
 * call site: the bounds are UTC and `Date.parse` reads an ISO timestamp as UTC.
 * A date the timestamp parser cannot read is kept rather than hidden — the
 * filter is a view, and silently dropping a row is worse than showing one.
 */
export function isJournalDateInRange(
    date: string,
    range: JournalDateRange,
): boolean {
    const ms = Date.parse(date);
    if (Number.isNaN(ms)) return true;
    if (range.startMs !== null && ms < range.startMs) return false;
    if (range.endMs !== null && ms > range.endMs) return false;
    return true;
}
