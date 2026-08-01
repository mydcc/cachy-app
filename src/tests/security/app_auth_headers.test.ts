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
 * Keeps the client in step with `checkAppAuth`.
 *
 * Since ADR-0002 authentication fails closed: every route that calls
 * `checkAppAuth` answers 401 unless the caller sends `x-app-access-token`. That
 * makes a plain `fetch("/api/orders", …)` a silent breakage — it compiles, it
 * type-checks, and it fails only in the browser of whoever deployed it.
 *
 * It has already happened twice. `chat.svelte.ts` never sent the header
 * (docs/archive/engineering-log-2026-h1.md, item 12), and the balance,
 * account, positions and orders call sites did not either. Both were found
 * from console output rather than from CI.
 *
 * So: client code reaches guarded routes through `appFetch` from
 * `$lib/appAuth`, and this test fails the build when a raw `fetch` slips back
 * in.
 */

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

/** Directories holding code that runs in the browser. */
const CLIENT_DIRS = ["src/components", "src/services", "src/stores", "src/routes"];

/** `+server.ts` files are the routes themselves, not clients of them. */
function collectClientFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === "node_modules" || entry === ".svelte-kit") continue;
      collectClientFiles(path, found);
      continue;
    }
    if (!/\.(ts|js|svelte)$/.test(entry)) continue;
    if (/\.(test|spec|bench)\.(ts|js)$/.test(entry)) continue;
    if (entry === "+server.ts" || entry === "+server.js") continue;
    found.push(path);
  }
  return found;
}

/** Every `src/routes/api/**\/+server.ts` that calls `checkAppAuth`. */
function collectGuardedRoutes(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      collectGuardedRoutes(path, found);
      continue;
    }
    if (entry !== "+server.ts") continue;
    if (!/\bcheckAppAuth\s*\(/.test(readFileSync(path, "utf-8"))) continue;

    // src/routes/api/sync/orders/+server.ts -> /api/sync/orders
    const route = path
      .slice(join(repoRoot, "src/routes").length)
      .replace(/[/\\]\+server\.ts$/, "")
      .replace(/\\/g, "/");
    found.push(route);
  }
  return found;
}

/**
 * Call sites of the global `fetch` with a literal `/api/...` path, as
 * `fetch("/api/x"`, `fetch(`/api/x`` or `await fetch('/api/x'`. Deliberately
 * literal-only: a computed URL cannot be resolved statically, and guessing at
 * one would trade a useful signal for false alarms.
 *
 * `appFetch(...)` does not match — the pattern requires `fetch` to start the
 * identifier, so the helper's own call sites pass.
 */
function rawApiFetches(source: string): string[] {
  const paths: string[] = [];
  for (const [, path] of source.matchAll(
    /(?<![.\w])fetch\s*\(\s*[`'"](\/api\/[^`'"?\s]*)/g,
  )) {
    paths.push(path);
  }
  return paths;
}

describe("client callers of guarded API routes send the app access token", () => {
  const guardedRoutes = collectGuardedRoutes(join(repoRoot, "src/routes/api"));

  const clientFiles = CLIENT_DIRS.flatMap((dir) =>
    collectClientFiles(join(repoRoot, dir)),
  );

  it("finds the routes and files it is supposed to be checking", () => {
    // Guards the scanner itself: a regex that silently matches nothing would
    // make every assertion below pass vacuously.
    expect(guardedRoutes).toContain("/api/orders");
    expect(guardedRoutes).toContain("/api/balance");
    expect(guardedRoutes.length).toBeGreaterThan(10);
    expect(clientFiles.length).toBeGreaterThan(20);
  });

  it("recognises a raw fetch when it sees one", () => {
    // The scanner is the whole test. If `rawApiFetches` stopped matching, the
    // audit below would report a clean bill of health for any codebase at all.
    expect(rawApiFetches('await fetch("/api/orders", { method: "POST" })')).toEqual([
      "/api/orders",
    ]);
    expect(rawApiFetches("fetch(`/api/tickers?${q}`)")).toEqual(["/api/tickers"]);
    expect(rawApiFetches('appFetch("/api/orders")')).toEqual([]);
  });

  it("routes every guarded call through appFetch", () => {
    const offenders: string[] = [];

    for (const file of clientFiles) {
      const source = readFileSync(file, "utf-8");
      for (const path of rawApiFetches(source)) {
        if (!guardedRoutes.includes(path)) continue;
        offenders.push(`${file.slice(repoRoot.length)} -> ${path}`);
      }
    }

    expect(
      offenders,
      "These call plain fetch() on a route guarded by checkAppAuth, so the " +
        "server answers 401. Use appFetch from $lib/appAuth instead:\n" +
        offenders.map((o) => `  ${o}`).join("\n"),
    ).toEqual([]);
  });
});
