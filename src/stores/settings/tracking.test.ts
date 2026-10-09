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
 * Contract for the declared autosave tracking (ADR-0024 decision 1).
 */

import { describe, expect, it, vi } from "vitest";
import { PERSISTENCE_SCHEMA, type SaveSource } from "./persistenceSchema";
import { trackAutosaveReads } from "./tracking";

function saveSource(read: (key: string) => unknown): SaveSource {
    return {
        read: read as SaveSource["read"],
        snapshot: <T>(value: T): T => value,
        entitlement: { isPro: false, isProLicenseActive: false },
    };
}

/**
 * Every custom saver consumes its read: the account/provider redactors map
 * over arrays, the blob savers snapshot truthy values. `[]` satisfies all
 * of them, so the tracking pass can run without a live store.
 */
const stubSource = (seen?: Set<string>): SaveSource =>
    saveSource((key) => {
        seen?.add(key);
        return [];
    });

describe("declared autosave tracking", () => {
    it("reads every schema field, so the effect subscribes to all of them", () => {
        const seen = new Set<string>();
        trackAutosaveReads(stubSource(seen));
        // Three schema rows never read through the manager: the credential
        // version is a constant and both Pro flags live on the entitlement
        // collaborator (read via `source.entitlement`, exactly as `toJSON()`
        // does). Everything else must be read — a fourth silent skip is the
        // failure, so the exception set is pinned, not open-ended.
        const NOT_MANAGER_READ = new Set([
            "credentialSchemaVersion",
            "isPro",
            "isProLicenseActive",
        ]);
        const expected = PERSISTENCE_SCHEMA.map((f) => f.key)
            .filter((key) => !NOT_MANAGER_READ.has(key))
            .sort();
        expect([...seen].sort()).toEqual(expected);
    });

    it("reads with save depth: snapshot fields go through the snapshot read", () => {
        const snapshot = vi.fn(<T>(value: T): T => value);
        const source: SaveSource = {
            read: (() => []) as SaveSource["read"],
            snapshot,
            entitlement: { isPro: false, isProLicenseActive: false },
        };
        trackAutosaveReads(source);
        // At least one snapshot-mode row exists today; if the schema ever
        // drops the last one, tracking degrades to shallow reads and this
        // test must be rewritten, not deleted.
        const snapshotRows = PERSISTENCE_SCHEMA.filter((f) => f.save === "snapshot");
        expect(snapshotRows.length).toBeGreaterThan(0);
        expect(snapshot).toHaveBeenCalled();
    });

    it("a group missing from the list schedules no read for its fields", () => {
        // The failure mode this module exists to make loud: a tracking list
        // that forgot a group. Proven here against the `fields` parameter —
        // the manager always passes the full schema, so a subset here is
        // exactly what a forgotten group would do to the effect.
        const seen = new Set<string>();
        const source = stubSource(seen);
        const omitted = PERSISTENCE_SCHEMA[0]!.key;
        trackAutosaveReads(
            source,
            PERSISTENCE_SCHEMA.filter((f) => f.key !== omitted),
        );
        expect(seen.has(omitted)).toBe(false);
        // Full pass reads every row except the three non-manager rows (see
        // above); the subset pass reads exactly one fewer.
        const full = new Set<string>();
        trackAutosaveReads(stubSource(full));
        expect(seen.size).toBe(full.size - 1);
    });
});
