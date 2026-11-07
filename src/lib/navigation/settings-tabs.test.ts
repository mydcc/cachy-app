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
import {
    getSettingsTabEntries,
    getSettingsTabId,
    resolveSettingsTabId,
} from "./settings-tabs";

describe("FEAT-0735: settings tab entries", () => {
    it("returns the seven registry tabs in order", () => {
        const tabs = getSettingsTabEntries();

        expect(tabs.map((entry) => entry.id)).toEqual([
            "settings.trading",
            "settings.chart",
            "settings.visuals",
            "settings.ai",
            "settings.connections",
            "settings.system",
            "settings.cloud",
        ]);
        expect(tabs.map(getSettingsTabId)).toEqual([
            "trading",
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

describe("FEAT-0821: resolveSettingsTabId", () => {
    /** The real rail, so the cases follow the registry instead of a fixture. */
    const ids = getSettingsTabEntries().map(getSettingsTabId);

    it("keeps a requested tab that is still registered", () => {
        expect(resolveSettingsTabId(ids[1], ids)).toBe(ids[1]);
    });

    it("falls back to the first tab when the remembered id no longer exists", () => {
        // The window keeps its current tab in session state. `automation` was
        // removed by FEAT-0821, and a window still on it must render a panel.
        expect(ids).not.toContain("automation");
        expect(resolveSettingsTabId("automation", ids)).toBe(ids[0]);
    });

    it("fails loudly when the rail has no tabs at all", () => {
        expect(() => resolveSettingsTabId("trading", [])).toThrow(/no tabs/);
    });
});
