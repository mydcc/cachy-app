import { describe, expect, it } from "vitest";
import { SETTINGS_KEYS, settingsState } from "./settings.svelte";

/**
 * The persistence contract.
 *
 * The constructor's autosave `$effect` calls `toJSON()` purely to make the
 * effect depend on every reactive field; the comment above it says so. A
 * comment is not a guarantee. A `$state` field that `toJSON()` never reads is
 * invisible to the effect, so changing it schedules no save and the change is
 * gone on reload — silently, with no error, no log, and no failing test.
 *
 * The account CRUD methods call `save()` explicitly and are safe either way.
 * Everything else — every plain `bind:` to a settings field — relies entirely
 * on this contract, which is why the two directions are both asserted.
 */

/**
 * Keys `toJSON()` emits that `defaultSettings` deliberately does not declare.
 *
 * Every entry is a decision, not an accident. Adding a key here means saying
 * "this is not a user setting with a default" in a place that is checked.
 */
const RUNTIME_ONLY_KEYS: Readonly<Record<string, string>> = {
    // Read from the entitlement store rather than a $state field. The whole
    // Pro-edition concept is being reworked in its own FEAT; until then these
    // two are carried through so the stored blob does not lose them.
    pnlViewMode:
        "no default is declared, so the field starts undefined; serialised to keep an existing stored value",
    // The credential-format marker a stored blob carries, not a preference.
    credentialSchemaVersion: "storage format marker, not a user setting",
    // Encryption bookkeeping. Each is emitted only when populated, so the
    // contract tolerates their absence — a blob with no master password
    // simply has none of them.
    encryptedAccountKeys: "encryption state, absent until a master password exists",
    encryptedSecrets: "encryption state, absent until a master password exists",
    encryptedProviderConfigs:
        "encryption state, absent until a master password exists",
    isEncrypted: "encryption state flag, mirrors the three blobs above",
    // Declared on the class, read by `newsService`, and given no default — the
    // field starts undefined and the consumer treats that as "no filter".
    imgurClientId:
        "no default is declared, so the field starts undefined; serialised to keep an existing stored value",
};

describe("settings persistence contract", () => {
    const serialized = Object.keys(settingsState.toJSON());

    it("serializes every setting the defaults declare", () => {
        // The direction that matters: a setting missing here is one the
        // autosave effect cannot see.
        const missing = SETTINGS_KEYS.filter((key) => !serialized.includes(key));
        expect(missing).toEqual([]);
    });

    it("emits no key that is neither a declared setting nor a named exception", () => {
        const known = new Set([...SETTINGS_KEYS, ...Object.keys(RUNTIME_ONLY_KEYS)]);
        expect(serialized.filter((key) => !known.has(key))).toEqual([]);
    });

    it("keeps every named exception justified", () => {
        // An exception with an empty reason is a hole that grew a comment.
        const unjustified = Object.entries(RUNTIME_ONLY_KEYS)
            .filter(([, reason]) => reason.trim().length === 0)
            .map(([key]) => key);
        expect(unjustified).toEqual([]);
    });

    it("declares a default for every setting that has one", () => {
        // Guards the other direction of the same three-place agreement: a key
        // added to the exception list must not also be a declared setting,
        // which would mean the exception is dead and the real answer is that
        // the default is missing.
        const declared = new Set(SETTINGS_KEYS);
        const shadowed = Object.keys(RUNTIME_ONLY_KEYS).filter((key) =>
            declared.has(key),
        );
        expect(shadowed).toEqual([]);
    });
});
