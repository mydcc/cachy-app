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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ChartWindow } from "./ChartWindow.svelte";
import { windowManager } from "../WindowManager.svelte";
import { settingsState } from "../../../stores/settings.svelte";

describe("ChartWindow.updateHeaderControls", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
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

    it("restores a non-default timeframe without scheduling a save", () => {
        const save = vi
            .spyOn(windowManager, "requestSessionSave")
            .mockImplementation(() => {});
        const win = new ChartWindow("BTCUSDT", { timeframe: "4h" });

        // Restore is not a user change: a save here would run while the
        // rehydrated window is not registered yet and could write a session
        // without it.
        expect(win.timeframe).toBe("4h");
        expect(
            win.headerControls.find((control) => control.label === "4h")?.active,
        ).toBe(true);
        expect(save).not.toHaveBeenCalled();
    });

    it("requests a session save only when the timeframe actually changes", () => {
        const save = vi
            .spyOn(windowManager, "requestSessionSave")
            .mockImplementation(() => {});
        const win = new ChartWindow("BTCUSDT");

        win.timeframe = "1h"; // the constructor default
        expect(save).not.toHaveBeenCalled();

        win.timeframe = "5m";
        win.timeframe = "5m"; // the same changed value is still a no-op
        expect(save).toHaveBeenCalledTimes(1);
    });
});

describe("ChartWindow title (FEAT-0378)", () => {
    const main = { id: "bu-1", name: "Main", exchange: "bitunix" as const, keys: { key: "k", secret: "s" } };
    const second = { id: "bu-2", name: "Second", exchange: "bitunix" as const, keys: { key: "k2", secret: "s2" } };

    beforeEach(() => {
        settingsState.accounts = [main, second];
        settingsState.activeAccountId = "bu-1";
        settingsState.apiProvider = "bitunix";
    });

    it("names the active account beside the symbol", () => {
        const win = new ChartWindow("BTCUSDT");

        expect(win.title).toBe("BTCUSDT · Main");
    });

    it("persists the bare symbol, not the decorated title", () => {
        const win = new ChartWindow("BTCUSDT");

        expect(win.serialize().title).toBe("BTCUSDT");
    });

    it("follows an account switch on an open window", () => {
        const win = new ChartWindow("BTCUSDT");

        settingsState.activeAccountId = "bu-2";

        expect(win.title).toBe("BTCUSDT · Second");
    });
});
