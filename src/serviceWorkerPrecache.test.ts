/*
 * Copyright (C) 2026 MYDCC
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
 * The service worker's cache-first path is guarded here because its failure is
 * invisible everywhere else: no unit test mounts a service worker, and the
 * production build only type-checks it. The regression this pins down was
 * introduced by the SvelteKit 3 migration (FEAT-0629) — `$app/manifest`
 * replaced `$service-worker`, and the manifest reports paths relative to the
 * base path (`_app/immutable/entry/start.<hash>.js`) while the fetch handler
 * compares against `url.pathname`, which is absolute (`/_app/…`). Every
 * `ASSETS.includes(...)` then missed and immutable assets stopped being served
 * from cache — with a green build and green CI throughout.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const serviceWorkerPath = fileURLToPath(
  new URL("./service-worker/index.ts", import.meta.url),
);
const source = readFileSync(serviceWorkerPath, "utf-8");

describe("service worker precache list (FEAT-0629)", () => {
  it("resolves manifest paths to absolute pathnames before matching them", () => {
    // Both manifest sources must go through asset(): a bare `.path` is
    // relative and can never equal `url.pathname`.
    expect(source).toMatch(/immutable\.map\(\([^)]*\) => asset\(/);
    expect(source).toMatch(/assets\.map\(\([^)]*\) => asset\(/);
    // The regression shape: the arrow body *is* the raw relative path.
    // Deliberately narrow — a loose `\.path` check also matches the correct
    // `asset(entry.path as AssetPath)` and goes red on a working fix.
    expect(source).not.toMatch(/immutable\.map\(\(\w+\) => \w+\.path\s*[,)]/);
    expect(source).not.toMatch(/assets\.map\(\(\w+\) => \w+\.path\s*[,)]/);
  });

  it("imports asset from $app/paths", () => {
    expect(source).toMatch(/import\s*{[^}]*\basset\b[^}]*}\s*from\s*"\$app\/paths"/);
  });

  it("widens the precache list to string[] so includes(url.pathname) type-checks", () => {
    expect(source).toMatch(/const ASSETS:\s*string\[\]/);
  });

  it("still matches the asset list against url.pathname", () => {
    // The comparison the whole cache-first branch hangs on.
    expect(source).toMatch(/ASSETS\.includes\(\s*url\.pathname\s*\)/);
  });

  it("applies the not-precached list and only names files that exist", () => {
    // FEAT-0775: an exclusion is invisible when it is wrong — a typo'd path
    // excludes nothing, the install keeps downloading the file, and no test
    // notices. Tie every entry to a real file in static/.
    const block = source.match(/const NOT_PRECACHED = \[([\s\S]*?)\];/)?.[1] ?? "";
    const listed = [...block.matchAll(/"(\/[^"]+)"/g)].map((match) => match[1]);
    expect(listed.length).toBeGreaterThan(0);
    for (const path of listed) {
      const file = fileURLToPath(new URL(`../static${path}`, import.meta.url));
      expect(existsSync(file), `${path} does not exist under static/`).toBe(true);
    }
    expect(source).toMatch(
      /const ASSETS:[\s\S]*?\.filter\(\(path\) => !NOT_PRECACHED\.some\(\(skip\) => path\.endsWith\(skip\)\)\)/,
    );
  });
});
