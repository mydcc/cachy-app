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
import { parseBlocks, readThemesCss, resolveToken } from "./tests/helpers/themeCss";

/**
 * The global ::selection rule (src/app.css) paints marked text with
 * --accent-color/--text-on-accent, so every theme must define both tokens
 * with chains that actually resolve. Presence alone is not enough: a
 * `var(--typo)` reference parses fine but is invalid at computed-value
 * time, silently degrading the rule to the OS default in that theme.
 * Mirrors the readFileSync style of src/lib/windows/zLayers.test.ts.
 */

const SELECTION_TOKENS = ["--accent-color", "--text-on-accent"] as const;

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
