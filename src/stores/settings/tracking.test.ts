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
import { PERSISTENCE_SCHEMA, readSerializedField, type SaveSource } from "./persistenceSchema";
import { trackAutosaveReads, trackAutosaveReadsForFields } from "./tracking";

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

    it("reads every snapshot row through the snapshot read, per row", () => {
        // A `snapshot`→`direct` flip of a single row (e.g. `accounts`, whose
        // in-place credential edits must keep scheduling saves) stayed green
        // under a "snapshot called at least once" assertion. Pin every row.
        const snapshot = vi.fn(<T>(value: T): T => value);
        const values = new Map<string, unknown>();
        const source: SaveSource = {
            read: ((key: string) => {
                // Array-shaped reads for the rows whose saver iterates:
                // the two redactors map, the spread row spreads.
                const value =
                    key === "accounts" ||
                    key === "userProviders" ||
                    key === "aiAllowedActions"
                        ? []
                        : { key };
                values.set(key, value);
                return value;
            }) as SaveSource["read"],
            snapshot,
            entitlement: { isPro: false, isProLicenseActive: false },
        };
        trackAutosaveReads(source);
        const snapshotRows = PERSISTENCE_SCHEMA.filter((f) => f.save === "snapshot");
        expect(snapshotRows.length).toBeGreaterThan(0);
        const missing = snapshotRows
            .map((f) => f.key)
            .filter(
                (key) =>
                    !snapshot.mock.calls.some(([value]) => value === values.get(key)),
            );
        expect(
            missing,
            `these snapshot rows bypassed the snapshot read: ${missing.join(", ")}`,
        ).toEqual([]);
    });

    it("pins which rows are snapshot mode, so a flip is conscious", () => {
        // The per-row test above reads the modes from the schema it checks,
        // so a `snapshot`→`direct` flip changes expectation and behavior
        // together and stays green. This pins the assignment itself: the
        // rows below are the object-valued fields the UI mutates in place,
        // and shallow-tracking them loses nested edits silently. A mode
        // change must edit this list deliberately, not slip through.
        const snapshotKeys = PERSISTENCE_SCHEMA.filter((f) => f.save === "snapshot")
            .map((f) => f.key)
            .sort();
        expect(snapshotKeys).toEqual(
            [
                "analysisTimeframes",
                "customHotkeys",
                "customRssFeeds",
                "discordChannels",
                "favoriteSymbols",
                "favoriteTimeframes",
                "feeRates",
                "fireConfig",
                "galaxySettings",
                "logSettings",
                "rssPresets",
                "tradeFlowSettings",
            ].sort(),
        );
    });

    it("copies the spread row instead of aliasing it", () => {
        // `aiAllowedActions` is the only spread row. Tracking must observe
        // the copy the save persists, not the live array — an aliased read
        // would track the reference while the save writes a copy.
        const live = ["rule-a"];
        const source = saveSource(() => live);
        const row = PERSISTENCE_SCHEMA.find((f) => f.save === "spread")!;
        expect(row.key).toBe("aiAllowedActions");
        const out = readSerializedField(row, source);
        expect(out).toEqual(["rule-a"]);
        expect(out).not.toBe(live);
    });

    it("a group missing from the list schedules no read for its fields", () => {
        // The failure mode this module exists to make loud: a tracking list
        // that forgot a group. Proven here against the `fields` parameter —
        // the manager always passes the full schema, so a subset here is
        // exactly what a forgotten group would do to the effect.
        const seen = new Set<string>();
        const source = stubSource(seen);
        const omitted = PERSISTENCE_SCHEMA[0]!.key;
        trackAutosaveReadsForFields(
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
