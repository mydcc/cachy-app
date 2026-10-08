/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
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
 * `stripNonCode` decides what the two settings guards are allowed to see, so
 * its own failure mode is a guard that passes for the wrong reason. The version
 * it replaced — five chained regex replacements, literals before comments — lost
 * 61% of `settings.svelte.ts` and 9 real `settingsState.<key> =` write sites
 * across `src`, because an apostrophe in a comment opened a "string" that ran to
 * the next apostrophe.
 *
 * These tests are here so that regression cannot come back quietly. The
 * repo-wide one is the assertion that would have caught it.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { stripNonCode, methodBody } from "./sourceScan";

// From src/stores/settings/, the repo root is three levels up.
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SRC = join(ROOT, "src");

describe("stripNonCode", () => {
  it("keeps an apostrophe inside a comment from swallowing the code after it", () => {
    const source = [
      "// the user's choice, per their note",
      "settingsState.showSidebars = true;",
      "const a = 1;",
    ].join("\n");
    const stripped = stripNonCode(source);
    expect(stripped).toContain("settingsState.showSidebars = true;");
    expect(stripped).toContain("const a = 1;");
  });

  it("keeps a // inside a string literal from swallowing the rest of the line", () => {
    const source = [
      'const url = "https://example.com/x";',
      "settingsState.showTooltips = false;",
    ].join("\n");
    const stripped = stripNonCode(source);
    expect(stripped).toContain("settingsState.showTooltips = false;");
  });

  it("removes writes that really are inside a comment or a string", () => {
    const source = [
      "// settingsState.ghost = 1;",
      "/* settingsState.ghost2 = 2; */",
      'const s = "settingsState.ghost3 = 3;";',
      "<!-- settingsState.ghost4 = 4; -->",
    ].join("\n");
    const stripped = stripNonCode(source);
    for (const ghost of ["ghost", "ghost2", "ghost3", "ghost4"]) {
      expect(stripped).not.toContain(ghost);
    }
  });

  it("stops an unterminated quote at the newline instead of blanking the file", () => {
    const source = ["const a = 'oops", "settingsState.showSidebars = true;"].join("\n");
    expect(stripNonCode(source)).toContain("settingsState.showSidebars = true;");
  });

  it("keeps line numbers stable, so a failure points at the right line", () => {
    const source = ["/* one", " * two", " */", "const a = 1;", 'const b = "x";'].join("\n");
    expect(stripNonCode(source).split("\n")).toHaveLength(
      source.split("\n").length,
    );
  });

  it("loses no settings write anywhere under src", () => {
    const write = /settingsState\.[A-Za-z_][A-Za-z0-9_]*\s*=(?!=)/g;
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.(ts|svelte)$/.test(entry.name) && !/\.(test|bench|benchmark)\./.test(entry.name))
          files.push(p);
      }
    };
    walk(SRC);

    const lossy: string[] = [];
    for (const file of files) {
      const raw = readFileSync(file, "utf8");
      const before = [...raw.matchAll(write)].length;
      const after = [...stripNonCode(raw).matchAll(write)].length;
      if (before !== after)
        lossy.push(`${relative(ROOT, file)}: ${before} writes, ${after} visible`);
    }

    expect(lossy, `stripNonCode hid real write sites:\n${lossy.join("\n")}`).toEqual(
      [],
    );
    // So the walk above cannot pass by finding no files at all.
    expect(files.length).toBeGreaterThan(100);
  });
});

describe("methodBody", () => {
  it("returns a whole method, braces inside strings and comments included", () => {
    const source = [
      "  private alpha(o: Settings) {",
      "    // } not the end",
      '    const s = "}";',
      "    this.x = o.x;",
      "  }",
      "  private beta() {",
      "    this.y = 1;",
      "  }",
    ].join("\n");
    const body = methodBody(source, /private alpha\(/);
    expect(body).toContain("this.x = o.x;");
    expect(body).not.toContain("this.y = 1;");
  });

  it("throws rather than returning nothing when the signature is absent", () => {
    expect(() => methodBody("class A {}", /private missing\(/)).toThrow(
      /method not found/,
    );
  });
});