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
 * BUG-0757 — the journal date filter must cover the full UTC day of the
 * selected end date, whatever zone the browser is in.
 *
 * `.timezone.test.ts` selects the `timezone` Vitest project (`pool: "forks"`).
 * That is not cosmetic: under `threads`, a runtime `process.env.TZ` assignment
 * never reaches Node's timezone machinery, so on a UTC runner the pre-fix
 * local-time code passes the same assertions as the fix. Each case asserts the
 * zone actually took effect, so a runner that ignores `TZ` fails loudly instead
 * of looking like a guard.
 *
 * The last case is a source check on the call site: the helper can be perfect
 * while `JournalContent` keeps its own mixed-domain arithmetic, and no unit
 * test of the helper would see that.
 */

import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import {
    isJournalDateInRange,
    journalDateRange,
} from "./journalDateRange";

const ORIGINAL_TZ = process.env.TZ;

function useZone(zone: string) {
    process.env.TZ = zone;
    // The guard on the guard: without this, a pool that ignores TZ runs every
    // case in UTC and the pre-fix code passes.
    expect(
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        `TZ=${zone} did not take effect in this runner`,
    ).toBe(zone);
}

afterEach(() => {
    if (ORIGINAL_TZ === undefined) {
        delete process.env.TZ;
    } else {
        process.env.TZ = ORIGINAL_TZ;
    }
});

describe("BUG-0757 — journal date bounds share one time domain", () => {
    it("starts and ends the selected day in UTC in every zone", () => {
        // Kiritimati is UTC+14, New York UTC-5/-4, Berlin UTC+1/+2: a local
        // end bound is off by up to a day in each direction.
        for (const zone of [
            "Europe/Berlin",
            "America/New_York",
            "Pacific/Kiritimati",
            "UTC",
        ]) {
            useZone(zone);

            const { startMs, endMs } = journalDateRange(
                "2026-01-01",
                "2026-01-01",
            );

            expect(startMs, zone).toBe(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
            expect(endMs, zone).toBe(Date.UTC(2026, 0, 1, 23, 59, 59, 999));
        }
    });

    it("keeps 23:30 UTC on the end day and drops 00:30 UTC the next day", () => {
        useZone("Europe/Berlin");

        const range = journalDateRange("2026-01-01", "2026-01-01");

        expect(
            isJournalDateInRange("2026-01-01T23:30:00.000Z", range),
            "the last UTC hours of the selected day",
        ).toBe(true);
        expect(isJournalDateInRange("2026-01-01T00:00:00.000Z", range)).toBe(
            true,
        );
        expect(
            isJournalDateInRange("2026-01-02T00:30:00.000Z", range),
        ).toBe(false);
    });

    it("uses independent bounds when only one field is filled", () => {
        useZone("Europe/Berlin");

        const startOnly = journalDateRange("2026-03-04", "");
        expect(startOnly.startMs).toBe(Date.UTC(2026, 2, 4));
        expect(startOnly.endMs).toBeNull();
        expect(isJournalDateInRange("2026-03-03T23:59:59.999Z", startOnly)).toBe(
            false,
        );

        const endOnly = journalDateRange("", "2026-03-04");
        expect(endOnly.startMs).toBeNull();
        expect(endOnly.endMs).toBe(Date.UTC(2026, 2, 4, 23, 59, 59, 999));
        expect(isJournalDateInRange("2026-03-05T00:00:00.000Z", endOnly)).toBe(
            false,
        );
    });

    it("treats empty, non-date and rolled-over values as no filter", () => {
        useZone("UTC");

        expect(journalDateRange("", "")).toEqual({ startMs: null, endMs: null });
        expect(journalDateRange("not-a-date", "2026-13-45")).toEqual({
            startMs: null,
            endMs: null,
        });
        // A date-time string parses in the local zone; accepting it would move
        // the bound to another UTC day.
        expect(journalDateRange("2026-01-01T00:30", "2026-01-01T23:30")).toEqual(
            { startMs: null, endMs: null },
        );
        // `Date` would roll this over to March 3rd, inventing a day.
        expect(journalDateRange("2026-02-31", "2026-02-31")).toEqual({
            startMs: null,
            endMs: null,
        });
    });

    it("keeps JournalContent on the helper instead of local-time bounds", () => {
        const source = readFileSync(
            "src/components/shared/JournalContent.svelte",
            "utf8",
        );

        expect(source).toContain("journalDateRange(");
        expect(source).toContain("isJournalDateInRange(");
        // The exact regression: a local `setHours` end bound next to a UTC
        // `Date.parse` start bound.
        expect(source).not.toMatch(/\bsetHours\s*\(/);
    });
});
