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
 * primitive's 14 px/700 body size. This gate resolves the **resting** pair the
 * CSS composes — theme block over `:root`, following `var()` chains — and
 * fails below 4.5:1.
 *
 * The hover pair (`--btn-*-hover-bg` with the same label) is not gated for the
 * roles whose hover swaps a token, and neither is a component that mixes a
 * semantic fill with a `--btn-*` text token; both are measured in BUG-0760.
 * `warning` is the exception on both counts (BUG-0759): its hover only lowers
 * the button opacity, so that role's hover is pinned here by compositing the
 * label and the fill over `--bg-secondary`. A colour syntax this gate cannot
 * read is reported, not guessed at: `parseColorToRgb` harvests numeric runs, so
 * an `hsl()` value would otherwise be graded as if it were `rgb()`.
 */

import { describe, expect, it } from "vitest";

import { THEME_BACKGROUNDS } from "./lib/themeBackgrounds";
import { contrastRatio, parseColorToRgb } from "./lib/themeColors";
import type { Rgb } from "./lib/themeColors";
import {
    parseBlocks,
    readThemesCss,
    resolveToken,
    themeScopes,
} from "./tests/helpers/themeCss";

/**
 * Roles that paint both a fill and a label. `warning` joined in BUG-0759 once
 * `--btn-warning-text` existed; the other four were gated by BUG-0728.
 */
const ROLES = ["default", "accent", "danger", "success", "warning"] as const;

/** WCAG 2.1 AA for normal text; the primitive renders at 14 px/700. */
const MIN_CONTRAST = 4.5;

/** The literal forms this gate can measure; anything else is a failure. */
const MEASURABLE = /^(#[0-9a-f]{3,8}|rgba?\()/i;

interface Marker {
    label: string;
    scope: Map<string, string>;
}

/** The six rows of BUG-0759's evidence table, as the fills they resolve to. */
const DOCUMENTED_WARNING_FILLS: ReadonlyArray<readonly [string, string]> = [
    [".theme-default (shared :root)", "#facc15"],
    [".theme-light", "#953800"],
    [".theme-meteorite", "#ffe0ee"],
    [".theme-VIP", "#ff9800"],
    [".theme-matrix", "#ffff00"],
    [".theme-github-light", "#953800"],
];

/** `.btn-base.btn-warning:hover` lowers the whole button to this opacity. */
const HOVER_OPACITY = 0.9;

/** The root scope and one merged scope per theme, labelled as failures print. */
function themeMarkers(): Marker[] {
    const { root, themes } = themeScopes(parseBlocks(readThemesCss()));
    return [
        { label: ".theme-default (shared :root)", scope: root },
        ...themes.map((theme) => ({
            label: `.theme-${theme.name}`,
            scope: theme.scope,
        })),
    ];
}

/** `foreground` drawn at `opacity` over `backdrop`, per channel. */
function compositeOver(foreground: Rgb, backdrop: Rgb, opacity: number): Rgb {
    return foreground.map((channel, index) =>
        Math.round(opacity * channel + (1 - opacity) * backdrop[index]),
    ) as Rgb;
}

describe("BUG-0728 — filled button pairs meet AA in every theme", () => {
    it("covers every shipped theme and resolves both tokens of every role", () => {
        const { root, themes } = themeScopes(parseBlocks(readThemesCss()));

        // A theme whose CSS block is renamed, wrapped in a descendant selector
        // or never written would otherwise drop out of the loop silently — the
        // root scope alone still contributes four passing pairs.
        expect(themes.length, "theme blocks parsed from themes.css").toBeGreaterThan(0);
        expect(
            ["dark", ...themes.map((theme) => theme.name)].sort(),
            "every shipped theme has one CSS scope",
        ).toEqual(Object.keys(THEME_BACKGROUNDS).sort());

        const markers: Marker[] = [
            { label: ".theme-default (shared :root)", scope: root },
            ...themes.map((theme) => ({
                label: `.theme-${theme.name}`,
                scope: theme.scope,
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

                if (!bgLiteral || !textLiteral) {
                    failures.push(
                        `${marker.label}: ${textToken} (${textValue}) on ` +
                            `${bgToken} (${bgValue}) does not resolve to a colour`,
                    );
                    continue;
                }

                if (
                    !MEASURABLE.test(bgLiteral) ||
                    !MEASURABLE.test(textLiteral)
                ) {
                    failures.push(
                        `${marker.label}: ${textLiteral} on ${bgLiteral} uses a ` +
                            `colour syntax this gate cannot measure`,
                    );
                    continue;
                }

                const bg = parseColorToRgb(bgLiteral);
                const text = parseColorToRgb(textLiteral);
                if (!bg || !text) {
                    failures.push(
                        `${marker.label}: ${textLiteral} on ${bgLiteral} does not ` +
                            `parse as a colour`,
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
            `${failures.length} filled button pair problem(s) ` +
                `(below ${MIN_CONTRAST}:1, unmeasurable, or undeclared)`,
        ).toEqual([]);
    });

    /**
     * BUG-0759's evidence table, row for row. The generic loop above covers
     * these themes too, but it reports one line among many; these rows keep the
     * item's measured fills attached to the themes it named, so a palette edit
     * that flips a fill's lightness fails with the theme and the old fill.
     */
    it("pins the warning fills from the item and their label", () => {
        const scopeByLabel = new Map(
            themeMarkers().map((marker) => [marker.label, marker.scope]),
        );
        const failures: string[] = [];

        for (const [label, fill] of DOCUMENTED_WARNING_FILLS) {
            const scope = scopeByLabel.get(label);
            if (scope === undefined) {
                failures.push(`${label}: no such theme scope`);
                continue;
            }

            const bgLiteral = resolveToken(
                scope.get("--btn-warning-bg") ?? "",
                scope,
            );
            if (bgLiteral !== fill) {
                failures.push(
                    `${label}: --btn-warning-bg is ${bgLiteral}, ` +
                        `the item measured ${fill}`,
                );
            }

            const textLiteral = resolveToken(
                scope.get("--btn-warning-text") ?? "",
                scope,
            );
            const bg = bgLiteral === null ? null : parseColorToRgb(bgLiteral);
            const text =
                textLiteral === null ? null : parseColorToRgb(textLiteral);
            if (!bg || !text) {
                failures.push(
                    `${label}: ${textLiteral} on ${bgLiteral} is not a ` +
                        `colour pair`,
                );
                continue;
            }

            const ratio = contrastRatio(bg, text);
            if (ratio < MIN_CONTRAST) {
                failures.push(
                    `${label}: ${textLiteral} on ${fill} is ` +
                        `${ratio.toFixed(2)}:1`,
                );
            }
        }

        expect(failures, "warning pair per documented theme").toEqual([]);
    });

    /**
     * `.btn-base.btn-warning:hover` only lowers the button's opacity, so the
     * backdrop shows through both the fill and the label. Compositing both over
     * `--bg-secondary` — the settings card the data-maintenance buttons sit on
     * — is the pair a user hovers; the label must stay readable there too.
     */
    it("keeps the warning label readable at the 0.9 hover opacity", () => {
        const failures: string[] = [];

        for (const marker of themeMarkers()) {
            const bgLiteral = resolveToken(
                marker.scope.get("--btn-warning-bg") ?? "",
                marker.scope,
            );
            const textLiteral = resolveToken(
                marker.scope.get("--btn-warning-text") ?? "",
                marker.scope,
            );
            const backdropLiteral = resolveToken(
                marker.scope.get("--bg-secondary") ?? "",
                marker.scope,
            );

            const bg = bgLiteral === null ? null : parseColorToRgb(bgLiteral);
            const text =
                textLiteral === null ? null : parseColorToRgb(textLiteral);
            const backdrop =
                backdropLiteral === null
                    ? null
                    : parseColorToRgb(backdropLiteral);
            if (!bg || !text || !backdrop) {
                failures.push(
                    `${marker.label}: ${textLiteral} on ${bgLiteral} over ` +
                        `${backdropLiteral} does not resolve to colours`,
                );
                continue;
            }

            const ratio = contrastRatio(
                compositeOver(bg, backdrop, HOVER_OPACITY),
                compositeOver(text, backdrop, HOVER_OPACITY),
            );
            if (ratio < MIN_CONTRAST) {
                failures.push(
                    `${marker.label}: ${textLiteral} on ${bgLiteral} at ` +
                        `${HOVER_OPACITY} opacity is ${ratio.toFixed(2)}:1`,
                );
            }
        }

        expect(failures, "warning hover pair").toEqual([]);
    });
});
