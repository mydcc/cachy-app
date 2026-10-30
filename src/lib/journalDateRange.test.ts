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
 * CI runs in UTC, where the old local `setHours(23, 59, 59, 999)` produced the
 * same instant as the fix and the test could not see the bug. Node honours a
 * runtime `process.env.TZ` change on this platform, so each case sets the zone
 * it needs instead of depending on the machine's.
 */

import { afterAll, describe, expect, it } from "vitest";

import { journalDateRange } from "./journalDateRange";

const ORIGINAL_TZ = process.env.TZ;

afterAll(() => {
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
            process.env.TZ = zone;

            const { startMs, endMs } = journalDateRange(
                "2026-01-01",
                "2026-01-01",
            );

            expect(startMs, zone).toBe(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
            expect(endMs, zone).toBe(Date.UTC(2026, 0, 1, 23, 59, 59, 999));
        }
    });

    it("keeps a trade logged at 23:30 UTC on the end day inside the range", () => {
        process.env.TZ = "Europe/Berlin";

        const { startMs, endMs } = journalDateRange("2026-01-01", "2026-01-01");
        const lateTrade = Date.parse("2026-01-01T23:30:00Z");

        expect(lateTrade).toBeGreaterThanOrEqual(startMs!);
        expect(lateTrade).toBeLessThanOrEqual(endMs!);
    });

    it("uses independent bounds when only one field is filled", () => {
        const startOnly = journalDateRange("2026-03-04", "");
        expect(startOnly.startMs).toBe(Date.UTC(2026, 2, 4));
        expect(startOnly.endMs).toBeNull();

        const endOnly = journalDateRange("", "2026-03-04");
        expect(endOnly.startMs).toBeNull();
        expect(endOnly.endMs).toBe(Date.UTC(2026, 2, 4, 23, 59, 59, 999));
    });

    it("treats empty and unparseable fields as no filter", () => {
        expect(journalDateRange("", "")).toEqual({ startMs: null, endMs: null });
        expect(journalDateRange("not-a-date", "2026-13-45")).toEqual({
            startMs: null,
            endMs: null,
        });
    });
});
