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
// This test reads package.json from disk. Under the happy-dom default set in
// vite.config.ts, import.meta.url is not a file:// URL and readFileSync rejects
// it. No DOM is needed here, so pin the node environment.

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { APP_VERSION } from "./version";

/**
 * Regression guard for the version pipeline.
 *
 * This previously broke silently: package.json had no `version` field, so
 * `process.env.npm_package_version` was undefined, and the app footer rendered
 * the literal string "undefined". These tests fail loudly if any link in the
 * chain (package.json -> vite define -> APP_VERSION) comes apart again.
 */
describe("APP_VERSION", () => {
  const pkg = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf-8"),
  ) as { version?: string };

  it("package.json declares a version field", () => {
    expect(pkg.version).toBeDefined();
    expect(pkg.version).not.toBe("");
  });

  it("package.json version is valid semver", () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  });

  it("matches the version declared in package.json", () => {
    expect(APP_VERSION).toBe(pkg.version);
  });

  it("is never the undefined-ish value that shipped to users before", () => {
    expect(APP_VERSION).not.toBe("undefined");
    expect(APP_VERSION).not.toBe("0.0.0");
    expect(APP_VERSION).not.toBe("0.0.0-unknown");
  });
});
