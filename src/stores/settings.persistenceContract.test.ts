import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SETTINGS_KEYS, settingsState } from "./settings.svelte";

/**
 * The persistence contract, checked by name.
 *
 * The constructor's autosave `$effect` calls `toJSON()` purely to make the
 * effect depend on every reactive field; the comment above it says so. A
 * comment is not a guarantee. A `$state` field that `toJSON()` never reads is
 * invisible to the effect, so changing it schedules no save and the change is
 * gone on reload — silently, with no error, no log, and no failing test.
 *
 * The account CRUD methods call `save()` explicitly and are safe either way.
 * Everything else — every plain `bind:` to a settings field — relies entirely
 * on `toJSON()` reading it.
 *
 * **What this does not check, and cannot:** the contract is a comparison of
 * *names*. It cannot see which field a `toJSON()` entry reads, so
 * `showSidebars: this.showTooltips` passes; and it cannot see whether a
 * field's backing store is reactive, so a plain field behind an accessor pair
 * passes too. Both were verified green by mutation. Closing that gap needs a
 * runtime reactivity assertion (build a manager, flip a field, observe that a
 * save was scheduled) and is tracked as a follow-up rather than pretended
 * away here.
 */

/**
 * Keys `toJSON()` emits that are not user settings at all: a storage-format
 * marker and encryption bookkeeping. There is nothing to declare a default
 * for, and nothing in the UI would ever write one.
 *
 * The three `encrypted*` blobs are emitted as keys with `undefined` values when
 * unpopulated, so `Object.keys()` always contains them — a blob written with no
 * master password still satisfies every assertion below.
 */
const NOT_A_SETTING: Readonly<Record<string, string>> = {
    credentialSchemaVersion: "storage format marker, not a user setting",
    encryptedAccountKeys: "encryption state, absent until a master password exists",
    encryptedSecrets: "encryption state, absent until a master password exists",
    encryptedProviderConfigs:
        "encryption state, absent until a master password exists",
    isEncrypted: "encryption state flag, mirrors the three blobs above",
};

/**
 * Keys that are declared on the class and persisted, but have **no entry in
 * `defaultSettings`**. Each entry is a defect to fix, not an exemption to
 * keep: with no default there is nothing for the load-time merge to fall back
 * to, so the field starts undefined no matter what the stored blob says.
 *
 * `pnlViewMode` was one of these and two components wrote to it. The merge was
 * a bare assignment, so a blob predating the setting left it undefined. It is
 * fixed now; the assertion below is what keeps the next one from being
 * certified instead.
 */
const MISSING_DEFAULT: Readonly<Record<string, string>> = {
    // No consumer: the only non-store reference is `backupService.ts`, which
    // scrubs it on export. Declared and persisted for compatibility with
    // stored blobs, with no feature behind it today.
    imgurClientId: "no default declared and no consumer; backupService scrubs it on export",
};

/** All keys the contract tolerates beyond `SETTINGS_KEYS`. */
const EXCEPTIONS: Readonly<Record<string, string>> = {
    ...NOT_A_SETTING,
    ...MISSING_DEFAULT,
};

/** Production Svelte components — the only place a setting can be written from the UI. */
function componentSources(dir: string): Array<{ file: string; text: string }> {
    const found: Array<{ file: string; text: string }> = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) found.push(...componentSources(path));
        else if (entry.name.endsWith(".svelte")) {
            found.push({ file: path, text: readFileSync(path, "utf8") });
        }
    }
    return found;
}

/**
 * Whether a component *writes* the key — which is what turns a missing default
 * into a defect. A read is harmless: with nothing to persist, a read just sees
 * undefined and the component decides. `pnlViewMode` was written by two
 * components, and that is the whole reason it mattered.
 */
function isWrittenFromUi(key: string): string[] {
    const writers: string[] = [];
    for (const { file, text } of componentSources("src/components")) {
        const assigns = new RegExp(`settingsState\\.${key}\\s*=(?!=)`).test(text);
        const binds = new RegExp(`bind:[a-zA-Z]+={[^}]*settingsState\\.${key}\\b`).test(
            text,
        );
        if (assigns || binds) writers.push(file);
    }
    return writers;
}

describe("settings persistence contract", () => {
    const serialized = Object.keys(settingsState.toJSON());

    it("serializes every setting the defaults declare", () => {
        // The direction that costs the user something: a setting missing here
        // is one the autosave effect cannot see.
        expect(SETTINGS_KEYS.filter((key) => !serialized.includes(key))).toEqual([]);
    });

    it("emits no key that is neither a declared setting nor a named exception", () => {
        const known = new Set([...SETTINGS_KEYS, ...Object.keys(EXCEPTIONS)]);
        expect(serialized.filter((key) => !known.has(key))).toEqual([]);
    });

    it("drops every exception toJSON() stopped emitting", () => {
        // Otherwise the list can only grow, and an exception outlives the key
        // it describes: a future field reusing that name then enters toJSON()
        // pre-approved and unreviewed.
        expect(
            Object.keys(EXCEPTIONS).filter((key) => !serialized.includes(key)),
        ).toEqual([]);
    });

    it("keeps no exception that is also a declared setting", () => {
        // An exception for a declared key means the real answer is something
        // else — a missing default, a redaction, a marker. Split it out.
        const declared = new Set(SETTINGS_KEYS);
        expect(
            Object.keys(EXCEPTIONS).filter((key) => declared.has(key)),
        ).toEqual([]);
    });

    it("keeps every missing default unwritten, so it stays inert", () => {
        // The pnlViewMode lesson, mechanised. A setting with no default is
        // harmless while nothing can set it and a defect the moment a control
        // appears — so adding the control has to add the default too.
        const written: string[] = [];
        for (const key of Object.keys(MISSING_DEFAULT)) {
            for (const file of isWrittenFromUi(key)) written.push(`${key} <- ${file}`);
        }
        expect(written).toEqual([]);
    });
});
