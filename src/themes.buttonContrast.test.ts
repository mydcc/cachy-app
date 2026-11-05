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
 * roles whose hover swaps a token; that, and a component that mixes a semantic
 * fill with a `--btn-*` text token, are measured in BUG-0760. `warning` is the
 * exception for the hover half (BUG-0759): its hover only lowers the button
 * opacity, so the composite over the surface the button sits on is pinned
 * here. A colour syntax this gate cannot read is reported, not guessed at:
 * `parseColorToRgb` harvests numeric runs, so an `hsl()` value would otherwise
 * be graded as if it were `rgb()`.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { THEME_BACKGROUNDS } from "./lib/themeBackgrounds";
import { contrastRatio, parseColorToRgb } from "./lib/themeColors";
import type { Rgb } from "./lib/themeColors";
import {
    parseBlocks,
    readThemesCss,
    resolveToken,
    themeScopes,
} from "./tests/helpers/themeCss";

type Scopes = ReturnType<typeof themeScopes>;

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

/** The rule whose opacity the hover composite has to model. */
const WARNING_HOVER_RULE = /\.btn-base\.btn-warning:hover[^{]*\{([^}]*)\}/;

/**
 * Every place a label sits on a warning fill. The ratio gate below only proves
 * the tokens agree; these regexes hold the **wiring**, because in the default
 * theme the old fallbacks happened to equal the right ink and a computed value
 * therefore cannot tell a fixed rule from a broken one.
 */
const WARNING_LABEL_SITES: ReadonlyArray<
    readonly [source: string, site: string, pattern: RegExp]
> = [
    [
        "src/themes.css",
        ".btn-base.btn-warning",
        /\.btn-base\.btn-warning\s*\{[^}]*color:\s*var\(--btn-warning-text\)/,
    ],
    [
        "src/themes.css",
        ".bg-warning-paired",
        /\.bg-warning-paired\s*\{[^}]*color:\s*var\(--text-on-warning\)/,
    ],
    [
        "src/themes.css",
        ".badge-warning",
        /\.badge-warning\s*\{[^}]*color:\s*var\(--text-on-warning\)/,
    ],
    [
        "src/components/layout/Header.svelte",
        ".paper-mode-badge",
        /\.paper-mode-badge\s*\{[^}]*color:\s*var\(--text-on-warning\)/,
    ],
    [
        "src/components/shared/CalculationDashboard.svelte",
        ".status-indicator.warning",
        /\.status-indicator\.warning\s*\{[^}]*color:\s*var\(--text-on-warning\)/,
    ],
    [
        "src/components/settings/HotkeySettings.svelte",
        "conflict toast",
        /bg-\[var\(--warning-color\)\][^"]*text-\[var\(--text-on-warning\)\]/,
    ],
    [
        "src/components/settings/PaperTradingSettings.svelte",
        "paper-mode status label",
        /'text-\[var\(--text-on-warning\)\]'/,
    ],
];

/** The root scope and one merged scope per theme, labelled as failures print. */
function themeMarkers({ root, themes }: Scopes): Marker[] {
    return [
        { label: ".theme-default (shared :root)", scope: root },
        ...themes.map((theme) => ({
            label: `.theme-${theme.name}`,
            scope: theme.scope,
        })),
    ];
}

/**
 * The opacity `.btn-base.btn-warning:hover` actually paints, read from the CSS
 * instead of restated here — a gate that keeps compositing at a value the
 * stylesheet no longer uses is a false green that reads as coverage.
 */
function warningHoverOpacity(): number {
    const body = WARNING_HOVER_RULE.exec(readThemesCss())?.[1] ?? "";
    const match = /opacity:\s*([\d.]+)/.exec(body);
    return match ? Number(match[1]) : Number.NaN;
}

/**
 * The colours a backdrop token paints. `--bg-primary` is a plain colour in most
 * themes and a `radial-gradient` in `meteorite`, `steel`, `insight` and `ever`;
 * a gradient contributes every stop it paints, so the composite is checked
 * against each surface a button can actually sit on instead of substituting a
 * different one.
 */
function backdropColours(token: string, scope: Map<string, string>): Rgb[] {
    const value = resolveToken(scope.get(token) ?? "", scope);
    if (value === null) return [];

    const stops = MEASURABLE.test(value)
        ? [value]
        : Array.from(
              value.matchAll(
                  /var\(\s*(--[\w-]+)\s*\)|#[0-9a-f]{3,8}|rgba?\([^)]*\)/gi,
              ),
          ).map((match) => (match[1] ? scope.get(match[1]) : match[0]));

    return stops
        .map((stop) => (stop === undefined ? null : resolveToken(stop, scope)))
        .filter((stop): stop is string => stop !== null && MEASURABLE.test(stop))
        .map((stop) => parseColorToRgb(stop))
        .filter((colour): colour is Rgb => colour !== null);
}

/**
 * Resolves one token to a colour, recording why it cannot be measured instead
 * of guessing. `parseColorToRgb` harvests numeric runs, so without the
 * `MEASURABLE` check an `hsl()` value or a gradient would be graded as a pair
 * the user never renders.
 */
function measurableColour(
    token: string,
    scope: Map<string, string>,
    label: string,
    failures: string[],
): Rgb | null {
    const raw = scope.get(token);
    if (raw === undefined) {
        failures.push(`${label}: ${token} not declared`);
        return null;
    }

    const literal = resolveToken(raw, scope);
    if (literal === null) {
        failures.push(`${label}: ${token} (${raw}) does not resolve to a colour`);
        return null;
    }
    if (!MEASURABLE.test(literal)) {
        failures.push(
            `${label}: ${token} (${literal}) uses a colour syntax this gate ` +
                `cannot measure`,
        );
        return null;
    }

    const colour = parseColorToRgb(literal);
    if (!colour) {
        failures.push(`${label}: ${token} (${literal}) does not parse as a colour`);
    }
    return colour;
}

/** `foreground` drawn at `opacity` over `backdrop`, per channel. */
function compositeOver(foreground: Rgb, backdrop: Rgb, opacity: number): Rgb {
    return foreground.map((channel, index) =>
        Math.round(opacity * channel + (1 - opacity) * backdrop[index]),
    ) as Rgb;
}

describe("BUG-0728 — filled button pairs meet AA in every theme", () => {
    it("covers every shipped theme and resolves both tokens of every role", () => {
        const scopes = themeScopes(parseBlocks(readThemesCss()));
        const { themes } = scopes;

        // A theme whose CSS block is renamed, wrapped in a descendant selector
        // or never written would otherwise drop out of the loop silently — the
        // root scope alone still contributes four passing pairs.
        expect(themes.length, "theme blocks parsed from themes.css").toBeGreaterThan(0);
        expect(
            ["dark", ...themes.map((theme) => theme.name)].sort(),
            "every shipped theme has one CSS scope",
        ).toEqual(Object.keys(THEME_BACKGROUNDS).sort());

        const markers = themeMarkers(scopes);

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
        const scopes = themeScopes(parseBlocks(readThemesCss()));
        const markers = themeMarkers(scopes);
        // The root scope stands in for `dark`, so markers and theme keys are
        // the same set — a dropped theme block must not shrink this silently.
        expect(markers.length, "one marker per shipped theme").toBe(
            Object.keys(THEME_BACKGROUNDS).length,
        );

        const scopeByLabel = new Map(
            markers.map((marker) => [marker.label, marker.scope]),
        );
        const failures: string[] = [];

        for (const [label, documentedFill] of DOCUMENTED_WARNING_FILLS) {
            const scope = scopeByLabel.get(label);
            if (scope === undefined) {
                failures.push(`${label}: no such theme scope`);
                continue;
            }

            const bg = measurableColour("--btn-warning-bg", scope, label, failures);
            const text = measurableColour(
                "--btn-warning-text",
                scope,
                label,
                failures,
            );
            if (!bg || !text) continue;

            // Compare colours, not notation: `#FACC15` and `rgb(250, 204, 21)`
            // are the same fill, and a false red on a harmless refactor is its
            // own bug.
            const expected = parseColorToRgb(documentedFill);
            const drifted =
                !expected ||
                bg.some((channel, index) => channel !== expected[index]);
            if (drifted) {
                failures.push(
                    `${label}: --btn-warning-bg is rgb(${bg.join(", ")}), the ` +
                        `item measured ${documentedFill}`,
                );
            }

            const ratio = contrastRatio(bg, text);
            if (ratio < MIN_CONTRAST) {
                failures.push(
                    `${label}: the warning label on ${documentedFill} is ` +
                        `${ratio.toFixed(2)}:1`,
                );
            }
        }

        expect(failures, "warning pair per documented theme").toEqual([]);
    });

    /**
     * `.btn-base.btn-warning:hover` only lowers the button's opacity, so the
     * backdrop shows through both the fill and the label. The rows that carry
     * the warning buttons are painted with `--bg-primary`
     * (`DataMaintenance.svelte`), so that is the surface composited here —
     * every stop of it where the theme paints a gradient.
     */
    it("keeps the warning label readable at the hover opacity", () => {
        const opacity = warningHoverOpacity();
        expect(
            Number.isFinite(opacity),
            "opacity of .btn-base.btn-warning:hover in themes.css",
        ).toBe(true);

        const scopes = themeScopes(parseBlocks(readThemesCss()));
        const markers = themeMarkers(scopes);
        // The root scope stands in for `dark`, so markers and theme keys are
        // the same set — a dropped theme block must not shrink this silently.
        expect(markers.length, "one marker per shipped theme").toBe(
            Object.keys(THEME_BACKGROUNDS).length,
        );

        const failures: string[] = [];
        for (const marker of markers) {
            const bg = measurableColour(
                "--btn-warning-bg",
                marker.scope,
                marker.label,
                failures,
            );
            const text = measurableColour(
                "--btn-warning-text",
                marker.scope,
                marker.label,
                failures,
            );
            if (!bg || !text) continue;

            const backdrops = backdropColours("--bg-primary", marker.scope);
            if (backdrops.length === 0) {
                failures.push(
                    `${marker.label}: --bg-primary is not a measurable backdrop`,
                );
                continue;
            }

            for (const backdrop of backdrops) {
                const ratio = contrastRatio(
                    compositeOver(bg, backdrop, opacity),
                    compositeOver(text, backdrop, opacity),
                );
                if (ratio < MIN_CONTRAST) {
                    failures.push(
                        `${marker.label}: the warning label at ${opacity} ` +
                            `opacity over rgb(${backdrop.join(", ")}) is ` +
                            `${ratio.toFixed(2)}:1`,
                    );
                }
            }
        }

        expect(failures, "warning hover pair").toEqual([]);
    });

    /**
     * BUG-0759 — the wiring, not the ratio. Reverting any consumer above to
     * `--bg-primary`, `--text-secondary` or `text-black` leaves every ratio in
     * this file intact, because the gate measures tokens, not rules. This test
     * is the one that names the rule that lost the token.
     */
    it("wires every warning-fill label to the warning ink", () => {
        const sources = new Map<string, string>();
        const read = (path: string): string => {
            const cached = sources.get(path);
            if (cached !== undefined) return cached;
            const text = readFileSync(join(process.cwd(), path), "utf-8");
            sources.set(path, text);
            return text;
        };

        const failures: string[] = [];
        for (const [source, site, pattern] of WARNING_LABEL_SITES) {
            if (!pattern.test(read(source))) {
                failures.push(`${source} ${site}: does not read the warning ink`);
            }
        }

        if (/--text-on-warning\s*,/.test(read("src/themes.css"))) {
            failures.push(
                "src/themes.css: a --text-on-warning reference still carries " +
                    "a fallback, so a missing declaration degrades silently",
            );
        }

        expect(failures, "warning label wiring").toEqual([]);
    });
});
