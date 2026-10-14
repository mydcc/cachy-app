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

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isLightTheme } from "./lib/themeBackgrounds";

/**
 * The global ::selection rule (src/app.css) paints marked text with
 * --accent-color/--text-on-accent, so every theme must define both tokens
 * with chains that actually resolve. Presence alone is not enough: a
 * `var(--typo)` reference parses fine but is invalid at computed-value
 * time, silently degrading the rule to the OS default in that theme.
 * Mirrors the readFileSync style of src/lib/windows/zLayers.test.ts.
 */

const SELECTION_TOKENS = ["--accent-color", "--text-on-accent"] as const;

function readThemesCss(): string {
  return readFileSync(join(process.cwd(), "src", "themes.css"), "utf-8");
}

/** Raw `name: value` declarations of one CSS block body. */
function parseDeclarations(body: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const [, name, value] of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    vars.set(`--${name}`, value.trim());
  }
  return vars;
}

/** Selector blocks: `:root, .theme-default` counts as the shared scope. */
function parseBlocks(css: string): Array<{ selector: string; vars: Map<string, string> }> {
  // Strip comments so braces inside them cannot confuse the split.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks: Array<{ selector: string; vars: Map<string, string> }> = [];
  for (const [, selector, body] of clean.matchAll(/([^{]+)\{([^}]*)\}/g)) {
    blocks.push({ selector: selector.trim(), vars: parseDeclarations(body) });
  }
  return blocks;
}

const VAR_PATTERN = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/;

/**
 * Follows a var() chain inside `scope` (block vars over :root vars).
 * Returns the literal it lands on, or null when the chain dangles with
 * no fallback to save it.
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

describe("theme selection tokens", () => {
  it("defines a resolvable --accent-color and --text-on-accent in every theme", () => {
    const blocks = parseBlocks(readThemesCss());
    const root = blocks.find((b) => b.selector.includes(":root"));
    expect(root, ":root block with shared tokens must exist").toBeDefined();
    const themeBlocks = blocks.filter((b) => /\.theme-[\w-]+/.test(b.selector));
    expect(themeBlocks.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const block of themeBlocks) {
      const scope = new Map([...(root?.vars ?? []), ...block.vars]);
      for (const token of SELECTION_TOKENS) {
        const raw = scope.get(token);
        if (raw === undefined) {
          failures.push(`${block.selector}: ${token} not defined`);
          continue;
        }
        if (resolveToken(raw, scope) === null) {
          failures.push(`${block.selector}: ${token} dangles (${raw})`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("declares color-scheme: light for exactly the light themes", () => {
    // src/app.css defaults native controls to dark and overrides the light
    // themes. Both lists must move together, or a new light theme silently
    // keeps dark-styled native popups.
    const appCss = readFileSync(join(process.cwd(), "src", "app.css"), "utf-8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const lightBlock = appCss.match(/([^{}]+)\{\s*color-scheme:\s*light\s*;?\s*\}/);
    expect(lightBlock, "no color-scheme: light block found in src/app.css").not.toBeNull();
    const declared = new Set(
      [...lightBlock![1].matchAll(/\.theme-([\w-]+)/g)].map((match) => match[1]),
    );
    const blocks = parseBlocks(readThemesCss());
    const expected = new Set(
      blocks
        .flatMap((block) => [...block.selector.matchAll(/\.theme-([\w-]+)/g)])
        .map((match) => match[1])
        .filter((name) => isLightTheme(name)),
    );
    expect([...declared].sort()).toEqual([...expected].sort());
  });
});
