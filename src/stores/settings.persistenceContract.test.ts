import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
 * passes too. Both were verified green by mutation. That gap is now closed by
 * `settings.reactivityContract.component.test.ts`, which flips every serialized
 * key and asserts the autosave effect scheduled a save; both mutations turn it
 * red there. See BUG-0653 for the measurements, including why that file must be
 * a `.component.test.ts` rather than a plain `.test.ts`.
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
 * `defaultSettings`**. With no default there is nothing for the load-time merge
 * to fall back to, so the field starts undefined no matter what the stored blob
 * says.
 *
 * The list is a registry, not a destination. An entry passes only while nothing
 * can write it — see the assertion at the end — and it leaves by one of two
 * routes. Either the field gains a default, which is the fix when something
 * actually reads the setting. Or the field is deleted outright, in which case
 * this entry has to go with it: the "drops every exception" assertion fails the
 * moment `toJSON()` stops emitting the key.
 *
 * Empty at the moment. It held `imgurClientId`, which had no consumer at all and
 * was removed in BUG-0654. `pnlViewMode` was the previous occupant and is
 * likewise gone — it gained a default instead, which is what a field with
 * readers should do.
 */
const MISSING_DEFAULT: Readonly<Record<string, string>> = {};

/** All keys the contract tolerates beyond `SETTINGS_KEYS`. */
const EXCEPTIONS: Readonly<Record<string, string>> = {
    ...NOT_A_SETTING,
    ...MISSING_DEFAULT,
};

/**
 * `src/`, resolved from this file rather than `process.cwd()`. A relative
 * `readdirSync` turns a directory rename into a raw ENOENT from inside a test,
 * which says nothing about which path broke.
 */
const SRC_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** One pass over the tree, not one per key. */
let sourceCache: Array<{ file: string; text: string }> | undefined;

/**
 * Every production file a setting can be written from.
 *
 * Not just `src/components`. An earlier version of this scan covered that
 * directory alone — 142 of 167 `.svelte` files, no `.ts` at all — while its
 * comment claimed it was the only surface. It was not, and the writers it
 * missed were not a handful: `hotkeyService.ts` (`showSidebars`,
 * `showTechnicals`), `app.ts` (six writes in `setupFirstStart()`), the window
 * implementations under `src/lib`, `favorites.svelte.ts`,
 * `SymbolPickerView.svelte`, `CandleChartView.svelte`, `appAuth.ts`, and more
 * besides. 18 of the 261 production writes to settings live outside
 * `src/components`, across 14 keys.
 *
 * Test files are excluded: they assign settings to arrange state, and a
 * fixture is not a user reaching a control.
 *
 * **What this cannot see.** Every row below was measured against this regex, and
 * every row currently has zero live instances in `src` — but the shapes are
 * real and a future author will not know about them from a passing check:
 *
 * - a write through a local alias: `const settings = settingsState` appears in
 *   `PortfolioInputs.svelte` (twice) and `i18n.ts`, and none writes through it
 *   today, but a `settings.foo = …` there is invisible
 * - dynamic access: `settingsState[key] = …`, `Object.assign(settingsState, …)`,
 *   `delete settingsState.foo` — no instance in the repo
 * - an optional-chained write: `settingsState.feeRates[ex]?.maker = …`
 * - a mutation call on an array- or object-valued setting:
 *   `settingsState.accounts.push(a)`
 * - a compound assignment or increment: `settingsState.foo ??= x`, `||= x`, `++`
 * - a destructuring assign: `({ imgurClientId: settingsState.imgurClientId } = o)`
 *
 * If a writer ever takes one of these shapes, the scan stops covering it and the
 * guard has to learn the new shape rather than quietly pass.
 */
/**
 * Drops comments and string/template literals before matching.
 *
 * Without this the scan reads prose: a `//` line explaining
 * `settingsState.foo = …`, or an HTML comment in a `.svelte` file, is
 * indistinguishable from a write. The guard reads its own source, and its
 * docstring names the wrong-field mutation — so without stripping, the file
 * documenting the blind spot would trip it the day a key was named after that
 * field.
 *
 * Literals go **before** line comments, and that order is load-bearing: a URL
 * in a string contains `//`, so stripping comments first would eat the rest of
 * the line and hide a real write sitting next to it. Every region becomes a
 * single space rather than nothing, so two statements are not glued together.
 */
function stripNonCode(text: string): string {
    return text
        .replace(/`(?:\\[\s\S]|[^`\\])*`/g, " ")
        .replace(/"(?:\\[\s\S]|[^"\\])*"/g, " ")
        .replace(/'(?:\\[\s\S]|[^'\\])*'/g, " ")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/[^\n]*/g, " ")
        .replace(/<!--[\s\S]*?-->/g, " ");
}

function productionSources(): Array<{ file: string; text: string }> {
    if (sourceCache) return sourceCache;
    const found: Array<{ file: string; text: string }> = [];
    const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) walk(path);
            else if (
                (entry.name.endsWith(".ts") || entry.name.endsWith(".svelte")) &&
                !entry.name.includes(".test.") &&
                !entry.name.includes(".bench.")
            ) {
                found.push({
                    file: path.replace(SRC_ROOT, ""),
                    text: stripNonCode(readFileSync(path, "utf8")),
                });
            }
        }
    };
    if (!existsSync(SRC_ROOT)) {
        throw new Error(`settings contract: source root not found at ${SRC_ROOT}`);
    }
    walk(SRC_ROOT);
    sourceCache = found;
    return found;
}

/**
 * Whether anything *writes* the key — which is what turns a missing default
 * into a defect. A read is harmless: with nothing to persist, a read just sees
 * undefined and the reader decides. `pnlViewMode` was written from two places,
 * and that is the whole reason it mattered.
 *
 * The assignment tail is deliberately tight — only index and member steps may
 * sit between the key and the `=`. A wider window would read `settingsState.foo`
 * in `const x = settingsState.foo; const y = 2` as a write, and with the whole
 * source tree in scope that false positive would arrive immediately.
 */
function writersOf(key: string): string[] {
    const chain = "(?:\\.[A-Za-z_][\\w$]*|\\[[^\\]]*\\])*";
    const assign = new RegExp(`settingsState${chain}\\.${key}\\b${chain}\\s*=(?!=)`);
    const bind = new RegExp(`bind:[a-zA-Z]+={[^}]*settingsState${chain}\\.${key}\\b`);
    return productionSources()
        .filter(({ text }) => assign.test(text) || bind.test(text))
        .map(({ file }) => file);
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
            for (const file of writersOf(key)) written.push(`${key} <- ${file}`);
        }
        expect(written).toEqual([]);
    });
});
