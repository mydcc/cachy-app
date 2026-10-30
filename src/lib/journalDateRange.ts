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
 * old local end-of-day (`setHours(23, 59, 59, 999)`) ended the range hours away
 * from the start in any zone with an offset. In Europe/Berlin that dropped
 * every trade logged between 22:00 and 24:00 UTC on the selected end day.
 *
 * An empty or unparseable field is "no filter", not a `NaN` bound: every
 * comparison against `NaN` is false, so a corrupt value would silently pass
 * everything instead of failing visibly.
 */
export interface JournalDateRange {
    /** Inclusive lower bound, or `null` when the start field is empty. */
    startMs: number | null;
    /** Inclusive upper bound, or `null` when the end field is empty. */
    endMs: number | null;
}

function utcBound(
    value: string,
    hour: number,
    minute: number,
    second: number,
    ms: number,
): number | null {
    if (value === "") return null;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    date.setUTCHours(hour, minute, second, ms);
    return date.getTime();
}

/** Start- and end-of-day bounds for the journal's date filter, both in UTC. */
export function journalDateRange(start: string, end: string): JournalDateRange {
    return {
        startMs: utcBound(start, 0, 0, 0, 0),
        endMs: utcBound(end, 23, 59, 59, 999),
    };
}
