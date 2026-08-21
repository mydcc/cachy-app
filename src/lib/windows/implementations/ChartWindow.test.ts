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

import { describe, it, expect, beforeEach } from "vitest";
import { ChartWindow } from "./ChartWindow.svelte";
import { settingsState } from "../../../stores/settings.svelte";

describe("ChartWindow.updateHeaderControls", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("sorts timeframe buttons by interval size, not by favorites order", () => {
        settingsState.favoriteTimeframes = ["1d", "1m", "1h"];
        const win = new ChartWindow("BTCUSDT");

        const labels = win.headerControls.map((c) => c.label);
        expect(labels).toEqual(["1m", "1h", "1d", "▼"]);
    });

    it("sorts case-sensitively: 1M (month) after 1w (week)", () => {
        settingsState.favoriteTimeframes = ["1M", "1m", "1w"];
        const win = new ChartWindow("BTCUSDT");

        const labels = win.headerControls.map((c) => c.label);
        // Default active timeframe "1h" is included automatically.
        expect(labels).toEqual(["1m", "1h", "1w", "1M", "▼"]);
    });

    it("appends the active timeframe in sorted position even when not a favorite", () => {
        settingsState.favoriteTimeframes = ["5m", "1h"];
        const win = new ChartWindow("BTCUSDT");
        win.timeframe = "15m";
        win.updateHeaderControls();

        const labels = win.headerControls.map((c) => c.label);
        expect(labels).toEqual(["5m", "15m", "1h", "▼"]);
    });
});
