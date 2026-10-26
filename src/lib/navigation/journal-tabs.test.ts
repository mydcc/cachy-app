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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, expect, it } from "vitest";
import { ENTRY_POINTS } from "./entry-points";
import { resolveEntryIcon } from "./icons";
import { getJournalTabEntries, getJournalTabId } from "./journal-tabs";

describe("FEAT-0734: journal tab entries", () => {
    it("returns the five registry tabs in order", () => {
        const tabs = getJournalTabEntries();

        expect(tabs.map((entry) => entry.id)).toEqual([
            "journal.performance",
            "journal.quality",
            "journal.direction",
            "journal.discipline",
            "journal.costs",
        ]);
        expect(tabs.map(getJournalTabId)).toEqual([
            "performance",
            "quality",
            "direction",
            "discipline",
            "costs",
        ]);
    });

    it("resolves an icon for every journal tab", () => {
        for (const entry of getJournalTabEntries()) {
            expect(resolveEntryIcon(entry.icon), entry.id).not.toBe("");
        }
    });

    it("rejects an entry without a tab opener", () => {
        const settings = ENTRY_POINTS.find((entry) => entry.id === "settings")!;

        expect(() => getJournalTabId(settings)).toThrow(/no tab opener/);
    });
});
