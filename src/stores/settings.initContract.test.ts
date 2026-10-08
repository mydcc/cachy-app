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

import { describe, it, expect } from "vitest";
import { defaultSettings, SettingsManager } from "./settings.svelte";

/**
 * Runtime companion to the textual init pin in
 * `settings/persistenceSchema.test.ts` ("clones every object-valued default
 * at init"). Deliberately without the browser/crypto mocks the other
 * manager tests use: with no storage backend the constructor takes its
 * early-return path, so live state keeps exactly what the field
 * initializers handed it — which is precisely what this test observes.
 * A stored blob would replace every field via `load()` and the inits
 * would go untested.
 */
describe("settings init aliasing (BUG-0658)", () => {
  it("keeps defaultSettings pristine through every object-valued init", () => {
    // Arrange — snapshot before construction, so a constructor that itself
    // wrote through an alias would already fail here.
    const snapshot = structuredClone(defaultSettings);
    const fresh = new SettingsManager();

    // Act — every object-valued init, mutated in place the way the UI does.
    fresh.galaxySettings.camPos.x = 999;
    fresh.galaxySettings.galaxyRot.y = 999;
    fresh.fireConfig.speed = 999;
    fresh.logSettings.technicals = !fresh.logSettings.technicals;
    fresh.customHotkeys["probe"] = "x";
    fresh.discordChannels.push("probe");
    fresh.rssPresets.push("probe");
    fresh.customRssFeeds.push("probe");
    fresh.favoriteTimeframes.push("probe");
    fresh.favoriteSymbols.push("probe");
    fresh.userProviders.push({ id: "probe" } as never);
    fresh.accounts.push({ id: "probe" } as never);

    // Assert — none of it reached the shipped defaults.
    expect(defaultSettings).toEqual(snapshot);
  });
});
