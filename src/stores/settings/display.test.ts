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
 *
 * Inventory for the display sub-store (ADR-0024 decision 2).
 *
 * 66 `PERSISTENCE_SCHEMA` rows carry `section: "display"`, but only 65 of
 * them are display-owned `$state`: `isProLicenseActive` lives on the
 * entitlement collaborator. This test pins that subtraction from all three
 * sides — schema, store, facade — so a 67th display row without a home
 * fails here by name instead of as silent data loss. The reactivity
 * contract would catch the omission too, but only as an inert field,
 * never naming the missing home.
 */

import { describe, expect, it } from "vitest";
import { SettingsManager } from "../settings.svelte";
import { PERSISTENCE_SCHEMA } from "./persistenceSchema";
import { DisplaySettingsStore } from "./display.svelte";

/** Display schema rows owned by another object, not by a settings store. */
const HELD_ELSEWHERE = new Set(["isProLicenseActive"]);

describe("display sub-store inventory", () => {
    it("holds exactly the display-owned schema keys", () => {
        const expected = PERSISTENCE_SCHEMA.filter(
            (field) => field.section === "display" && !HELD_ELSEWHERE.has(field.key),
        )
            .map((field) => field.key)
            .sort();
        expect(expected.length).toBeGreaterThan(0);
        expect(Object.keys(new DisplaySettingsStore()).sort()).toEqual(expected);
    });

    it("exposes every held field through a delegating getter and setter", () => {
        const missing: string[] = [];
        const storeKeys = Object.keys(new DisplaySettingsStore());
        for (const key of storeKeys) {
            const descriptor = Object.getOwnPropertyDescriptor(
                SettingsManager.prototype,
                key,
            );
            if (!descriptor?.get || !descriptor?.set) missing.push(key);
        }
        expect(
            missing,
            `these display fields have no delegating accessor — consumers ` +
                `would read a missing property instead of live state: ${missing.join(", ")}`,
        ).toEqual([]);
    });
});
