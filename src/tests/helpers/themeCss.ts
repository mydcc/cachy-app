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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * One reader for the theme contract tests (`themes.test.ts`,
 * `themes.buttonContrast.test.ts`).
 *
 * `themes.css` is the only place the themes are declared, so these tests read
 * it as text and resolve it the way the cascade does: a theme block sits on
 * the same element as `:root`, so its declarations win, and `var()` chains are
 * followed through both. Two copies of this parser had already drifted apart
 * (a different block regex in each), which is why it lives here once.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface ThemeBlock {
    selector: string;
    vars: Map<string, string>;
}

export function readThemesCss(): string {
    return readFileSync(join(process.cwd(), "src", "themes.css"), "utf-8");
}

/**
 * Raw `name: value` declarations of one block body.
 *
 * The closing semicolon is optional, as it is in CSS: a token that is the last
 * declaration in its block and loses the `;` must not silently fall back to
 * `:root` and be measured as a pair the browser never renders.
 */
export function parseDeclarations(body: string): Map<string, string> {
    const vars = new Map<string, string>();
    for (const [, name, value] of body.matchAll(
        /(--[\w-]+)\s*:\s*([^;]+?)\s*(?:;|$)/g,
    )) {
        vars.set(name, value.replace(/!\s*important\s*$/i, "").trim());
    }
    return vars;
}

/** Selector blocks; `:root, .theme-default` is one block with two selectors. */
export function parseBlocks(css: string): ThemeBlock[] {
    // Comments first: a brace inside one would split a block in the wrong place.
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
    return Array.from(
        clean.matchAll(/([^{}]+)\{([^}]*)\}/g),
        ([, selector, body]) => ({
            selector: selector.trim(),
            vars: parseDeclarations(body),
        }),
    );
}

const VAR_PATTERN = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/;

/**
 * Follows a `var()` chain to the literal it lands on.
 *
 * A fallback may itself be a `var()`, and CSS resolves it: returning the raw
 * `var(--x)` text would report a valid declaration as unmeasurable. `null`
 * means the chain dangles without a fallback, which the browser handles by
 * inheriting rather than by using the pair the theme claims.
 */
export function resolveToken(
    value: string,
    scope: Map<string, string>,
    seen: Set<string> = new Set(),
): string | null {
    const match = value.match(VAR_PATTERN);
    if (!match) return value;
    const [, name, fallback] = match;
    const fallbackValue = fallback?.trim();

    if (!seen.has(name)) {
        seen.add(name);
        const next = scope.get(name);
        if (next !== undefined) return resolveToken(next, scope, seen);
    }
    return fallbackValue === undefined
        ? null
        : resolveToken(fallbackValue, scope, seen);
}

export interface ThemeScope {
    /** `dark` is the shared `:root, .theme-default` scope. */
    name: string;
    scope: Map<string, string>;
}

/**
 * The shared root scope and one merged scope per `.theme-*` block, in file
 * order. Only single-selector theme blocks count: a usage rule such as
 * `.theme-x .component button` paints a colour but declares no tokens, and
 * treating it as a theme would invent a partial palette.
 */
export function themeScopes(blocks: ThemeBlock[]): {
    root: Map<string, string>;
    themes: ThemeScope[];
} {
    const root = new Map<string, string>();
    for (const block of blocks) {
        const selectors = block.selector.split(",").map((part) => part.trim());
        if (selectors.includes(":root") || selectors.includes(".theme-default")) {
            for (const [name, value] of block.vars) root.set(name, value);
        }
    }

    const themes: ThemeScope[] = [];
    for (const block of blocks) {
        const match = /^\.theme-([\w-]+)$/.exec(block.selector);
        if (!match || match[1] === "default") continue;
        themes.push({
            name: match[1],
            scope: new Map([...root, ...block.vars]),
        });
    }

    return { root, themes };
}
