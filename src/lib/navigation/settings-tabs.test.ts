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
import { getSettingsTabEntries, getSettingsTabId } from "./settings-tabs";

describe("FEAT-0735: settings tab entries", () => {
    it("returns the eight registry tabs in order", () => {
        const tabs = getSettingsTabEntries();

        expect(tabs.map((entry) => entry.id)).toEqual([
            "settings.trading",
            "settings.automation",
            "settings.chart",
            "settings.visuals",
            "settings.ai",
            "settings.connections",
            "settings.system",
            "settings.cloud",
        ]);
        expect(tabs.map(getSettingsTabId)).toEqual([
            "trading",
            "automation",
            "chart",
            "visuals",
            "ai",
            "connections",
            "system",
            "cloud",
        ]);
    });

    it("resolves an icon for every settings tab", () => {
        for (const entry of getSettingsTabEntries()) {
            expect(resolveEntryIcon(entry.icon), entry.id).not.toBe("");
        }
    });

    it("rejects an entry without a tab opener", () => {
        const journal = ENTRY_POINTS.find((entry) => entry.id === "journal")!;

        expect(() => getSettingsTabId(journal)).toThrow(/no tab opener/);
    });
});
