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

// @vitest-environment node
//
// This test walks the source tree from disk. Under the happy-dom default set in
// vite.config.ts, import.meta.url is not a file:// URL and readFileSync rejects
// it. No DOM is needed here, so pin the node environment.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/**
 * Keeps `.env.example` honest.
 *
 * `APP_ACCESS_TOKEN` was undocumented, so nobody set it, so authentication had
 * to fail open to work at all — see ADR-0002. The fix was writing the variable
 * down; this test is what stops the next one from going the same way. Every
 * environment variable the server code reads must appear in `.env.example`,
 * whether required or optional, commented out or not.
 *
 * Roadmap item 24b.
 */

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

/**
 * Variables that are read but are not operator configuration, so documenting
 * them in `.env.example` would be misleading rather than helpful.
 */
const NOT_OPERATOR_CONFIG = new Set([
  // Set by vitest itself. src/lib/server/chatStore.ts checks it to skip disk
  // access during tests; an operator never sets it.
  "VITEST",
]);

/** Source files whose env reads count. Tests configure their own fixtures. */
function collectSourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === "node_modules" || entry === ".svelte-kit") continue;
      collectSourceFiles(path, found);
      continue;
    }
    if (!/\.(ts|js|svelte)$/.test(entry)) continue;
    if (/\.(test|spec|bench)\.(ts|js)$/.test(entry)) continue;
    found.push(path);
  }
  return found;
}

/**
 * Finds `process.env.NAME` and — for the `$env/dynamic/private` import — bare
 * `env.NAME`. Vite's own `import.meta.env.*` is stripped first: `DEV`, `PROD`
 * and friends are build flags, not deployment configuration.
 */
function envVarsIn(source: string): string[] {
  const withoutViteEnv = source.replace(/import\.meta\.env\.\w+/g, "");
  const names = new Set<string>();

  for (const [, name] of withoutViteEnv.matchAll(
    /process\.env\.([A-Z][A-Z0-9_]*)/g,
  )) {
    names.add(name);
  }
  for (const [, name] of withoutViteEnv.matchAll(/\benv\.([A-Z][A-Z0-9_]*)/g)) {
    names.add(name);
  }

  return [...names];
}

describe(".env.example documents every environment variable the code reads", () => {
  const envExample = readFileSync(join(repoRoot, ".env.example"), "utf-8");

  const files = [
    ...collectSourceFiles(join(repoRoot, "src")),
    join(repoRoot, "server.js"),
  ];

  const usages = new Map<string, string[]>();
  for (const file of files) {
    for (const name of envVarsIn(readFileSync(file, "utf-8"))) {
      if (NOT_OPERATOR_CONFIG.has(name)) continue;
      const relative = file.slice(repoRoot.length);
      usages.set(name, [...(usages.get(name) ?? []), relative]);
    }
  }

  it("finds the variables it is supposed to be checking", () => {
    // Guards the scanner itself: a regex that silently matches nothing would
    // make every assertion below pass vacuously.
    expect(usages.has("APP_ACCESS_TOKEN")).toBe(true);
    expect(usages.size).toBeGreaterThan(3);
  });

  it.each([...usages.keys()].sort())("documents %s", (name) => {
    // Matches the variable at the start of a line, optionally commented out, as
    // both `NAME=` and `# NAME=` are documentation.
    const documented = new RegExp(`^#?\\s*${name}=`, "m").test(envExample);

    expect(
      documented,
      `${name} is read by ${usages.get(name)!.join(", ")} but is not in .env.example. ` +
        `Add it there — as a commented-out line if it is optional.`,
    ).toBe(true);
  });
});
