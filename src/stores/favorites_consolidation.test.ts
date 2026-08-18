// @vitest-environment jsdom
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

/**
 * BUG-0232: favourites lived in two stores that never agreed.
 *
 * `favoritesState` owned `cachy_favorites` (cap 4) and drove the analyst;
 * `settingsState.favoriteSymbols` owned `cachy_settings` (cap 12) and drove the
 * symbol picker and the Market Dashboard. Adding a favourite in Settings did
 * not change what got analysed, and the dashboard listed rows that could never
 * receive a score.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { CONSTANTS } from "../lib/constants";

vi.mock("$app/environment", () => ({ browser: true }));

async function loadStores() {
    vi.resetModules();
    const [{ favoritesState }, { settingsState, MAX_FAVORITE_SYMBOLS }] = await Promise.all([
        import("./favorites.svelte"),
        import("./settings.svelte"),
    ]);
    return { favoritesState, settingsState, MAX_FAVORITE_SYMBOLS };
}

describe("favourites consolidation (BUG-0232)", () => {
    beforeEach(() => localStorage.clear());

    it("reads through to the settings list", async () => {
        const { favoritesState, settingsState } = await loadStores();

        settingsState.favoriteSymbols = ["BTCUSDT", "XRPUSDT", "ADAUSDT"];

        expect(favoritesState.items).toEqual(["BTCUSDT", "XRPUSDT", "ADAUSDT"]);
    });

    it("writes through to the settings list", async () => {
        const { favoritesState, settingsState } = await loadStores();

        settingsState.favoriteSymbols = [];
        favoritesState.toggleFavorite("bnbusdt");

        // The symbol picker and the dashboard both read this field, so a star
        // clicked on a market tile has to land here or it changes nothing.
        expect(settingsState.favoriteSymbols).toContain("BNBUSDT");
    });

    it("allows more than the old four-symbol cap", async () => {
        const { favoritesState, settingsState } = await loadStores();

        settingsState.favoriteSymbols = [];
        for (const sym of ["BTC", "ETH", "SOL", "LINK", "XRP", "ADA"]) {
            favoritesState.toggleFavorite(`${sym}USDT`);
        }

        // Under the old MAX_FAVORITES = 4 the last two were silently dropped.
        expect(favoritesState.items).toHaveLength(6);
        expect(favoritesState.items).toContain("ADAUSDT");
    });

    it("still enforces the shared upper bound", async () => {
        const { favoritesState, settingsState, MAX_FAVORITE_SYMBOLS } = await loadStores();

        settingsState.favoriteSymbols = [];
        for (let i = 0; i < MAX_FAVORITE_SYMBOLS + 5; i++) {
            favoritesState.toggleFavorite(`SYM${i}USDT`);
        }

        expect(favoritesState.items).toHaveLength(MAX_FAVORITE_SYMBOLS);
    });

    it("unions a legacy list into an edited settings list, losing nothing", async () => {
        localStorage.setItem("cachy_favorites", JSON.stringify(["LTCUSDT", "AVAXUSDT"]));
        localStorage.setItem(
            CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY,
            JSON.stringify({ favoriteSymbols: ["BTCUSDT"] }),
        );

        const { favoritesState } = await loadStores();

        // Both lists were curated; which was edited last is not recoverable, so
        // neither may overwrite the other.
        expect(favoritesState.items).toContain("BTCUSDT");
        expect(favoritesState.items).toContain("LTCUSDT");
        expect(favoritesState.items).toContain("AVAXUSDT");
    });

    it("replaces untouched factory defaults rather than merging into them", async () => {
        // No settings written at all -- favoriteSymbols is still the shipped
        // default. That is a placeholder, not a choice, so merging would hand
        // the user four symbols they never picked.
        localStorage.setItem("cachy_favorites", JSON.stringify(["LTCUSDT", "AVAXUSDT"]));

        const { favoritesState } = await loadStores();

        expect(favoritesState.items).toEqual(["LTCUSDT", "AVAXUSDT"]);
    });

    it("does not re-run the migration on a later start", async () => {
        localStorage.setItem("cachy_favorites", JSON.stringify(["LTCUSDT"]));

        const first = await loadStores();
        first.favoritesState.toggleFavorite("LTCUSDT"); // user removes it again
        expect(first.favoritesState.items).not.toContain("LTCUSDT");

        const second = await loadStores();
        // A migration that ran again would resurrect a symbol the user deleted.
        expect(second.favoritesState.items).not.toContain("LTCUSDT");
    });

    it("leaves the legacy key in place rather than deleting user data", async () => {
        localStorage.setItem("cachy_favorites", JSON.stringify(["LTCUSDT"]));
        await loadStores();

        expect(localStorage.getItem("cachy_favorites")).not.toBeNull();
    });
});
