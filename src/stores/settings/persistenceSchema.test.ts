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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { VENUE_DEFAULT_FEE_RATES } from "../../lib/constants";
import { defaultSettings, SETTINGS_KEYS } from "../settings.svelte";
import {
    LOAD_BODY_KEYS,
    LOAD_SECRET_KEYS,
    loadCustomValue,
    loadSchemaEntries,
    mergeBurnChannels,
    mergeFeeRates,
    mergeGalaxySettings,
    mergeTradeFlowSettings,
    normalizeStoredPriceScaleMode,
    PERSISTENCE_SCHEMA,
    saveCustomValue,
    type LoadTarget,
    type SaveSource,
} from "./persistenceSchema";
import type { Settings } from "./settingsTypes";

/**
 * Storage/encryption keys `toJSON()` emits that are not user settings.
 * Mirrors `NOT_A_SETTING` in `settings.persistenceContract.test.ts` — the
 * save schema must cover exactly `SETTINGS_KEYS` plus these five.
 */
const NOT_A_SETTING = [
    "credentialSchemaVersion",
    "encryptedAccountKeys",
    "encryptedSecrets",
    "encryptedProviderConfigs",
    "isEncrypted",
];

function saveSource(overrides: Partial<Record<string, unknown>> = {}): SaveSource {
    return {
        read: ((key: string) => overrides[key]) as SaveSource["read"],
        snapshot: <T>(value: T): T => value,
        entitlement: { isPro: false, isProLicenseActive: false },
    };
}

function loadTarget(): LoadTarget & { values: Record<string, unknown> } {
    const values: Record<string, unknown> = {};
    return {
        values,
        set: (key: string, value: unknown) => {
            values[key] = value;
        },
        entitlement: { isPro: false, isProLicenseActive: false },
    };
}

describe("persistence schema exactness", () => {
    it("cannot be mutated at runtime, so one key table really is the source", () => {
        // `readonly` is compile-time only. Both directions of the round trip
        // iterate this array, so a push at runtime would silently split it in
        // two — the exact failure the schema table exists to prevent.
        expect(() => {
            (PERSISTENCE_SCHEMA as unknown as unknown[]).push({
                key: "smuggled",
                save: "direct",
                load: "coalesce",
                section: "core",
            });
        }).toThrow(TypeError);
        expect(Object.isFrozen(PERSISTENCE_SCHEMA)).toBe(true);
        expect(Object.isFrozen(PERSISTENCE_SCHEMA[0])).toBe(true);
        // Every row, not just the first: a partial freeze (all but one row)
        // would pass the assertions above while leaving a writable hole.
        expect(PERSISTENCE_SCHEMA.every(Object.isFrozen)).toBe(true);
        // The sibling key tables live under the same threat model (a runtime
        // push silently splitting a contract), so they carry the same lock.
        expect(Object.isFrozen(LOAD_BODY_KEYS)).toBe(true);
        expect(Object.isFrozen(LOAD_SECRET_KEYS)).toBe(true);
        expect(PERSISTENCE_SCHEMA.map((f) => f.key)).not.toContain("smuggled");
    });

    it("covers every declared setting on save, plus the five storage keys", () => {
        // Arrange
        const saveKeys = PERSISTENCE_SCHEMA.map((field) => field.key).sort();
        const expected = [...SETTINGS_KEYS, ...NOT_A_SETTING].sort();

        // Assert — a row missing here is silent data loss on the next save.
        expect(saveKeys).toEqual(expected);
    });

    it("covers every declared setting on load except the three load() owns", () => {
        // Arrange
        const loadKeys = PERSISTENCE_SCHEMA.filter((field) => field.load !== null)
            .map((field) => field.key)
            .sort();
        const expected = SETTINGS_KEYS.filter(
            (key) => !(LOAD_BODY_KEYS as readonly string[]).includes(key),
        ).sort();

        // Assert — a row missing here reverts the user's change on reload.
        expect(loadKeys).toEqual(expected);
    });

    it("lists each key once, with a section for every load entry", () => {
        // Arrange
        const keys = PERSISTENCE_SCHEMA.map((field) => field.key);

        // Assert
        expect(new Set(keys).size).toBe(keys.length);
        for (const field of PERSISTENCE_SCHEMA) {
            if (field.load !== null) {
                expect(field.section).toMatch(/^(core|display)$/);
            }
        }
    });

    it("clones every object-valued default at init instead of aliasing it", () => {
        // Arrange — scalars cannot alias, so only object (and array) keys
        // can hand live state a reference into `defaultSettings`.
        const objectKeys = (Object.keys(defaultSettings) as (keyof Settings)[]).filter(
            (key) => {
                const value: unknown = defaultSettings[key];
                return typeof value === "object" && value !== null;
            },
        );
        const source = readFileSync(
            fileURLToPath(new URL("../settings.svelte.ts", import.meta.url)),
            "utf8",
        );

        // Assert — every object-valued init wraps the default in
        // structuredClone. A new object setting without the clone fails
        // here before its first in-place edit can rewrite the default.
        expect(objectKeys.length).toBeGreaterThan(0);
        for (const key of objectKeys) {
            const init =
                source.match(new RegExp(`\\b${key} = \\$state[^;]*;`))?.[0] ?? "";
            expect(
                init,
                `${key} init hands live state the live default object — wrap it in structuredClone`,
            ).toMatch(/structuredClone/);
        }
    });

    it("routes core and display entries to their apply driver", () => {
        // Assert — the drivers iterate these lists; a row on no list runs nowhere.
        expect(loadSchemaEntries("core").length).toBeGreaterThan(0);
        expect(loadSchemaEntries("display").length).toBeGreaterThan(0);
        const routed = new Set([
            ...loadSchemaEntries("core"),
            ...loadSchemaEntries("display"),
        ]);
        const expected = new Set(
            PERSISTENCE_SCHEMA.filter((field) => field.load !== null),
        );
        expect(routed).toEqual(expected);
    });

    it("inventories every or-mode key, so a new one cannot silently alias the default", () => {
        // Arrange — `stored || defaults[key]` hands an object-valued key the
        // live default on a storage miss. Scalars cannot alias, so only the
        // object keys need an owner; but every or-key at all is an explicit
        // decision recorded here, or the next "fix" diverges save from load.
        const orKeys = PERSISTENCE_SCHEMA.filter((field) => field.load === "or").map(
            (field) => field.key,
        );
        const objectOrKeys = orKeys
            .filter((key) => {
                const value: unknown = defaultSettings[key];
                return typeof value === "object" && value !== null;
            })
            .sort();

        // Assert
        expect(objectOrKeys).toEqual([
            "customRssFeeds",
            "discordChannels",
            "logSettings",
            "rssPresets",
        ]);
        expect([...orKeys].sort()).toEqual([
            "ambientToplineIntensity",
            "ambientToplineMode",
            "cryptoPanicFilter",
            "cryptoPanicPlan",
            "customRssFeeds",
            "discordChannels",
            "fontFamily",
            "heatmapMode",
            "logSettings",
            "newsOpenBehavior",
            "ollamaBaseUrl",
            "repairTimeframe",
            "rssPresets",
        ]);
    });

    it("has a working custom saver and loader for every custom row", () => {
        // Arrange
        const target = loadTarget();
        const merged = { burnChannels: true } as Settings;
        const defaults = {
            burnChannels: false,
            galaxySettings: {},
            tradeFlowSettings: { galaxyFlow: {} },
            fireConfig: {},
        } as unknown as Settings;
        const store: Record<string, unknown> = { accounts: [], userProviders: [] };

        // Act + Assert — every custom row dispatches without throwing.
        for (const field of PERSISTENCE_SCHEMA) {
            if (field.save === "custom") {
                expect(() =>
                    saveCustomValue(field.key, saveSource(store)),
                ).not.toThrow();
            }
            if (field.load === "custom") {
                expect(() =>
                    loadCustomValue(field.key, target, merged, defaults, undefined),
                ).not.toThrow();
            }
        }
    });
});

describe("persistence schema mergers", () => {
    it("merges fee rates per venue without sharing the module defaults", () => {
        // Arrange — storage predating FEAT-0253 has no feeRates at all.

        // Act
        const merged = mergeFeeRates({ bitunix: { maker: "0.01", taker: "0.02" } } as Settings["feeRates"]);

        // Assert
        expect(merged.bitunix).toEqual({ maker: "0.01", taker: "0.02" });
        expect(merged.bitget).toEqual(VENUE_DEFAULT_FEE_RATES.bitget);
        expect(merged.bitunix).not.toBe(VENUE_DEFAULT_FEE_RATES.bitunix);
        expect(mergeFeeRates(undefined).bitunix).toEqual(VENUE_DEFAULT_FEE_RATES.bitunix);
    });

    it("deep-merges trade-flow settings so sliders cannot reach the defaults", () => {
        // Arrange
        const defaults = {
            speed: 1,
            galaxyFlow: { spin: 2 },
        } as unknown as Settings["tradeFlowSettings"];

        // Act
        const merged = mergeTradeFlowSettings({ speed: 9 } as Partial<Settings["tradeFlowSettings"]>, defaults);

        // Assert
        expect(merged.speed).toBe(9);
        expect(merged.galaxyFlow).toEqual({ spin: 2 });
        merged.galaxyFlow.spin = 99;
        expect(defaults.galaxyFlow.spin).toBe(2);
    });

    it("merges galaxy settings over the defaults", () => {
        // Arrange
        const defaults = { branches: 3, spin: 1 } as unknown as Settings["galaxySettings"];

        // Act + Assert
        expect(mergeGalaxySettings({ branches: 9 } as Partial<Settings["galaxySettings"]>, defaults)).toEqual({
            branches: 9,
            spin: 1,
        });
    });

    it("deep-copies galaxy settings so camera moves cannot reach the defaults", () => {
        // Arrange — a storage miss leaves the nested default objects in place.
        const defaults = {
            branches: 3,
            camPos: { x: 0, y: 2, z: 5 },
            galaxyRot: { x: 0, y: 0, z: 0 },
        } as unknown as Settings["galaxySettings"];

        // Act
        const merged = mergeGalaxySettings(undefined, defaults);
        merged.camPos.x = 999;
        merged.galaxyRot.y = 999;

        // Assert
        expect(merged.camPos).not.toBe(defaults.camPos);
        expect(defaults.camPos.x).toBe(0);
        expect(defaults.galaxyRot.y).toBe(0);
    });

    it("deep-copies galaxy settings on the stored path too, not just the miss", () => {
        // Arrange — the clone wraps the merged result, so a stored blob with
        // its own nested objects is detached the same way. A regression that
        // cloned only the miss path (`stored ? {...} : structuredClone(...)`)
        // would keep this green while reintroducing the alias on every load.
        const defaults = {
            branches: 3,
            camPos: { x: 0, y: 2, z: 5 },
            galaxyRot: { x: 0, y: 0, z: 0 },
        } as unknown as Settings["galaxySettings"];
        const stored = {
            branches: 9,
            camPos: { x: 1, y: 1, z: 1 },
        } as unknown as Partial<Settings["galaxySettings"]>;

        // Act
        const merged = mergeGalaxySettings(stored, defaults);
        merged.camPos.x = 999;

        // Assert
        expect(merged.branches).toBe(9);
        expect(merged.camPos).not.toBe(stored.camPos);
        expect(merged.camPos).not.toBe(defaults.camPos);
        expect(stored.camPos.x).toBe(1);
        expect(defaults.camPos.x).toBe(0);
    });

    it("folds legacy price-scale modes back to the default", () => {
        // Assert
        expect(normalizeStoredPriceScaleMode("linear", "log")).toBe("linear");
        expect(normalizeStoredPriceScaleMode("log", "linear")).toBe("log");
        expect(normalizeStoredPriceScaleMode("percentage", "log")).toBe("log");
        expect(normalizeStoredPriceScaleMode(undefined, "log")).toBe("log");
    });

    it("prefers legacy burn-channel keys over the merged value", () => {
        // Arrange
        const merged = { burnChannels: false } as Partial<Settings>;

        // Act + Assert
        expect(mergeBurnChannels(merged, { burnChannels: true }, false)).toBe(true);
        expect(mergeBurnChannels(merged, { burnChannelWindows: true }, false)).toBe(true);
        expect(mergeBurnChannels(merged, { burnNewsWindows: true }, false)).toBe(true);
        // A stored value wins over the fallback; absence falls back.
        expect(mergeBurnChannels(merged, undefined, true)).toBe(false);
        expect(mergeBurnChannels({ burnChannels: true }, undefined, false)).toBe(true);
        expect(mergeBurnChannels({ burnChannels: undefined }, undefined, true)).toBe(true);
    });

    it("caps favorites through the custom loader", () => {
        // Arrange
        const target = loadTarget();
        const merged = {
            favoriteSymbols: Array.from({ length: 20 }, (_, i) => `SYM${i}`),
        } as unknown as Settings;
        const defaults = { favoriteSymbols: [] } as unknown as Settings;

        // Act
        loadCustomValue("favoriteSymbols", target, merged, defaults, undefined);

        // Assert
        expect((target.values["favoriteSymbols"] as string[]).length).toBeLessThanOrEqual(12);
    });
});
