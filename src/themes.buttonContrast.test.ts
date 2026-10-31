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
 * BUG-0728 — every filled button role has to be readable in every theme.
 *
 * The primitive reads `--btn-<role>-bg` / `--btn-<role>-text`, while the
 * hand-written rules it replaced read `--accent-color` / `--danger-color` /
 * `--success-color`. The two families were never compared, so a theme could
 * ship a pair that is both different and unreadable: `theme-matrix` rendered
 * the paper submit as #00802b on #00ff41, 3.73:1, below AA for the
 * primitive's 14 px/700 body size. This gate resolves the pairs the way the
 * cascade does — theme block over `:root`, following `var()` chains — and
 * fails below 4.5:1.
 *
 * It deliberately measures the pair the CSS actually composes. A token that
 * dangles (`var(--typo)`) is a failure too, because at computed-value time it
 * makes `color` inherit rather than fall back to something readable.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contrastRatio, parseColorToRgb } from "./lib/themeColors";

/** The filled roles: every variant that paints both a fill and a label. */
const ROLES = ["default", "accent", "danger", "success"] as const;

/** WCAG 2.1 AA for normal text; the primitive renders at 14 px/700. */
const MIN_CONTRAST = 4.5;

interface Block {
    selector: string;
    vars: Map<string, string>;
}

function readThemesCss(): string {
    return readFileSync(join(process.cwd(), "src", "themes.css"), "utf-8");
}

/** Raw `name: value` declarations of one block body. */
function parseDeclarations(body: string): Map<string, string> {
    const vars = new Map<string, string>();
    for (const [, name, value] of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
        vars.set(`--${name}`, value.trim());
    }
    return vars;
}

function parseBlocks(css: string): Block[] {
    // Comments first: a brace inside one would split a block in the wrong place.
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
    return Array.from(clean.matchAll(/([^{}]+)\{([^}]*)\}/g), ([, selector, body]) => ({
        selector: selector.trim(),
        vars: parseDeclarations(body),
    }));
}

const VAR_PATTERN = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/;

/**
 * Follows a `var()` chain to the literal it lands on.
 *
 * Returns `null` when the chain dangles without a fallback: the browser would
 * then fall back to an inherited value, which is not the pair the theme says
 * it ships, so the test must not pretend it resolved one.
 */
function resolveToken(
    value: string,
    scope: Map<string, string>,
    seen: Set<string> = new Set(),
): string | null {
    const match = value.match(VAR_PATTERN);
    if (!match) return value;
    const [, name, fallback] = match;
    if (seen.has(name)) return fallback?.trim() ?? null;
    seen.add(name);
    const next = scope.get(name);
    if (next === undefined) return fallback?.trim() ?? null;
    return resolveToken(next, scope, seen);
}

interface Marker {
    label: string;
    scope: Map<string, string>;
}

describe("BUG-0728 — filled button pairs meet AA in every theme", () => {
    it("resolves both tokens of every role and clears 4.5:1", () => {
        const blocks = parseBlocks(readThemesCss());

        const root = blocks.find((block) => block.selector.includes(":root"));
        expect(root, ":root block with shared tokens must exist").toBeDefined();

        const markers: Marker[] = [
            {
                label: ".theme-default (shared :root)",
                scope: new Map([...(root?.vars ?? [])]),
            },
            ...blocks
                .filter((block) => /^\.theme-[\w-]+$/.test(block.selector))
                .map((block) => ({
                    label: block.selector,
                    scope: new Map([...(root?.vars ?? []), ...block.vars]),
                })),
        ];

        const failures: string[] = [];
        for (const marker of markers) {
            for (const role of ROLES) {
                const bgToken = `--btn-${role}-bg`;
                const textToken = `--btn-${role}-text`;
                const bgValue = marker.scope.get(bgToken);
                const textValue = marker.scope.get(textToken);

                if (bgValue === undefined || textValue === undefined) {
                    failures.push(
                        `${marker.label}: ${bgToken} / ${textToken} not declared`,
                    );
                    continue;
                }

                const bgLiteral = resolveToken(bgValue, marker.scope);
                const textLiteral = resolveToken(textValue, marker.scope);
                const bg = bgLiteral ? parseColorToRgb(bgLiteral) : null;
                const text = textLiteral ? parseColorToRgb(textLiteral) : null;

                if (!bg || !text) {
                    failures.push(
                        `${marker.label}: ${textToken} (${textValue}) on ` +
                            `${bgToken} (${bgValue}) does not resolve to a colour`,
                    );
                    continue;
                }

                const ratio = contrastRatio(bg, text);
                if (ratio < MIN_CONTRAST) {
                    failures.push(
                        `${marker.label}: ${textToken} ${textLiteral} on ` +
                            `${bgToken} ${bgLiteral} is ${ratio.toFixed(2)}:1`,
                    );
                }
            }
        }

        expect(
            failures,
            `${failures.length} filled button pair(s) below ${MIN_CONTRAST}:1`,
        ).toEqual([]);
    });
});
