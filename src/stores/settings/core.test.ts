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
 * Inventory for the core sub-store (ADR-0024 decision 2, second group).
 *
 * 98 `PERSISTENCE_SCHEMA` rows carry `section: "core"`, but only 97 of
 * them are core-owned `$state`: `isPro` lives on the entitlement
 * collaborator. This test pins that subtraction from all three sides —
 * schema, store, facade — so a 99th core row without a home fails here by
 * name instead of as silent data loss.
 */

import { describe, expect, it } from "vitest";
import { SettingsManager } from "../settings.svelte";
import { PERSISTENCE_SCHEMA } from "./persistenceSchema";
import { CoreSettingsStore } from "./core.svelte";

/** Core schema rows owned by another object, not by a settings store. */
const HELD_ELSEWHERE = new Set(["isPro"]);

describe("core sub-store inventory", () => {
    it("holds exactly the core-owned schema keys", () => {
        const expected = PERSISTENCE_SCHEMA.filter(
            (field) => field.section === "core" && !HELD_ELSEWHERE.has(field.key),
        )
            .map((field) => field.key)
            .sort();
        expect(expected.length).toBeGreaterThan(0);
        expect(Object.keys(new CoreSettingsStore()).sort()).toEqual(expected);
    });

    it("exposes every held field through a delegating getter and setter", () => {
        const missing: string[] = [];
        const storeKeys = Object.keys(new CoreSettingsStore());
        for (const key of storeKeys) {
            const descriptor = Object.getOwnPropertyDescriptor(
                SettingsManager.prototype,
                key,
            );
            if (!descriptor?.get || !descriptor?.set) missing.push(key);
        }
        expect(
            missing,
            `these core fields have no delegating accessor — consumers ` +
                `would read a missing property instead of live state: ${missing.join(", ")}`,
        ).toEqual([]);
    });
});
