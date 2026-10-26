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

import { describe, expect, it } from "vitest";
import {
    getWindowSwitcherEntries,
    isSwitchableWindow,
} from "./windowSwitcher";

describe("getWindowSwitcherEntries", () => {
    it("orders the windows most recently focused first", () => {
        const entries = getWindowSwitcherEntries([
            { id: "a", windowType: "window", zIndex: 0, lastFocusOrder: 10 },
            { id: "b", windowType: "chart", zIndex: 0, lastFocusOrder: 30 },
            { id: "c", windowType: "settings", zIndex: 0, lastFocusOrder: 20 },
        ]);

        expect(entries.map((entry) => entry.id)).toEqual(["b", "c", "a"]);
    });

    it("does not let the keep-above z-band override recency", () => {
        const entries = getWindowSwitcherEntries([
            {
                id: "keep-above",
                windowType: "chart",
                zIndex: 1_025_000,
                lastFocusOrder: 10,
            },
            {
                id: "recent",
                windowType: "window",
                zIndex: 11_000,
                lastFocusOrder: 20,
            },
        ]);

        expect(entries.map((entry) => entry.id)).toEqual([
            "recent",
            "keep-above",
        ]);
    });

    it("excludes modal and dialog windows", () => {
        const entries = getWindowSwitcherEntries([
            { id: "normal", windowType: "window", zIndex: 0, lastFocusOrder: 10 },
            { id: "modal", windowType: "modal", zIndex: 0, lastFocusOrder: 99 },
            { id: "dialog", windowType: "dialog", zIndex: 0, lastFocusOrder: 98 },
            { id: "chart", windowType: "chart", zIndex: 0, lastFocusOrder: 20 },
        ]);

        expect(entries.map((entry) => entry.id)).toEqual(["chart", "normal"]);
    });

    it("does not mutate the caller's array", () => {
        const windows = [
            { id: "a", windowType: "window", zIndex: 0, lastFocusOrder: 10 },
            { id: "b", windowType: "window", zIndex: 0, lastFocusOrder: 20 },
        ];
        const original = [...windows];

        getWindowSwitcherEntries(windows);

        expect(windows).toEqual(original);
    });
});

describe("isSwitchableWindow", () => {
    it("rejects only the blocking window types", () => {
        expect(isSwitchableWindow({ windowType: "window" })).toBe(true);
        expect(isSwitchableWindow({ windowType: "modal" })).toBe(false);
        expect(isSwitchableWindow({ windowType: "dialog" })).toBe(false);
    });
});
