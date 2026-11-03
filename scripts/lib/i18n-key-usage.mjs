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
 * Call-site rules for `scripts/lint-i18n.js`, kept in their own module so they
 * can be unit-tested without running the whole repository scan.
 *
 * Two shapes were invisible to a `$_(`-only scan:
 *
 * - services translate through `const t = get(_)`, so `t("key", { count })`
 *   escaped the interpolation guard and rendered a literal `{count}`;
 * - `modalState.show("modals.…", …)` takes copy, not keys — a raw key there is
 *   rendered literally (BUG-0761), so a key-shaped argument is a defect.
 */

/** `modals.clearJournal.title` — underscore segments are real keys too. */
export const TRANSLATION_KEY = /^[a-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;

/** Dotted copy that is a hostname, a version or a filename, not a key. */
const NOT_A_KEY = /\.(?:com|org|net|io|dev|app|ts|tsx|js|mjs|cjs|json|csv|md|html|css|scss|svelte|svg|png|jpe?g|webp|pdf|txt)$/i;
const SEMVER = /^v?\d+(\.\d+)+$/i;

function looksLikeKey(value) {
    return TRANSLATION_KEY.test(value) && !NOT_A_KEY.test(value) && !SEMVER.test(value);
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The callees this file translates through: `$_` (component store),
 * `get(_)` (service form) and every local alias captured from `get(_)`.
 *
 * An alias is matched anywhere in the file. That can over-match a callback
 * parameter that happens to be called `t`, but only in a file that also binds
 * `const t = get(_)` — at which point a translation call is the likelier
 * reading.
 */
export function translationCallees(content) {
    const callees = new Set(["\\$_", "get\\(_\\)"]);
    const alias =
        /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*get\(\s*_\s*\)/g;
    for (const match of content.matchAll(alias)) {
        callees.add(escapeRegExp(match[1]));
    }
    return [...callees];
}

/**
 * Calls that pass interpolation values outside the `values` wrapper, which
 * svelte-i18n ignores — the user sees the raw `{placeholder}`.
 *
 * The rule is deliberately coarse: it splits the call into its arguments and
 * inspects the second one only when that argument is an object literal. Inside
 * the literal `values` and an empty `{}` are correct; any other first key is
 * reported — `count` as much as `locale`, `default` or a spread, because the
 * rule does not know which of them the runtime wants.
 *
 * The key may be picked by a condition (`count === 1 ? "…One" : "…Other"`),
 * which no first-argument pattern can describe. Splitting the arguments covers
 * every key shape — literal, template, identifier, member access, nested call,
 * conditional — without listing them.
 *
 * Known limitation: `callArguments` tracks quotes and bracket depth, not
 * comments. A comma inside a comment between the arguments ends the split
 * early and the call goes unreported, and a comment directly before `values`
 * makes a correct call look like a violation. Neither shape occurs today.
 */
export function findInterpolationViolations(content) {
    const call = new RegExp(
        `(?<![\\w$.])(?:${translationCallees(content).join("|")})\\(`,
        "g",
    );
    const violations = [];
    for (const match of content.matchAll(call)) {
        const openIndex = match.index + match[0].length - 1;
        const args = callArguments(content, openIndex);
        if (args.length < 2) continue;
        const options = args[1].text.trimStart();
        if (!options.startsWith("{")) continue;
        const after = options.slice(1);
        if (/^\s*values\s*[,}:]/.test(after)) continue;
        if (/^\s*\}/.test(after)) continue;
        violations.push(violation(content, match.index));
    }
    return violations;
}

const DIALOG_CALL = /\bmodalState\.show\s*\(/g;

/**
 * `modalState.show(...)` arguments that are translation keys instead of copy.
 * The dialog renders `title` and `message`; both are checked. A translated
 * argument (`t("…")`, `$_(…)`) is not a literal and passes.
 */
export function findDialogKeyLiterals(content) {
    const violations = [];
    for (const match of content.matchAll(DIALOG_CALL)) {
        const openIndex = match.index + match[0].length - 1;
        const args = callArguments(content, openIndex);
        for (const arg of args.slice(0, 2)) {
            const literal = stringLiteral(arg.text);
            if (literal === null) continue;
            const value = literal.trim();
            if (!looksLikeKey(value)) continue;
            violations.push({
                ...violation(content, arg.start + leadingWhitespace(arg.text)),
                value,
            });
        }
    }
    return violations;
}

/**
 * The arguments of the call whose `(` sits at `openIndex`. Tracks quotes and
 * bracket depth, so `", "` inside a string or a nested call does not split.
 */
function callArguments(content, openIndex) {
    const args = [];
    let depth = 1;
    let start = openIndex + 1;
    let index = openIndex + 1;
    let quote = null;

    while (index < content.length) {
        const char = content[index];

        if (quote) {
            if (char === "\\") {
                index += 2;
                continue;
            }
            if (char === quote) quote = null;
            index++;
            continue;
        }

        if (char === '"' || char === "'" || char === "`") {
            quote = char;
            index++;
            continue;
        }

        if (char === "(" || char === "[" || char === "{") {
            depth++;
            index++;
            continue;
        }

        if (char === ")" || char === "]" || char === "}") {
            depth--;
            if (depth === 0) {
                args.push({ text: content.slice(start, index), start });
                return args;
            }
            index++;
            continue;
        }

        if (char === "," && depth === 1) {
            args.push({ text: content.slice(start, index), start });
            start = index + 1;
        }

        index++;
    }

    // Unterminated call: keep what we have rather than throwing.
    args.push({ text: content.slice(start), start });
    return args;
}

/** The value of a single string or template literal, or `null`. */
function stringLiteral(argument) {
    const text = argument.trim();
    const match =
        /^(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`)$/s.exec(
            text,
        );
    if (!match) return null;
    return match[1] ?? match[2] ?? match[3];
}

function leadingWhitespace(value) {
    return value.length - value.trimStart().length;
}

function violation(content, index) {
    return {
        line: content.slice(0, index).split("\n").length,
        context: content.slice(index, index + 90).split("\n")[0].trim(),
    };
}
