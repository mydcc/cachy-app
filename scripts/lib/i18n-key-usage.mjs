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
 *   rendered literally (BUG-0761), so a key-shaped first argument is a defect.
 */

/** `modals.clearJournal.title` — segments never contain spaces or capitals first. */
export const TRANSLATION_KEY = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/;

/** A string literal, a template literal, or a bare (optionally cast) identifier. */
const FIRST_ARGUMENT =
    "(?:\"[^\"]*\"|'[^']*'|`[^`]*`|[\\w.[\\]]+(?:\\s+as\\s+[\\w.]+)?)";

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
 */
export function findInterpolationViolations(content) {
    const call = new RegExp(
        `(?<![\\w$.])(?:${translationCallees(content).join("|")})\\(\\s*${FIRST_ARGUMENT}\\s*,\\s*\\{`,
        "g",
    );
    const violations = [];
    for (const match of content.matchAll(call)) {
        const after = content.slice(match.index + match[0].length);
        if (/^\s*values\s*:/.test(after)) continue;
        if (/^\s*\}/.test(after)) continue;
        violations.push(violation(content, match.index));
    }
    return violations;
}

/**
 * `modalState.show(...)` first arguments that are translation keys instead of
 * copy. A translated call (`t("…")`, `$_(…)`) is not a literal and passes.
 */
export function findDialogKeyLiterals(content) {
    const call = /\bmodalState\.show\(\s*(?:"([^"]*)"|'([^']*)')/g;
    const violations = [];
    for (const match of content.matchAll(call)) {
        const value = (match[1] ?? match[2] ?? "").trim();
        if (!TRANSLATION_KEY.test(value)) continue;
        violations.push({ ...violation(content, match.index), value });
    }
    return violations;
}

function violation(content, index) {
    return {
        line: content.slice(0, index).split("\n").length,
        context: content.slice(index, index + 90).split("\n")[0].trim(),
    };
}
